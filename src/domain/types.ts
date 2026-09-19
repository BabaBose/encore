/**
 * Shared domain vocabulary for Book the Act.
 *
 * Every type here mirrors a named concept in the logic spec, so the spec can be
 * read alongside the code without a translation step.
 */

/** A calendar day with no time component, always `YYYY-MM-DD`. */
export type IsoDate = string;

export type UserRole = 'entertainer' | 'venue' | 'admin' | 'agency';

/**
 * A single account is exactly one of these at signup — no dual role. An
 * entertainer who wants to book others signs up a second account.
 */
export type SignupRole = Extract<UserRole, 'entertainer' | 'venue' | 'agency'>;

/** Draft -> Pending admin review -> Live -> Suspended. */
export type ProfileStatus = 'draft' | 'pending_review' | 'live' | 'suspended';

export type TopCategory =
  | 'singer'
  | 'band'
  | 'magician'
  | 'instrumentalist'
  | 'dj'
  | 'dancer'
  | 'comedian'
  | 'other';

/** The filter that decides which entertainers are even eligible for a search. */
export type GigType = 'one_time' | 'long_term';

/** Monday-first, matching the `M T W T F S S` header in the calendar design. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Time-of-day buckets an entertainer prices against. */
export type TimeBlock = 'daytime' | 'evening' | 'late_night';

export const TIME_BLOCKS: readonly TimeBlock[] = ['daytime', 'evening', 'late_night'];

export const WEEKDAY_LABELS: readonly string[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const TIME_BLOCK_LABELS: Record<TimeBlock, string> = {
  daytime: 'Daytime',
  evening: 'Evening',
  late_night: 'Late night',
};

/**
 * Inquiry lifecycle.
 *
 *   new -> viewed -> responded (accepted | countered | declined) -> confirmed -> completed
 *
 * `cancelled` is reachable from any pre-`completed` state by either party, with
 * a reason logged.
 */
export type InquiryStatus =
  | 'new'
  | 'viewed'
  | 'accepted'
  | 'countered'
  | 'declined'
  | 'confirmed'
  | 'completed'
  | 'cancelled';

export type InquiryActor = 'venue' | 'entertainer' | 'admin';

/** Why a date is unavailable — manual blocks are editable, booking blocks are not. */
export type BlockSource = 'manual' | 'booking';

export type BlockKind = 'single' | 'range' | 'recurring_weekday';

/**
 * Whether an entertainer wants residency inquiries while their calendar
 * already has dates in the window.
 *
 * A one-off clash is binary — nobody plays two rooms on the same night — but a
 * six-month contract with a handful of gigs already in it is something the two
 * sides work out in the thread. Which of those it is, is the act's call, not
 * the platform's.
 */
export type ResidencyInquiryPolicy =
  /** Hide me from residency searches unless the window is substantially clear. */
  | 'when_largely_free'
  /** Keep me visible even with gigs booked in the window — I will work it out. */
  | 'always';

export const RESIDENCY_INQUIRY_POLICIES: readonly ResidencyInquiryPolicy[] = ['when_largely_free', 'always'];

export const RESIDENCY_POLICY_LABEL: Record<ResidencyInquiryPolicy, string> = {
  when_largely_free: 'Only when that window is largely free',
  always: 'Always, even if I have gigs booked then',
};

export const RESIDENCY_POLICY_HINT: Record<ResidencyInquiryPolicy, string> = {
  when_largely_free:
    'You drop out of a residency search once a fifth of the window is spoken for, so you only hear about contracts you could take as they stand.',
  always:
    'You stay in residency searches whatever your calendar says. Venues still see exactly which dates are taken before they commit.',
};

/** Contract lengths an entertainer will consider for a residency, in months. */
export type ContractLength = 1 | 3 | 6 | 12;

export const CONTRACT_LENGTHS: readonly ContractLength[] = [1, 3, 6, 12];

/** Money is held as integer minor units (fils/cents) to keep arithmetic exact. */
export type Minor = number;

export interface Money {
  amount: Minor;
  currency: string;
}
