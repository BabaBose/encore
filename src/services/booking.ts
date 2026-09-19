/**
 * Booking service.
 *
 * This is where the spec's cross-cutting promises are kept together, because
 * they have to happen or not happen as one:
 *
 *   - a confirmation blocks the dates instantly, with no manual re-entry
 *   - a cancellation releases them again
 *   - both parties are notified of every move
 *   - every move is written to the audit log with its actor and reason
 *
 * Splitting these across call sites is how a calendar drifts out of sync with
 * its bookings, so they run inside one transaction.
 */
import type { Db } from '@/db/client';
import * as repo from '@/db/repo';
import { DoubleBookingError, blockForBooking } from '@/domain/availability';
import { applyTransition, STATUS_LABEL } from '@/domain/inquiry';
import { quoteHourly, quoteResidency, type RateCard } from '@/domain/rates';
import { addDays, addMonths } from '@/domain/dates';
import type { GigType, InquiryActor, InquiryStatus, IsoDate, TimeBlock } from '@/domain/types';
import { formatMoney } from '@/lib/format';

export interface InquiryDraft {
  venueId: string;
  entertainerId: string;
  gigType: GigType;
  startDate?: IsoDate | null;
  endDate?: IsoDate | null;
  timeBlock?: TimeBlock | null;
  hours?: number | null;
  months?: number | null;
  daysPerWeek?: number | null;
  cityId?: string | null;
  eventType?: string | null;
  notes?: string | null;
  /** The venue's proposed offer, defaulting to the resolved rate. */
  offerAmount?: number | null;
}

export interface PriceQuote {
  currency: string;
  amount: number;
  basis: 'hourly' | 'residency';
  label: string;
  detail: string;
}

/**
 * What the inquiry form pre-fills with. The venue may edit the offer, but the
 * quote it starts from always comes from the entertainer's published rules.
 */
export function quoteFor(card: RateCard, draft: InquiryDraft): PriceQuote {
  if (draft.gigType === 'long_term') {
    const months = draft.months ?? 1;
    const daysPerWeek = draft.daysPerWeek ?? card.residency?.daysPerWeekIncluded ?? 5;
    const quote = quoteResidency(card, months, daysPerWeek);
    const extra = quote.extraDaysPerWeek
      ? ` · ${quote.extraDaysPerWeek} extra day${quote.extraDaysPerWeek > 1 ? 's' : ''}/week`
      : '';
    return {
      currency: quote.currency,
      amount: quote.monthlyTotal,
      basis: 'residency',
      label: `${months}-month residency`,
      detail: `${daysPerWeek} nights/week${extra} · ${formatMoney(quote.monthlyTotal, quote.currency)}/month`,
    };
  }

  if (!draft.startDate) throw new Error('A one-off inquiry needs a date');
  const hours = draft.hours ?? card.minimumHours;
  const quote = quoteHourly(card, draft.startDate, draft.timeBlock ?? 'evening', hours);
  const minimumNote = quote.minimumApplied ? ` (${quote.minimumHours} hr minimum applied)` : '';
  return {
    currency: quote.currency,
    amount: quote.total,
    basis: 'hourly',
    label: quote.label,
    detail: `${quote.billableHours} hr × ${formatMoney(quote.hourly, quote.currency)}${minimumNote}`,
  };
}

/** The date range an inquiry covers, whichever kind it is. */
export function inquiryRange(inquiry: {
  gigType: GigType;
  startDate: IsoDate | null;
  endDate: IsoDate | null;
  months: number | null;
}): { start: IsoDate; end: IsoDate } | null {
  if (!inquiry.startDate) return null;
  if (inquiry.gigType === 'long_term') {
    return { start: inquiry.startDate, end: addDays(addMonths(inquiry.startDate, inquiry.months ?? 1), -1) };
  }
  return { start: inquiry.startDate, end: inquiry.endDate ?? inquiry.startDate };
}

export async function sendInquiry(db: Db, draft: InquiryDraft): Promise<string> {
  const entertainer = await repo.getEntertainerById(db, draft.entertainerId);
  if (!entertainer) throw new Error('No such entertainer');
  if (!entertainer.isLive) throw new Error('This profile is not accepting inquiries');

  const quote = quoteFor(entertainer.rateCard, draft);
  const offer = draft.offerAmount ?? quote.amount;

  return db.transaction(async (tx) => {
    const id = await repo.createInquiry(tx, {
      venueId: draft.venueId,
      entertainerId: draft.entertainerId,
      gigType: draft.gigType,
      startDate: draft.startDate,
      endDate: draft.endDate,
      timeBlock: draft.timeBlock,
      hours: draft.hours,
      months: draft.months,
      daysPerWeek: draft.daysPerWeek,
      cityId: draft.cityId,
      eventType: draft.eventType,
      notes: draft.notes,
      currency: quote.currency,
      quotedAmount: quote.amount,
      offerAmount: offer,
      rateBasis: quote.basis,
    });

    const venue = await repo.getVenueById(tx, draft.venueId);
    const title = `New inquiry from ${venue?.name ?? 'a venue'}`;
    const body = `${quote.label} · ${formatMoney(offer, quote.currency)}`;
    await repo.notify(tx, { userId: entertainer.userId, kind: 'inquiry_received', title, body, link: `/app/inquiries/${id}` });
    if (entertainer.managedByUserId) {
      await repo.notify(tx, {
        userId: entertainer.managedByUserId,
        kind: 'inquiry_received',
        title: `${entertainer.stageName}: ${title.toLowerCase()}`,
        body,
        link: `/app/inquiries/${id}`,
      });
    }
    return id;
  });
}

export interface TransitionRequest {
  inquiryId: string;
  to: InquiryStatus;
  actor: InquiryActor;
  actorUserId: string;
  reason?: string | null;
  offer?: number | null;
}

export class BookingConflictError extends Error {
  constructor(public readonly conflicts: IsoDate[]) {
    super(
      `Those dates are already committed on this calendar: ${conflicts.join(', ')}. ` +
        'Cancel the other booking first, or agree a new date in the thread.',
    );
    this.name = 'BookingConflictError';
  }
}

/**
 * Move an inquiry, and do everything that move implies.
 *
 * The domain layer decides whether the move is legal and whether dates change
 * hands; this function carries that out against the database and tells both
 * parties.
 */
export async function transitionInquiry(db: Db, req: TransitionRequest): Promise<InquiryStatus> {
  const inquiry = await repo.getInquiry(db, req.inquiryId);
  if (!inquiry) throw new Error('No such inquiry');

  const outcome = applyTransition({
    from: inquiry.status,
    to: req.to,
    actor: req.actor,
    reason: req.reason,
    offer: req.offer,
  });

  return db.transaction(async (tx) => {
    if (outcome.holdsDates) {
      const range = inquiryRange(inquiry);
      if (!range) throw new Error('This inquiry has no dates to confirm');
      const existing = await repo.loadBlocks(tx, inquiry.entertainerId);
      try {
        const block = blockForBooking(existing, {
          id: inquiry.id,
          start: range.start,
          end: range.end,
          note: `${inquiry.venueName} · ${STATUS_LABEL[req.to]}`,
        });
        await repo.insertBlock(tx, inquiry.entertainerId, block);
      } catch (err) {
        if (err instanceof DoubleBookingError) throw new BookingConflictError(err.conflicts);
        throw err;
      }
    }

    if (outcome.releasesDates) await repo.deleteBookingBlocks(tx, inquiry.id);

    await repo.updateInquiryStatus(tx, inquiry.id, outcome.status, {
      offerAmount: outcome.offer,
      cancelReason: outcome.status === 'cancelled' || outcome.status === 'declined' ? outcome.reason : null,
    });
    await repo.recordInquiryEvent(tx, {
      inquiryId: inquiry.id,
      from: inquiry.status,
      to: outcome.status,
      actor: req.actor,
      actorId: req.actorUserId,
      reason: outcome.reason,
      offer: outcome.offer,
    });

    await notifyBothParties(tx, inquiry, outcome.status, outcome.offer, outcome.reason);
    return outcome.status;
  });
}

async function notifyBothParties(
  db: Db,
  inquiry: repo.InquiryRow,
  status: InquiryStatus,
  offer: number | null,
  reason: string | null,
): Promise<void> {
  const link = `/app/inquiries/${inquiry.id}`;
  const amount = formatMoney(offer ?? inquiry.offerAmount, inquiry.currency);
  const whenLabel = inquiry.gigType === 'long_term' ? `${inquiry.months}-month residency` : inquiry.startDate ?? '';

  const messages: Partial<Record<InquiryStatus, { venue: string; entertainer: string }>> = {
    viewed: {
      venue: `${inquiry.entertainerName} has viewed your inquiry`,
      entertainer: `You viewed ${inquiry.venueName}'s inquiry`,
    },
    accepted: {
      venue: `${inquiry.entertainerName} accepted your offer`,
      entertainer: `You accepted ${inquiry.venueName}'s offer`,
    },
    countered: {
      venue: `${inquiry.entertainerName} countered at ${amount}`,
      entertainer: `Counter-offer of ${amount} sent to ${inquiry.venueName}`,
    },
    declined: {
      venue: `${inquiry.entertainerName} declined${reason ? `: ${reason}` : ''}`,
      entertainer: `You declined ${inquiry.venueName}'s inquiry`,
    },
    confirmed: {
      venue: `Booking confirmed with ${inquiry.entertainerName} · ${whenLabel}`,
      entertainer: `Booking confirmed with ${inquiry.venueName} · ${whenLabel}`,
    },
    completed: {
      venue: `Gig completed — leave ${inquiry.entertainerName} a review`,
      entertainer: `Gig with ${inquiry.venueName} marked completed`,
    },
    cancelled: {
      venue: `Booking cancelled${reason ? `: ${reason}` : ''}`,
      entertainer: `Booking cancelled${reason ? `: ${reason}` : ''}`,
    },
  };

  const pair = messages[status];
  if (!pair) return;

  await repo.notify(db, {
    userId: inquiry.venueUserId,
    kind: `inquiry_${status}`,
    title: pair.venue,
    body: `${whenLabel} · ${amount}`,
    link,
  });
  await repo.notify(db, {
    userId: inquiry.entertainerUserId,
    kind: `inquiry_${status}`,
    title: pair.entertainer,
    body: `${whenLabel} · ${amount}`,
    link,
  });
  // An agency handling the act's calendar needs to hear it too.
  if (inquiry.entertainerManagerId) {
    await repo.notify(db, {
      userId: inquiry.entertainerManagerId,
      kind: `inquiry_${status}`,
      title: `${inquiry.entertainerName}: ${pair.entertainer}`,
      body: `${whenLabel} · ${amount}`,
      link,
    });
  }
}

/** Post-gig verified review, only ever from a completed booking. */
export async function leaveReview(
  db: Db,
  input: { inquiryId: string; venueUserId: string; rating: number; body: string },
): Promise<void> {
  const inquiry = await repo.getInquiry(db, input.inquiryId);
  if (!inquiry) throw new Error('No such inquiry');
  if (inquiry.venueUserId !== input.venueUserId) throw new Error('Only the booking venue can review this gig');
  if (inquiry.status !== 'completed') throw new Error('A review can only follow a completed booking');
  if (await repo.reviewForInquiry(db, input.inquiryId)) throw new Error('This booking has already been reviewed');
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    throw new RangeError('A rating must be a whole number from 1 to 5');
  }

  await db.transaction(async (tx) => {
    await repo.createReview(tx, {
      inquiryId: inquiry.id,
      entertainerId: inquiry.entertainerId,
      venueId: inquiry.venueId,
      rating: input.rating,
      body: input.body,
    });
    await repo.notify(tx, {
      userId: inquiry.entertainerUserId,
      kind: 'review_received',
      title: `${inquiry.venueName} left you a ${input.rating}-star review`,
      body: input.body.slice(0, 140),
      link: `/entertainers/${inquiry.entertainerSlug}`,
    });
  });
}

export async function postMessage(
  db: Db,
  inquiryId: string,
  senderUserId: string,
  body: string,
): Promise<void> {
  const inquiry = await repo.getInquiry(db, inquiryId);
  if (!inquiry) throw new Error('No such inquiry');
  const trimmed = body.trim();
  if (!trimmed) throw new Error('A message cannot be empty');

  const recipientId =
    senderUserId === inquiry.venueUserId ? inquiry.entertainerUserId : inquiry.venueUserId;
  const senderName = senderUserId === inquiry.venueUserId ? inquiry.venueName : inquiry.entertainerName;

  await db.transaction(async (tx) => {
    await repo.addMessage(tx, inquiryId, senderUserId, trimmed);
    await repo.notify(tx, {
      userId: recipientId,
      kind: 'message',
      title: `New message from ${senderName}`,
      body: trimmed.slice(0, 140),
      link: `/app/inquiries/${inquiryId}`,
    });
  });
}

/** Who is allowed to see or act on this inquiry. */
export function accessRoleFor(
  inquiry: repo.InquiryRow,
  user: { id: string; role: string },
): InquiryActor | null {
  if (user.role === 'admin') return 'admin';
  if (user.id === inquiry.venueUserId) return 'venue';
  // An agency or manager acts on behalf of the act it represents.
  if (user.id === inquiry.entertainerUserId || user.id === inquiry.entertainerManagerId) return 'entertainer';
  return null;
}
