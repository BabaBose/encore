/**
 * Inquiry lifecycle.
 *
 *   new -> viewed -> accepted | countered | declined -> confirmed -> completed
 *
 * `cancelled` is reachable from any state before `completed`, by either party,
 * with a reason logged. No venue can instant-book: every booking passes through
 * the entertainer's acceptance, so `confirmed` is only ever reached from an
 * entertainer acceptance or from the venue accepting a counter-offer.
 */
import type { InquiryActor, InquiryStatus, Minor } from './types';

export interface TransitionRule {
  to: InquiryStatus;
  /** Who is allowed to make this move. */
  by: InquiryActor[];
  /** A logged reason is mandatory for cancellations and declines. */
  requiresReason?: boolean;
  label: string;
}

/**
 * The whole state machine in one table. Anything not listed here is not a legal
 * move, which keeps "can the venue confirm their own inquiry?" answerable by
 * reading eight lines rather than tracing the UI.
 */
export const TRANSITIONS: Record<InquiryStatus, TransitionRule[]> = {
  new: [
    { to: 'viewed', by: ['entertainer'], label: 'Mark as viewed' },
    { to: 'accepted', by: ['entertainer'], label: 'Accept' },
    { to: 'countered', by: ['entertainer'], label: 'Counter-offer' },
    { to: 'declined', by: ['entertainer'], requiresReason: true, label: 'Decline' },
    { to: 'cancelled', by: ['venue', 'entertainer', 'admin'], requiresReason: true, label: 'Cancel' },
  ],
  viewed: [
    { to: 'accepted', by: ['entertainer'], label: 'Accept' },
    { to: 'countered', by: ['entertainer'], label: 'Counter-offer' },
    { to: 'declined', by: ['entertainer'], requiresReason: true, label: 'Decline' },
    { to: 'cancelled', by: ['venue', 'entertainer', 'admin'], requiresReason: true, label: 'Cancel' },
  ],
  accepted: [
    // The entertainer has said yes at the venue's price; confirming holds the dates.
    { to: 'confirmed', by: ['entertainer', 'venue'], label: 'Confirm booking' },
    { to: 'cancelled', by: ['venue', 'entertainer', 'admin'], requiresReason: true, label: 'Cancel' },
  ],
  countered: [
    // A venue accepting the counter-offer auto-confirms, per the spec.
    { to: 'confirmed', by: ['venue'], label: 'Accept counter-offer' },
    { to: 'countered', by: ['venue', 'entertainer'], label: 'Counter again' },
    { to: 'declined', by: ['venue'], requiresReason: true, label: 'Decline counter-offer' },
    { to: 'cancelled', by: ['venue', 'entertainer', 'admin'], requiresReason: true, label: 'Cancel' },
  ],
  declined: [
    { to: 'cancelled', by: ['venue', 'entertainer', 'admin'], requiresReason: true, label: 'Close' },
  ],
  confirmed: [
    { to: 'completed', by: ['venue', 'entertainer', 'admin'], label: 'Mark completed' },
    { to: 'cancelled', by: ['venue', 'entertainer', 'admin'], requiresReason: true, label: 'Cancel booking' },
  ],
  completed: [],
  cancelled: [],
};

/** Statuses that hold dates on the entertainer's calendar. */
export const DATE_HOLDING_STATUSES: readonly InquiryStatus[] = ['confirmed', 'completed'];

/** Statuses from which a cancellation is still possible. */
export const CANCELLABLE_STATUSES: readonly InquiryStatus[] = [
  'new',
  'viewed',
  'accepted',
  'countered',
  'declined',
  'confirmed',
];

export const TERMINAL_STATUSES: readonly InquiryStatus[] = ['completed', 'cancelled'];

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: InquiryStatus,
    public readonly to: InquiryStatus,
    public readonly actor: InquiryActor,
    message?: string,
  ) {
    super(message ?? `A ${actor} cannot move an inquiry from ${from} to ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export class MissingReasonError extends Error {
  constructor(to: InquiryStatus) {
    super(`Moving an inquiry to ${to} requires a logged reason`);
    this.name = 'MissingReasonError';
  }
}

export function allowedTransitions(from: InquiryStatus, actor: InquiryActor): TransitionRule[] {
  return TRANSITIONS[from].filter((t) => t.by.includes(actor));
}

export function canTransition(from: InquiryStatus, to: InquiryStatus, actor: InquiryActor): boolean {
  return allowedTransitions(from, actor).some((t) => t.to === to);
}

export interface TransitionInput {
  from: InquiryStatus;
  to: InquiryStatus;
  actor: InquiryActor;
  reason?: string | null;
  /** Required when countering, so the offer on the table is never ambiguous. */
  offer?: Minor | null;
}

export interface TransitionOutcome {
  status: InquiryStatus;
  reason: string | null;
  offer: Minor | null;
  /** True when this move should place a block on the entertainer's calendar. */
  holdsDates: boolean;
  /** True when this move should release a previously held block. */
  releasesDates: boolean;
}

/**
 * Validate and apply one move. Returns what the caller must persist — including
 * whether the calendar has to be updated, so the "dates block instantly on
 * confirmation" rule cannot be forgotten at a call site.
 */
export function applyTransition(input: TransitionInput): TransitionOutcome {
  const rule = allowedTransitions(input.from, input.actor).find((t) => t.to === input.to);
  if (!rule) throw new InvalidTransitionError(input.from, input.to, input.actor);

  const reason = input.reason?.trim() || null;
  if (rule.requiresReason && !reason) throw new MissingReasonError(input.to);

  if (input.to === 'countered' && (input.offer == null || input.offer <= 0)) {
    throw new RangeError('A counter-offer must name a new amount');
  }

  const wasHolding = DATE_HOLDING_STATUSES.includes(input.from);
  const nowHolding = DATE_HOLDING_STATUSES.includes(input.to);

  return {
    status: input.to,
    reason,
    offer: input.offer ?? null,
    holdsDates: !wasHolding && nowHolding,
    releasesDates: wasHolding && !nowHolding,
  };
}

/** A venue may only leave a verified review once the gig actually happened. */
export function canLeaveReview(status: InquiryStatus): boolean {
  return status === 'completed';
}

export const STATUS_LABEL: Record<InquiryStatus, string> = {
  new: 'New',
  viewed: 'Viewed',
  accepted: 'Accepted',
  countered: 'Counter-offer',
  declined: 'Declined',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/** Maps onto the pill colours in the dashboard design. */
export const STATUS_TONE: Record<InquiryStatus, 'neutral' | 'positive' | 'warning' | 'negative' | 'accent'> = {
  new: 'accent',
  viewed: 'neutral',
  accepted: 'positive',
  countered: 'warning',
  declined: 'negative',
  confirmed: 'positive',
  completed: 'neutral',
  cancelled: 'negative',
};
