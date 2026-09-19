import { describe, expect, it } from 'vitest';
import {
  quoteHourly,
  quoteResidency,
  resolveHourlyRate,
  startingFromHourly,
  startingFromMonthly,
  type RateCard,
} from '@/domain/rates';

// 2026-12-31 is a Thursday; 2026-12-28 a Monday; 2027-01-02 a Saturday.
const card: RateCard = {
  currency: 'AED',
  baseHourly: 40000,
  minimumHours: 3,
  rules: [
    { weekday: 0, timeBlock: 'evening', hourly: 42000 },
    { weekday: 3, timeBlock: 'evening', hourly: 52000 },
    { weekday: 3, timeBlock: 'late_night', hourly: 62000 },
    { weekday: 5, timeBlock: 'evening', hourly: 56000, minimumHours: 4 },
  ],
  specialDates: [{ date: '2026-12-31', label: 'New Year’s Eve', hourly: 340000, minimumHours: 4 }],
  residency: {
    monthly: 1400000,
    weekly: 380000,
    daysPerWeekIncluded: 4,
    extraDayRate: 90000,
    contractLengths: [3, 6, 12],
  },
};

describe('rate resolution order', () => {
  it('puts a special date above the matching day-of-week rule', () => {
    const resolved = resolveHourlyRate(card, '2026-12-31', 'evening');
    expect(resolved.source).toBe('special_date');
    expect(resolved.hourly).toBe(340000);
    // The Thursday-evening rule would have said 52000 — the override wins.
  });

  it('uses the day-of-week x time-block rule when no special date matches', () => {
    const resolved = resolveHourlyRate(card, '2026-12-24', 'evening'); // Thursday
    expect(resolved.source).toBe('rule');
    expect(resolved.hourly).toBe(52000);
  });

  it('distinguishes time blocks on the same day', () => {
    expect(resolveHourlyRate(card, '2026-12-24', 'late_night').hourly).toBe(62000);
  });

  it('falls back to the base hourly rate when nothing matches', () => {
    const resolved = resolveHourlyRate(card, '2026-12-24', 'daytime');
    expect(resolved.source).toBe('base');
    expect(resolved.hourly).toBe(40000);
  });

  it('rejects a malformed date rather than guessing', () => {
    expect(() => resolveHourlyRate(card, '31/12/2026', 'evening')).toThrow(RangeError);
    expect(() => resolveHourlyRate(card, '2026-02-30', 'evening')).toThrow(RangeError);
  });
});

describe('quoteHourly', () => {
  it('charges the minimum when fewer hours are requested', () => {
    const quote = quoteHourly(card, '2026-12-24', 'evening', 2);
    expect(quote.billableHours).toBe(3);
    expect(quote.minimumApplied).toBe(true);
    expect(quote.total).toBe(52000 * 3);
  });

  it('charges actual hours above the minimum', () => {
    const quote = quoteHourly(card, '2026-12-24', 'evening', 5);
    expect(quote.minimumApplied).toBe(false);
    expect(quote.total).toBe(52000 * 5);
  });

  it('honours a per-rule minimum over the card-wide one', () => {
    const quote = quoteHourly(card, '2027-01-02', 'evening', 2); // Saturday, min 4
    expect(quote.billableHours).toBe(4);
  });

  it('applies the special-date minimum on the special date', () => {
    const quote = quoteHourly(card, '2026-12-31', 'evening', 1);
    expect(quote.billableHours).toBe(4);
    expect(quote.total).toBe(340000 * 4);
  });

  it('refuses a zero-hour request', () => {
    expect(() => quoteHourly(card, '2026-12-24', 'evening', 0)).toThrow(RangeError);
  });
});

describe('quoteResidency', () => {
  it('prices the package at the published monthly rate', () => {
    const quote = quoteResidency(card, 3, 4);
    expect(quote.basis).toBe('monthly');
    expect(quote.extraDaysPerWeek).toBe(0);
    expect(quote.monthlyTotal).toBe(1400000);
    expect(quote.contractTotal).toBe(4200000);
  });

  it('charges the extra-day rate beyond the included days per week', () => {
    const quote = quoteResidency(card, 1, 6);
    expect(quote.extraDaysPerWeek).toBe(2);
    expect(quote.monthlyTotal).toBeGreaterThan(1400000);
    // Two extra days a week, ~4.33 weeks a month, at 90000 each.
    expect(quote.extraDaysMonthly).toBe(Math.round(2 * 90000 * (52 / 12)));
  });

  it('normalises a weekly-only rate to a month', () => {
    const weeklyOnly: RateCard = {
      ...card,
      residency: { weekly: 380000, daysPerWeekIncluded: 5, contractLengths: [1] },
    };
    const quote = quoteResidency(weeklyOnly, 2, 5);
    expect(quote.basis).toBe('weekly');
    expect(quote.baseMonthly).toBe(Math.round(380000 * (52 / 12)));
  });

  it('refuses extra days when no extra-day rate is published', () => {
    const noExtra: RateCard = {
      ...card,
      residency: { monthly: 1400000, daysPerWeekIncluded: 4, contractLengths: [3] },
    };
    expect(() => quoteResidency(noExtra, 3, 6)).toThrow(/extra-day rate/);
  });

  it('refuses to quote an act with no residency rate', () => {
    expect(() => quoteResidency({ ...card, residency: undefined }, 3, 4)).toThrow(/no residency rate/);
  });
});

describe('starting-from prices', () => {
  it('excludes special dates so a NYE rate never becomes the "from" price', () => {
    expect(startingFromHourly(card)).toBe(40000);
  });

  it('reports the monthly residency figure', () => {
    expect(startingFromMonthly(card)).toBe(1400000);
    expect(startingFromMonthly({ ...card, residency: undefined })).toBeNull();
  });
});
