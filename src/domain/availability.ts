/**
 * Availability.
 *
 * Every date starts Available. An entertainer makes dates unavailable by adding
 * blocks — a single day, a range, or a recurring weekday ("every Monday") — and
 * a confirmed booking adds a block of its own automatically.
 *
 * The spec's hard rule is that no date is ever double-committed: once a booking
 * confirms, the system owns that date, not the entertainer's memory. Booking
 * blocks are therefore `source: 'booking'` and cannot be lifted by hand; they
 * clear only when their booking is cancelled.
 */
import { assertIsoDate, compareDates, eachDate, rangesOverlap, weekdayOf } from './dates';
import type { BlockKind, BlockSource, IsoDate, Weekday } from './types';

export interface AvailabilityBlock {
  id: string;
  kind: BlockKind;
  source: BlockSource;
  /** Set for `single` and `range`; a `single` block has start === end. */
  start?: IsoDate;
  end?: IsoDate;
  /** Set for `recurring_weekday`. */
  weekday?: Weekday;
  /** Optional window a recurring block applies within. Open-ended if absent. */
  recurFrom?: IsoDate;
  recurUntil?: IsoDate;
  /** The booking that created a `booking` block. */
  bookingId?: string;
  note?: string;
}

export type DayStatus = 'available' | 'blocked' | 'booked';

export interface DayAvailability {
  date: IsoDate;
  status: DayStatus;
  /** Which blocks landed on this date — usually one, occasionally overlapping. */
  blocks: AvailabilityBlock[];
}

/** Does one block cover this specific date? */
export function blockCoversDate(block: AvailabilityBlock, date: IsoDate): boolean {
  if (block.kind === 'recurring_weekday') {
    if (block.weekday == null || weekdayOf(date) !== block.weekday) return false;
    if (block.recurFrom && compareDates(date, block.recurFrom) < 0) return false;
    if (block.recurUntil && compareDates(date, block.recurUntil) > 0) return false;
    return true;
  }
  if (!block.start) return false;
  const end = block.end ?? block.start;
  return compareDates(date, block.start) >= 0 && compareDates(date, end) <= 0;
}

/**
 * A booking block outranks a manual one in the status shown, so a venue looking
 * at a red date sees "booked" rather than a self-declared day off.
 */
function statusFor(blocks: AvailabilityBlock[]): DayStatus {
  if (!blocks.length) return 'available';
  return blocks.some((b) => b.source === 'booking') ? 'booked' : 'blocked';
}

export function dayAvailability(blocks: AvailabilityBlock[], date: IsoDate): DayAvailability {
  assertIsoDate(date);
  const hits = blocks.filter((b) => blockCoversDate(b, date));
  return { date, status: statusFor(hits), blocks: hits };
}

/** The green/red grid the venue sees on a profile. */
export function availabilityCalendar(
  blocks: AvailabilityBlock[],
  start: IsoDate,
  end: IsoDate,
): DayAvailability[] {
  return eachDate(assertIsoDate(start), assertIsoDate(end)).map((date) => dayAvailability(blocks, date));
}

export function isDateFree(blocks: AvailabilityBlock[], date: IsoDate): boolean {
  return dayAvailability(blocks, date).status === 'available';
}

/** A one-off gig needs every date in its run free, not merely some. */
export function isRangeFree(blocks: AvailabilityBlock[], start: IsoDate, end: IsoDate): boolean {
  return availabilityCalendar(blocks, start, end).every((d) => d.status === 'available');
}

export function blockedDatesIn(blocks: AvailabilityBlock[], start: IsoDate, end: IsoDate): IsoDate[] {
  return availabilityCalendar(blocks, start, end)
    .filter((d) => d.status !== 'available')
    .map((d) => d.date);
}

/**
 * Long-term searches ask a different question: not "is every single night of a
 * six-month contract untouched?" — no working entertainer's calendar is — but
 * "is this entertainer substantially open across the window?".
 *
 * `maxBlockedRatio` is the share of days in the window that may already be
 * spoken for before the entertainer stops counting as available for a
 * residency. A venue still sees the exact conflicts before confirming.
 */
export function residencyAvailability(
  blocks: AvailabilityBlock[],
  start: IsoDate,
  end: IsoDate,
  maxBlockedRatio = 0.2,
): { available: boolean; totalDays: number; blockedDays: number; blockedRatio: number } {
  const days = availabilityCalendar(blocks, start, end);
  const blockedDays = days.filter((d) => d.status !== 'available').length;
  const totalDays = days.length;
  const blockedRatio = totalDays === 0 ? 0 : blockedDays / totalDays;
  return { available: blockedRatio <= maxBlockedRatio, totalDays, blockedDays, blockedRatio };
}

export class DoubleBookingError extends Error {
  constructor(
    public readonly conflicts: IsoDate[],
    message = `Dates already committed: ${conflicts.join(', ')}`,
  ) {
    super(message);
    this.name = 'DoubleBookingError';
  }
}

/**
 * Turn a confirmed booking into the block that holds its dates.
 *
 * Throws rather than silently overlapping: a confirmation that would
 * double-commit a date is a bug the caller must surface, not absorb. Existing
 * *manual* blocks do not stand in the way — an entertainer confirming a booking
 * on a day they had pencilled out has plainly changed their mind.
 */
export function blockForBooking(
  existing: AvailabilityBlock[],
  booking: { id: string; start: IsoDate; end: IsoDate; note?: string },
): AvailabilityBlock {
  const start = assertIsoDate(booking.start, 'start');
  const end = assertIsoDate(booking.end, 'end');
  if (compareDates(start, end) > 0) throw new RangeError('Booking end must not precede its start');

  const conflicts = existing
    .filter((b) => b.source === 'booking' && b.bookingId !== booking.id)
    .flatMap((b) => eachDate(start, end).filter((d) => blockCoversDate(b, d)));

  if (conflicts.length) throw new DoubleBookingError([...new Set(conflicts)].sort(compareDates));

  return {
    id: `booking:${booking.id}`,
    kind: start === end ? 'single' : 'range',
    source: 'booking',
    start,
    end,
    bookingId: booking.id,
    note: booking.note,
  };
}

/**
 * Manual blocks are the entertainer's own; booking blocks are not theirs to
 * lift. Cancelling the booking is what frees those dates.
 */
export function canRemoveBlock(block: AvailabilityBlock): boolean {
  return block.source === 'manual';
}

export function normaliseManualBlock(input: {
  id: string;
  kind: BlockKind;
  start?: string;
  end?: string;
  weekday?: number;
  recurFrom?: string;
  recurUntil?: string;
  note?: string;
}): AvailabilityBlock {
  if (input.kind === 'recurring_weekday') {
    const weekday = input.weekday;
    if (weekday == null || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      throw new RangeError('A recurring block needs a weekday from 0 (Mon) to 6 (Sun)');
    }
    return {
      id: input.id,
      kind: 'recurring_weekday',
      source: 'manual',
      weekday: weekday as Weekday,
      recurFrom: input.recurFrom ? assertIsoDate(input.recurFrom, 'recurFrom') : undefined,
      recurUntil: input.recurUntil ? assertIsoDate(input.recurUntil, 'recurUntil') : undefined,
      note: input.note,
    };
  }

  const start = assertIsoDate(input.start, 'start');
  const end = input.kind === 'single' ? start : assertIsoDate(input.end ?? input.start, 'end');
  if (compareDates(start, end) > 0) throw new RangeError('Block end must not precede its start');
  return { id: input.id, kind: input.kind, source: 'manual', start, end, note: input.note };
}

/** Do two dated blocks touch the same days? Used to keep the calendar tidy. */
export function blocksOverlap(a: AvailabilityBlock, b: AvailabilityBlock): boolean {
  if (a.kind === 'recurring_weekday' || b.kind === 'recurring_weekday') return false;
  if (!a.start || !b.start) return false;
  return rangesOverlap(a.start, a.end ?? a.start, b.start, b.end ?? b.start);
}
