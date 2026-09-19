/**
 * Rate resolution.
 *
 * Short-term rates resolve in a strict priority order, from the spec:
 *
 *   special-date rate  >  [day-of-week x time-block] rule  >  base hourly rate
 *
 * Whatever wins is both what the venue sees on the profile and what pre-fills
 * the inquiry, so this function is the single source of price truth — the UI
 * never computes a rate of its own.
 *
 * Residencies are priced as a package (weekly/monthly + a per-extra-day add-on)
 * rather than hours x rate, so they resolve through a separate path.
 */
import { assertIsoDate, nightsIn, weekdayOf } from './dates';
import type { ContractLength, IsoDate, Minor, TimeBlock, Weekday } from './types';

export interface RateCard {
  currency: string;
  /** Fallback when no rule matches. */
  baseHourly: Minor;
  /** Refuses bookings shorter than this, e.g. a 3-hour minimum. */
  minimumHours: number;
  /** The [day-of-week] x [time block] grid the entertainer fills in. */
  rules: RateRule[];
  /** Dates priced in advance that outrank every rule: NYE, Eid, Diwali. */
  specialDates: SpecialDateRate[];
  residency?: ResidencyRate;
}

export interface RateRule {
  weekday: Weekday;
  timeBlock: TimeBlock;
  hourly: Minor;
  /** Optional per-rule override of the card-wide minimum. */
  minimumHours?: number;
}

export interface SpecialDateRate {
  date: IsoDate;
  label: string;
  hourly: Minor;
  minimumHours?: number;
}

export interface ResidencyRate {
  weekly?: Minor;
  monthly?: Minor;
  /** Working days per week the weekly/monthly figure already covers. */
  daysPerWeekIncluded: number;
  /** What one additional day beyond that costs. */
  extraDayRate?: Minor;
  /** Contract lengths the entertainer will consider at all. */
  contractLengths: ContractLength[];
}

export type RateSource = 'special_date' | 'rule' | 'base';

export interface ResolvedHourlyRate {
  source: RateSource;
  /** Human-readable reason, shown to the venue so the price is never a mystery. */
  label: string;
  hourly: Minor;
  minimumHours: number;
  currency: string;
  weekday: Weekday;
  timeBlock: TimeBlock;
}

export interface HourlyQuote extends ResolvedHourlyRate {
  /** Hours actually charged — never fewer than the minimum. */
  billableHours: number;
  requestedHours: number;
  /** True when the minimum pushed the price above hours x rate. */
  minimumApplied: boolean;
  total: Minor;
}

/**
 * Resolve the hourly rate for one date and time block.
 *
 * Special dates win outright: an entertainer who set a NYE rate meant it to
 * override the ordinary Thursday-evening rule, not to be averaged with it.
 */
export function resolveHourlyRate(card: RateCard, date: IsoDate, timeBlock: TimeBlock): ResolvedHourlyRate {
  assertIsoDate(date);
  const weekday = weekdayOf(date);

  const special = card.specialDates.find((s) => s.date === date);
  if (special) {
    return {
      source: 'special_date',
      label: special.label,
      hourly: special.hourly,
      minimumHours: special.minimumHours ?? card.minimumHours,
      currency: card.currency,
      weekday,
      timeBlock,
    };
  }

  const rule = card.rules.find((r) => r.weekday === weekday && r.timeBlock === timeBlock);
  if (rule) {
    return {
      source: 'rule',
      label: `${WEEKDAY_NAME[weekday]} · ${TIME_BLOCK_NAME[timeBlock]}`,
      hourly: rule.hourly,
      minimumHours: rule.minimumHours ?? card.minimumHours,
      currency: card.currency,
      weekday,
      timeBlock,
    };
  }

  return {
    source: 'base',
    label: 'Base hourly rate',
    hourly: card.baseHourly,
    minimumHours: card.minimumHours,
    currency: card.currency,
    weekday,
    timeBlock,
  };
}

/**
 * Price a short-term booking. The minimum-hours rule is a floor on what is
 * charged, not a validation error: a venue asking for two hours against a
 * three-hour minimum is quoted three.
 */
export function quoteHourly(
  card: RateCard,
  date: IsoDate,
  timeBlock: TimeBlock,
  requestedHours: number,
): HourlyQuote {
  if (!(requestedHours > 0)) throw new RangeError('requestedHours must be greater than zero');
  const resolved = resolveHourlyRate(card, date, timeBlock);
  const billableHours = Math.max(requestedHours, resolved.minimumHours);
  return {
    ...resolved,
    requestedHours,
    billableHours,
    minimumApplied: billableHours > requestedHours,
    total: Math.round(resolved.hourly * billableHours),
  };
}

export interface ResidencyQuote {
  currency: string;
  months: number;
  daysPerWeek: number;
  daysPerWeekIncluded: number;
  extraDaysPerWeek: number;
  /** The package rate before extra days, normalised to a month. */
  baseMonthly: Minor;
  extraDaysMonthly: Minor;
  monthlyTotal: Minor;
  contractTotal: Minor;
  /** Which of weekly/monthly the package price came from. */
  basis: 'monthly' | 'weekly';
}

/** Weeks in an average month — used only to normalise a weekly rate. */
const WEEKS_PER_MONTH = 52 / 12;

/**
 * Price a residency.
 *
 * The entertainer publishes a weekly and/or monthly figure covering N working
 * days per week; anything beyond N is charged at the extra-day rate. Preferring
 * the monthly figure when both exist keeps the quote at the price the
 * entertainer actually advertises for a multi-month contract.
 */
export function quoteResidency(card: RateCard, months: number, daysPerWeek: number): ResidencyQuote {
  const residency = card.residency;
  if (!residency) throw new Error('This entertainer has no residency rate published');
  if (!(months > 0)) throw new RangeError('months must be greater than zero');
  if (!(daysPerWeek > 0)) throw new RangeError('daysPerWeek must be greater than zero');

  let baseMonthly: Minor;
  let basis: 'monthly' | 'weekly';
  if (residency.monthly != null) {
    baseMonthly = residency.monthly;
    basis = 'monthly';
  } else if (residency.weekly != null) {
    baseMonthly = Math.round(residency.weekly * WEEKS_PER_MONTH);
    basis = 'weekly';
  } else {
    throw new Error('Residency rate must publish at least a weekly or a monthly figure');
  }

  const extraDaysPerWeek = Math.max(0, daysPerWeek - residency.daysPerWeekIncluded);
  if (extraDaysPerWeek > 0 && residency.extraDayRate == null) {
    throw new Error(
      `This residency covers ${residency.daysPerWeekIncluded} days/week and publishes no extra-day rate`,
    );
  }
  const extraDaysMonthly = Math.round(extraDaysPerWeek * (residency.extraDayRate ?? 0) * WEEKS_PER_MONTH);
  const monthlyTotal = baseMonthly + extraDaysMonthly;

  return {
    currency: card.currency,
    months,
    daysPerWeek,
    daysPerWeekIncluded: residency.daysPerWeekIncluded,
    extraDaysPerWeek,
    baseMonthly,
    extraDaysMonthly,
    monthlyTotal,
    contractTotal: Math.round(monthlyTotal * months),
    basis,
  };
}

/**
 * The "from X" figure on a search card: the cheapest a venue could plausibly
 * pay. Special dates are deliberately excluded — they are premium overrides and
 * quoting a NYE rate as a "from" price would misrepresent the act.
 */
export function startingFromHourly(card: RateCard): Minor {
  const candidates = [card.baseHourly, ...card.rules.map((r) => r.hourly)].filter((n) => n > 0);
  return candidates.length ? Math.min(...candidates) : card.baseHourly;
}

export function startingFromMonthly(card: RateCard): Minor | null {
  const residency = card.residency;
  if (!residency) return null;
  if (residency.monthly != null) return residency.monthly;
  if (residency.weekly != null) return Math.round(residency.weekly * WEEKS_PER_MONTH);
  return null;
}

/** Nights a short-term inquiry covers, for multi-day runs. */
export function runLength(start: IsoDate, end: IsoDate): number {
  return nightsIn(assertIsoDate(start), assertIsoDate(end));
}

const WEEKDAY_NAME: Record<Weekday, string> = {
  0: 'Mon',
  1: 'Tue',
  2: 'Wed',
  3: 'Thu',
  4: 'Fri',
  5: 'Sat',
  6: 'Sun',
};

const TIME_BLOCK_NAME: Record<TimeBlock, string> = {
  daytime: 'Daytime',
  evening: 'Evening',
  late_night: 'Late night',
};
