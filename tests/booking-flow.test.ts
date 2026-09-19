import { describe, expect, it } from 'vitest';
import { makeFixture, type Fixture } from './helpers';
import * as repo from '@/db/repo';
import {
  BookingConflictError,
  accessRoleFor,
  leaveReview,
  postMessage,
  quoteFor,
  sendInquiry,
  transitionInquiry,
} from '@/services/booking';
import { dayAvailability } from '@/domain/availability';
import { InvalidTransitionError } from '@/domain/inquiry';

describe('sending an inquiry', () => {
  it('pre-fills the offer from the act’s own rate rules', async () => {
    const f = await makeFixture();
    const id = await sendInquiry(f.db, {
      venueId: f.venueId,
      entertainerId: f.entertainerId,
      gigType: 'one_time',
      startDate: '2026-12-31',
      timeBlock: 'late_night',
      hours: 4,
    });
    const inquiry = (await repo.getInquiry(f.db, id))!;
    // The NYE override, four hours, not the Thursday late-night rule.
    expect(inquiry.quotedAmount).toBe(340000 * 4);
    expect(inquiry.offerAmount).toBe(inquiry.quotedAmount);
    expect(inquiry.status).toBe('new');
  });

  it('lets the venue propose a different amount', async () => {
    const f = await makeFixture();
    const id = await sendInquiry(f.db, {
      venueId: f.venueId,
      entertainerId: f.entertainerId,
      gigType: 'one_time',
      startDate: '2026-12-31',
      timeBlock: 'late_night',
      hours: 4,
      offerAmount: 1000000,
    });
    const inquiry = (await repo.getInquiry(f.db, id))!;
    expect(inquiry.offerAmount).toBe(1000000);
    expect(inquiry.quotedAmount).toBe(340000 * 4);
  });

  it('prices a residency as a monthly package', async () => {
    const f = await makeFixture();
    const act = (await repo.getEntertainerById(f.db, f.entertainerId))!;
    const quote = quoteFor(act.rateCard, {
      venueId: f.venueId,
      entertainerId: f.entertainerId,
      gigType: 'long_term',
      months: 6,
      daysPerWeek: 4,
    });
    expect(quote.basis).toBe('residency');
    expect(quote.amount).toBe(1400000);
  });

  it('notifies the entertainer', async () => {
    const f = await makeFixture();
    await sendInquiry(f.db, {
      venueId: f.venueId,
      entertainerId: f.entertainerId,
      gigType: 'one_time',
      startDate: '2026-12-31',
      hours: 4,
    });
    const notes = await repo.listNotifications(f.db, f.entertainerUserId);
    expect(notes[0]?.kind).toBe('inquiry_received');
  });

  it('refuses an inquiry to a profile that is not live', async () => {
    const f = await makeFixture();
    await repo.updateEntertainerStatus(f.db, f.entertainerId, 'suspended', 'Under review');
    await expect(sendInquiry(f.db, {
        venueId: f.venueId,
        entertainerId: f.entertainerId,
        gigType: 'one_time',
        startDate: '2026-12-31',
        hours: 4,
      })).rejects.toThrow(/not accepting inquiries/);
  });
});

describe('the booking lifecycle', () => {
  async function openInquiry(f: Fixture, date = '2026-12-31') {
    return sendInquiry(f.db, {
      venueId: f.venueId,
      entertainerId: f.entertainerId,
      gigType: 'one_time',
      startDate: date,
      timeBlock: 'late_night',
      hours: 4,
    });
  }

  it('blocks the dates the instant a booking is confirmed', async () => {
    const f = await makeFixture();
    const id = await openInquiry(f);
    await transitionInquiry(f.db, { inquiryId: id, to: 'accepted', actor: 'entertainer', actorUserId: f.entertainerUserId });

    expect(dayAvailability(await repo.loadBlocks(f.db, f.entertainerId), '2026-12-31').status).toBe('available');

    await transitionInquiry(f.db, { inquiryId: id, to: 'confirmed', actor: 'entertainer', actorUserId: f.entertainerUserId });

    const day = dayAvailability(await repo.loadBlocks(f.db, f.entertainerId), '2026-12-31');
    expect(day.status).toBe('booked');
    expect(day.blocks[0]?.bookingId).toBe(id);
  });

  it('refuses to double-commit a date another booking already holds', async () => {
    const f = await makeFixture();
    const first = await openInquiry(f);
    await transitionInquiry(f.db, { inquiryId: first, to: 'accepted', actor: 'entertainer', actorUserId: f.entertainerUserId });
    await transitionInquiry(f.db, { inquiryId: first, to: 'confirmed', actor: 'entertainer', actorUserId: f.entertainerUserId });

    const second = await openInquiry(f);
    await transitionInquiry(f.db, { inquiryId: second, to: 'accepted', actor: 'entertainer', actorUserId: f.entertainerUserId });
    await expect(transitionInquiry(f.db, { inquiryId: second, to: 'confirmed', actor: 'entertainer', actorUserId: f.entertainerUserId })).rejects.toThrow(BookingConflictError);

    // The failed confirmation leaves nothing behind.
    expect((await repo.getInquiry(f.db, second))!.status).toBe('accepted');
    expect((await repo.loadBlocks(f.db, f.entertainerId)).filter((b) => b.source === 'booking')).toHaveLength(1);
  });

  it('frees the dates again when a confirmed booking is cancelled', async () => {
    const f = await makeFixture();
    const id = await openInquiry(f);
    await transitionInquiry(f.db, { inquiryId: id, to: 'accepted', actor: 'entertainer', actorUserId: f.entertainerUserId });
    await transitionInquiry(f.db, { inquiryId: id, to: 'confirmed', actor: 'entertainer', actorUserId: f.entertainerUserId });
    await transitionInquiry(f.db, {
      inquiryId: id,
      to: 'cancelled',
      actor: 'venue',
      actorUserId: f.venueUserId,
      reason: 'Event called off',
    });

    expect(dayAvailability(await repo.loadBlocks(f.db, f.entertainerId), '2026-12-31').status).toBe('available');
    expect((await repo.getInquiry(f.db, id))!.cancelReason).toBe('Event called off');
  });

  it('keeps the dates held once a booking completes', async () => {
    const f = await makeFixture();
    const id = await openInquiry(f);
    await transitionInquiry(f.db, { inquiryId: id, to: 'accepted', actor: 'entertainer', actorUserId: f.entertainerUserId });
    await transitionInquiry(f.db, { inquiryId: id, to: 'confirmed', actor: 'entertainer', actorUserId: f.entertainerUserId });
    await transitionInquiry(f.db, { inquiryId: id, to: 'completed', actor: 'venue', actorUserId: f.venueUserId });

    expect(dayAvailability(await repo.loadBlocks(f.db, f.entertainerId), '2026-12-31').status).toBe('booked');
  });

  it('carries a counter-offer through to the confirmed amount', async () => {
    const f = await makeFixture();
    const id = await openInquiry(f);
    await transitionInquiry(f.db, {
      inquiryId: id,
      to: 'countered',
      actor: 'entertainer',
      actorUserId: f.entertainerUserId,
      offer: 1500000,
    });
    expect((await repo.getInquiry(f.db, id))!.offerAmount).toBe(1500000);

    await transitionInquiry(f.db, { inquiryId: id, to: 'confirmed', actor: 'venue', actorUserId: f.venueUserId });
    const inquiry = (await repo.getInquiry(f.db, id))!;
    expect(inquiry.status).toBe('confirmed');
    expect(inquiry.offerAmount).toBe(1500000);
  });

  it('never lets a venue confirm without the act’s acceptance', async () => {
    const f = await makeFixture();
    const id = await openInquiry(f);
    await expect(transitionInquiry(f.db, { inquiryId: id, to: 'confirmed', actor: 'venue', actorUserId: f.venueUserId })).rejects.toThrow(InvalidTransitionError);
  });

  it('writes an audit trail of every move with its actor', async () => {
    const f = await makeFixture();
    const id = await openInquiry(f);
    await transitionInquiry(f.db, { inquiryId: id, to: 'viewed', actor: 'entertainer', actorUserId: f.entertainerUserId });
    await transitionInquiry(f.db, { inquiryId: id, to: 'accepted', actor: 'entertainer', actorUserId: f.entertainerUserId });
    const events = await repo.listInquiryEvents(f.db, id);
    expect(events.map((e) => e.toStatus)).toEqual(['new', 'viewed', 'accepted']);
    expect(events.at(-1)?.actor).toBe('entertainer');
  });

  it('blocks the whole window of a confirmed residency', async () => {
    const f = await makeFixture();
    const id = await sendInquiry(f.db, {
      venueId: f.venueId,
      entertainerId: f.entertainerId,
      gigType: 'long_term',
      startDate: '2027-01-01',
      months: 6,
      daysPerWeek: 4,
    });
    await transitionInquiry(f.db, { inquiryId: id, to: 'accepted', actor: 'entertainer', actorUserId: f.entertainerUserId });
    await transitionInquiry(f.db, { inquiryId: id, to: 'confirmed', actor: 'entertainer', actorUserId: f.entertainerUserId });

    const blocks = await repo.loadBlocks(f.db, f.entertainerId);
    expect(dayAvailability(blocks, '2027-01-01').status).toBe('booked');
    expect(dayAvailability(blocks, '2027-06-30').status).toBe('booked');
    expect(dayAvailability(blocks, '2027-07-01').status).toBe('available');
  });
});

describe('access control', () => {
  it('lets only the two parties and admin touch an inquiry', async () => {
    const f = await makeFixture();
    const id = await sendInquiry(f.db, {
      venueId: f.venueId,
      entertainerId: f.entertainerId,
      gigType: 'one_time',
      startDate: '2026-12-31',
      hours: 4,
    });
    const inquiry = (await repo.getInquiry(f.db, id))!;

    expect(accessRoleFor(inquiry, { id: f.venueUserId, role: 'venue' })).toBe('venue');
    expect(accessRoleFor(inquiry, { id: f.entertainerUserId, role: 'entertainer' })).toBe('entertainer');
    expect(accessRoleFor(inquiry, { id: 'someone-else', role: 'venue' })).toBeNull();
    expect(accessRoleFor(inquiry, { id: 'staff', role: 'admin' })).toBe('admin');
  });

  it('lets an agency act for the entertainer it represents', async () => {
    const f = await makeFixture({ managed: true });
    const id = await sendInquiry(f.db, {
      venueId: f.venueId,
      entertainerId: f.entertainerId,
      gigType: 'one_time',
      startDate: '2026-12-31',
      hours: 4,
    });
    const inquiry = (await repo.getInquiry(f.db, id))!;
    expect(accessRoleFor(inquiry, { id: f.managerUserId, role: 'agency' })).toBe('entertainer');

    // And the agency is told about the act's inquiries.
    expect((await repo.listNotifications(f.db, f.managerUserId)).length).toBeGreaterThan(0);
  });
});

describe('messaging', () => {
  it('notifies the other party and nobody else', async () => {
    const f = await makeFixture();
    const id = await sendInquiry(f.db, {
      venueId: f.venueId,
      entertainerId: f.entertainerId,
      gigType: 'one_time',
      startDate: '2026-12-31',
      hours: 4,
    });
    await postMessage(f.db, id, f.venueUserId, 'Holding 31 Dec, 180 covers.');

    expect(await repo.listMessages(f.db, id)).toHaveLength(1);
    expect(await repo.unreadCount(f.db, id, f.entertainerUserId)).toBe(1);
    expect(await repo.unreadCount(f.db, id, f.venueUserId)).toBe(0);

    await repo.markThreadRead(f.db, id, f.entertainerUserId);
    expect(await repo.unreadCount(f.db, id, f.entertainerUserId)).toBe(0);
  });

  it('refuses an empty message', async () => {
    const f = await makeFixture();
    const id = await sendInquiry(f.db, {
      venueId: f.venueId,
      entertainerId: f.entertainerId,
      gigType: 'one_time',
      startDate: '2026-12-31',
      hours: 4,
    });
    await expect(postMessage(f.db, id, f.venueUserId, '   ')).rejects.toThrow(/cannot be empty/);
  });
});

describe('verified reviews', () => {
  async function completedBooking(f: Awaited<ReturnType<typeof makeFixture>>) {
    const id = await sendInquiry(f.db, {
      venueId: f.venueId,
      entertainerId: f.entertainerId,
      gigType: 'one_time',
      startDate: '2026-12-31',
      hours: 4,
    });
    await transitionInquiry(f.db, { inquiryId: id, to: 'accepted', actor: 'entertainer', actorUserId: f.entertainerUserId });
    await transitionInquiry(f.db, { inquiryId: id, to: 'confirmed', actor: 'entertainer', actorUserId: f.entertainerUserId });
    await transitionInquiry(f.db, { inquiryId: id, to: 'completed', actor: 'venue', actorUserId: f.venueUserId });
    return id;
  }

  it('feeds the act’s public rating', async () => {
    const f = await makeFixture();
    const id = await completedBooking(f);
    await leaveReview(f.db, { inquiryId: id, venueUserId: f.venueUserId, rating: 5, body: 'Held the room all night.' });

    const act = (await repo.getEntertainerById(f.db, f.entertainerId))!;
    expect(act.rating).toBe(5);
    expect(act.reviewCount).toBe(1);
  });

  it('is impossible before the booking completes', async () => {
    const f = await makeFixture();
    const id = await sendInquiry(f.db, {
      venueId: f.venueId,
      entertainerId: f.entertainerId,
      gigType: 'one_time',
      startDate: '2026-12-31',
      hours: 4,
    });
    await expect(leaveReview(f.db, { inquiryId: id, venueUserId: f.venueUserId, rating: 5, body: 'x' })).rejects.toThrow(
      /completed booking/,
    );
  });

  it('cannot be left twice, or by anyone but the booking venue', async () => {
    const f = await makeFixture();
    const id = await completedBooking(f);
    await leaveReview(f.db, { inquiryId: id, venueUserId: f.venueUserId, rating: 5, body: 'Great.' });
    await expect(leaveReview(f.db, { inquiryId: id, venueUserId: f.venueUserId, rating: 4, body: 'Again' })).rejects.toThrow(
      /already been reviewed/,
    );
    await expect(leaveReview(f.db, { inquiryId: id, venueUserId: 'someone', rating: 5, body: 'x' })).rejects.toThrow(
      /booking venue/,
    );
  });

  it('rejects a rating outside one to five', async () => {
    const f = await makeFixture();
    const id = await completedBooking(f);
    await expect(leaveReview(f.db, { inquiryId: id, venueUserId: f.venueUserId, rating: 6, body: 'x' })).rejects.toThrow(
      RangeError,
    );
  });
});
