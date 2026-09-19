import { describe, expect, it } from 'vitest';
import {
  DoubleBookingError,
  availabilityCalendar,
  blockForBooking,
  canRemoveBlock,
  isDateFree,
  isRangeFree,
  normaliseManualBlock,
  residencyAvailability,
  type AvailabilityBlock,
} from '@/domain/availability';

const manualRange: AvailabilityBlock = {
  id: 'b1',
  kind: 'range',
  source: 'manual',
  start: '2026-12-10',
  end: '2026-12-12',
};

// 2026-12-07 is a Monday.
const everyMonday: AvailabilityBlock = {
  id: 'b2',
  kind: 'recurring_weekday',
  source: 'manual',
  weekday: 0,
};

const bookingBlock: AvailabilityBlock = {
  id: 'booking:i1',
  kind: 'single',
  source: 'booking',
  start: '2026-12-31',
  end: '2026-12-31',
  bookingId: 'i1',
};

describe('default availability', () => {
  it('treats every untouched date as available', () => {
    expect(isDateFree([], '2026-12-15')).toBe(true);
  });
});

describe('manual blocks', () => {
  it('blocks every day of an inclusive range', () => {
    expect(isDateFree([manualRange], '2026-12-09')).toBe(true);
    expect(isDateFree([manualRange], '2026-12-10')).toBe(false);
    expect(isDateFree([manualRange], '2026-12-12')).toBe(false);
    expect(isDateFree([manualRange], '2026-12-13')).toBe(true);
  });

  it('blocks a recurring weekday across months', () => {
    expect(isDateFree([everyMonday], '2026-12-07')).toBe(false);
    expect(isDateFree([everyMonday], '2026-12-14')).toBe(false);
    expect(isDateFree([everyMonday], '2027-03-01')).toBe(false); // also a Monday
    expect(isDateFree([everyMonday], '2026-12-08')).toBe(true);
  });

  it('honours the window on a recurring block', () => {
    const bounded: AvailabilityBlock = { ...everyMonday, recurFrom: '2027-01-01', recurUntil: '2027-01-31' };
    expect(isDateFree([bounded], '2026-12-07')).toBe(true);
    expect(isDateFree([bounded], '2027-01-04')).toBe(false);
    expect(isDateFree([bounded], '2027-02-01')).toBe(true);
  });

  it('normalises a single-day block to an equal start and end', () => {
    const block = normaliseManualBlock({ id: 'x', kind: 'single', start: '2026-12-05' });
    expect(block.start).toBe('2026-12-05');
    expect(block.end).toBe('2026-12-05');
  });

  it('rejects a range that ends before it starts', () => {
    expect(() => normaliseManualBlock({ id: 'x', kind: 'range', start: '2026-12-10', end: '2026-12-01' })).toThrow(
      RangeError,
    );
  });

  it('rejects a recurring block with no weekday', () => {
    expect(() => normaliseManualBlock({ id: 'x', kind: 'recurring_weekday' })).toThrow(RangeError);
  });
});

describe('a confirmed booking owns its dates', () => {
  it('reports booked rather than merely blocked', () => {
    const [day] = availabilityCalendar([bookingBlock], '2026-12-31', '2026-12-31');
    expect(day.status).toBe('booked');
  });

  it('shows booked even when a manual block covers the same day', () => {
    const manualSameDay: AvailabilityBlock = { ...manualRange, id: 'b3', start: '2026-12-31', end: '2026-12-31' };
    const [day] = availabilityCalendar([bookingBlock, manualSameDay], '2026-12-31', '2026-12-31');
    expect(day.status).toBe('booked');
  });

  it('cannot be lifted by hand, unlike a manual block', () => {
    expect(canRemoveBlock(bookingBlock)).toBe(false);
    expect(canRemoveBlock(manualRange)).toBe(true);
  });

  it('refuses to double-commit a date held by another booking', () => {
    expect(() => blockForBooking([bookingBlock], { id: 'i2', start: '2026-12-30', end: '2027-01-01' })).toThrow(
      DoubleBookingError,
    );
  });

  it('names the conflicting dates so the caller can report them', () => {
    try {
      blockForBooking([bookingBlock], { id: 'i2', start: '2026-12-31', end: '2026-12-31' });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(DoubleBookingError);
      expect((err as DoubleBookingError).conflicts).toEqual(['2026-12-31']);
    }
  });

  it('lets the same booking re-block its own dates, so an update is idempotent', () => {
    const block = blockForBooking([bookingBlock], { id: 'i1', start: '2026-12-31', end: '2026-12-31' });
    expect(block.bookingId).toBe('i1');
  });

  it('confirms over a manual block — the entertainer changed their mind', () => {
    const block = blockForBooking([manualRange], { id: 'i3', start: '2026-12-10', end: '2026-12-11' });
    expect(block.source).toBe('booking');
    expect(block.kind).toBe('range');
  });
});

describe('range checks', () => {
  it('requires every date of a multi-day run to be free', () => {
    expect(isRangeFree([manualRange], '2026-12-08', '2026-12-09')).toBe(true);
    expect(isRangeFree([manualRange], '2026-12-08', '2026-12-11')).toBe(false);
  });
});

describe('residency availability', () => {
  it('tolerates scattered blocked days across a long window', () => {
    const result = residencyAvailability([manualRange], '2026-12-01', '2027-02-28');
    expect(result.blockedDays).toBe(3);
    expect(result.available).toBe(true);
  });

  it('rules out an act whose window is mostly committed', () => {
    const busy: AvailabilityBlock = { id: 'b9', kind: 'range', source: 'booking', start: '2026-12-01', end: '2027-01-31' };
    const result = residencyAvailability([busy], '2026-12-01', '2027-02-28');
    expect(result.available).toBe(false);
    expect(result.blockedRatio).toBeGreaterThan(0.2);
  });
});
