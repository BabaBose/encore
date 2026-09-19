/**
 * Date helpers.
 *
 * Every date in the domain is a bare `YYYY-MM-DD` string. Bookings are about
 * calendar days in the venue's city, not instants, so a timezone-bearing `Date`
 * would only introduce off-by-one bugs at midnight. All arithmetic here goes
 * through UTC to stay stable wherever the server runs.
 */
import type { IsoDate, Weekday } from './types';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  // Reject impossible days like 2026-02-30, which `Date.UTC` would roll over.
  return toUtc(value).toISOString().slice(0, 10) === value;
}

export function assertIsoDate(value: unknown, field = 'date'): IsoDate {
  if (!isIsoDate(value)) throw new RangeError(`${field} must be a YYYY-MM-DD date, got ${String(value)}`);
  return value;
}

function toUtc(date: IsoDate): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

export function addMonths(date: IsoDate, months: number): IsoDate {
  const d = toUtc(date);
  const targetDay = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  // Clamp to the end of the target month: 31 Jan + 1 month is 28/29 Feb.
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(targetDay, lastDay));
  return fromUtc(d);
}

/** Monday = 0 ... Sunday = 6, matching the calendar header in the design. */
export function weekdayOf(date: IsoDate): Weekday {
  const jsDay = toUtc(date).getUTCDay(); // Sunday = 0
  return ((jsDay + 6) % 7) as Weekday;
}

export function compareDates(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Inclusive on both ends — a one-day booking has start === end. */
export function eachDate(start: IsoDate, end: IsoDate): IsoDate[] {
  if (compareDates(start, end) > 0) return [];
  const out: IsoDate[] = [];
  for (let d = start; compareDates(d, end) <= 0; d = addDays(d, 1)) out.push(d);
  return out;
}

export function daysBetween(start: IsoDate, end: IsoDate): number {
  return Math.round((toUtc(end).getTime() - toUtc(start).getTime()) / 86_400_000);
}

/** Inclusive length of a range: `2026-01-01`..`2026-01-01` is one night. */
export function nightsIn(start: IsoDate, end: IsoDate): number {
  return daysBetween(start, end) + 1;
}

export function rangesOverlap(aStart: IsoDate, aEnd: IsoDate, bStart: IsoDate, bEnd: IsoDate): boolean {
  return compareDates(aStart, bEnd) <= 0 && compareDates(bStart, aEnd) <= 0;
}

export function monthBounds(year: number, month1to12: number): { start: IsoDate; end: IsoDate } {
  const start = new Date(Date.UTC(year, month1to12 - 1, 1));
  const end = new Date(Date.UTC(year, month1to12, 0));
  return { start: fromUtc(start), end: fromUtc(end) };
}

export function today(now: Date = new Date()): IsoDate {
  return now.toISOString().slice(0, 10);
}
