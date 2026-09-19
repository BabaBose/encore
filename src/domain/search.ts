/**
 * Discovery and gig-type-aware matching.
 *
 * Separating gig type from location is the point of the whole search surface:
 *
 *   one-off + city     -> only acts based in (or already travelling to) that
 *                         city, and free on the date
 *   long-term + city   -> acts based in that city who take residencies, PLUS
 *                         acts anywhere flagged open-to-relocate
 *   long-term, no city -> the global open-to-long-term pool, filtered on
 *                         category / genre / budget alone
 *
 * So a one-off local gig never surfaces someone in another country, while a
 * multi-month contract search reaches the relocation pool.
 */
import { addMonths, addDays } from './dates';
import { isRangeFree, residencyAvailability, type AvailabilityBlock } from './availability';
import { resolveHourlyRate, startingFromHourly, startingFromMonthly, type RateCard } from './rates';
import type { ContractLength, GigType, IsoDate, Minor, TimeBlock, TopCategory } from './types';

export interface CityRef {
  id: string;
  name: string;
  country: string;
  lat: number;
  lng: number;
}

export interface EntertainerRecord {
  id: string;
  slug: string;
  stageName: string;
  shortBio: string;
  category: TopCategory;
  genres: string[];
  countryOfOrigin: string;
  homeCity: CityRef;
  /** Cities the act has explicitly marked itself as travelling to. */
  travelCities: string[];
  /** Willing-to-travel radius from the home city, in km. Zero means local only. */
  travelRadiusKm: number;
  /** Short-term / one-off availability mode. */
  acceptsShortTerm: boolean;
  /** Long-term / residency availability mode. Both modes can be on at once. */
  acceptsLongTerm: boolean;
  /** Only meaningful with `acceptsLongTerm`: will they move city for a contract? */
  openToRelocate: boolean;
  contractLengths: ContractLength[];
  rateCard: RateCard;
  blocks: AvailabilityBlock[];
  rating: number | null;
  reviewCount: number;
  verified: boolean;
  featured: boolean;
  /** Only `live` profiles are discoverable. */
  isLive: boolean;
  heroAccent: string;
  teamSize: number;
}

export interface SearchQuery {
  gigType: GigType;
  /** City id. Omitted or 'anywhere' means no location constraint. */
  cityId?: string | null;
  category?: TopCategory | null;
  genres?: string[];
  countryOfOrigin?: string | null;
  /** One-off: the date (or range) wanted. */
  date?: IsoDate | null;
  dateEnd?: IsoDate | null;
  timeBlock?: TimeBlock | null;
  /** Long-term: how many months the contract runs, and roughly when it starts. */
  months?: ContractLength | null;
  startDate?: IsoDate | null;
  /** Budget ceiling in minor units — per hour for one-off, per month for long-term. */
  budgetMax?: Minor | null;
  budgetMin?: Minor | null;
  minRating?: number | null;
  verifiedOnly?: boolean;
  sort?: SortKey;
}

export type SortKey = 'best_match' | 'price_asc' | 'price_desc' | 'rating' | 'longest_available';

export type MatchReason =
  | 'based_in_city'
  | 'travels_to_city'
  | 'within_travel_radius'
  | 'open_to_relocate'
  | 'global_long_term_pool';

export interface SearchResult {
  entertainer: EntertainerRecord;
  /** Why this act is eligible — surfaced as the "open to relocation" style tag. */
  reason: MatchReason;
  /** The rate shown on the card, already resolved through the rate rules. */
  priceFrom: Minor;
  priceUnit: 'hour' | 'month';
  /** Populated when the search named a specific date, so the card can show it. */
  exactRate: Minor | null;
  score: number;
}

const EARTH_RADIUS_KM = 6371;

export function distanceKm(a: CityRef, b: CityRef): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * Can this act physically serve a one-off gig in `city`? Either they are based
 * there, have marked themselves as travelling there, or it falls inside their
 * stated travel radius.
 */
export function locationReachFor(
  entertainer: EntertainerRecord,
  city: CityRef,
): MatchReason | null {
  if (entertainer.homeCity.id === city.id) return 'based_in_city';
  if (entertainer.travelCities.includes(city.id)) return 'travels_to_city';
  if (entertainer.travelRadiusKm > 0 && distanceKm(entertainer.homeCity, city) <= entertainer.travelRadiusKm) {
    return 'within_travel_radius';
  }
  return null;
}

/** The window a residency search covers, used for the availability check. */
export function residencyWindow(query: SearchQuery, fallbackStart: IsoDate): { start: IsoDate; end: IsoDate } {
  const start = query.startDate ?? fallbackStart;
  const months = query.months ?? 1;
  return { start, end: addDays(addMonths(start, months), -1) };
}

interface EligibilityContext {
  cities: Map<string, CityRef>;
  today: IsoDate;
}

/**
 * The eligibility gate. Everything before this is a filter a venue can loosen;
 * this is the rule that decides whether an act can be considered at all.
 */
function eligibility(
  entertainer: EntertainerRecord,
  query: SearchQuery,
  ctx: EligibilityContext,
): MatchReason | null {
  if (!entertainer.isLive) return null;

  if (query.gigType === 'one_time') {
    if (!entertainer.acceptsShortTerm) return null;

    // A one-off with no city is still location-free, but it must be a real
    // date match; without a city we fall back to the act's home city.
    const city = query.cityId ? ctx.cities.get(query.cityId) : null;
    let reason: MatchReason | null = 'based_in_city';
    if (city) {
      reason = locationReachFor(entertainer, city);
      if (!reason) return null;
    }

    if (query.date) {
      const end = query.dateEnd ?? query.date;
      if (!isRangeFree(entertainer.blocks, query.date, end)) return null;
    }
    return reason;
  }

  // Long-term.
  if (!entertainer.acceptsLongTerm) return null;
  if (query.months && !entertainer.contractLengths.includes(query.months)) return null;

  const { start, end } = residencyWindow(query, ctx.today);
  if (query.months && !residencyAvailability(entertainer.blocks, start, end).available) return null;

  const city = query.cityId ? ctx.cities.get(query.cityId) : null;
  if (!city) {
    // Long-term with no city: the global open-to-long-term pool.
    return 'global_long_term_pool';
  }

  // Long-term with a city: local acts, plus the relocation pool from anywhere.
  const local = locationReachFor(entertainer, city);
  if (local) return local;
  if (entertainer.openToRelocate) return 'open_to_relocate';
  return null;
}

function cardPrice(entertainer: EntertainerRecord, query: SearchQuery): { priceFrom: Minor; unit: 'hour' | 'month'; exact: Minor | null } {
  if (query.gigType === 'long_term') {
    return { priceFrom: startingFromMonthly(entertainer.rateCard) ?? 0, unit: 'month', exact: null };
  }
  const exact = query.date
    ? resolveHourlyRate(entertainer.rateCard, query.date, query.timeBlock ?? 'evening').hourly
    : null;
  return { priceFrom: startingFromHourly(entertainer.rateCard), unit: 'hour', exact };
}

function passesFilters(entertainer: EntertainerRecord, query: SearchQuery, priceForBudget: Minor): boolean {
  if (query.category && entertainer.category !== query.category) return false;
  if (query.genres?.length) {
    const wanted = new Set(query.genres.map((g) => g.toLowerCase()));
    if (!entertainer.genres.some((g) => wanted.has(g.toLowerCase()))) return false;
  }
  if (query.countryOfOrigin && entertainer.countryOfOrigin !== query.countryOfOrigin) return false;
  if (query.verifiedOnly && !entertainer.verified) return false;
  if (query.minRating != null && (entertainer.rating ?? 0) < query.minRating) return false;
  if (query.budgetMax != null && priceForBudget > query.budgetMax) return false;
  if (query.budgetMin != null && priceForBudget < query.budgetMin) return false;
  return true;
}

/**
 * Ranking for `best_match`. Deliberately simple and explainable: a venue should
 * be able to tell why an act is near the top.
 */
function score(entertainer: EntertainerRecord, reason: MatchReason): number {
  let s = 0;
  if (reason === 'based_in_city') s += 30;
  else if (reason === 'travels_to_city') s += 22;
  else if (reason === 'within_travel_radius') s += 18;
  else if (reason === 'open_to_relocate') s += 12;
  s += (entertainer.rating ?? 0) * 6;
  s += Math.min(entertainer.reviewCount, 40) * 0.25;
  if (entertainer.verified) s += 8;
  if (entertainer.featured) s += 5;
  return s;
}

export interface SearchOutcome {
  results: SearchResult[];
  total: number;
  /** Echoed back so the UI can label the result count, e.g. "12 · RESIDENCY-READY". */
  gigType: GigType;
}

export function searchEntertainers(
  pool: EntertainerRecord[],
  query: SearchQuery,
  ctx: { cities: CityRef[]; today: IsoDate },
): SearchOutcome {
  const cityMap = new Map(ctx.cities.map((c) => [c.id, c]));
  const eligibilityCtx: EligibilityContext = { cities: cityMap, today: ctx.today };

  const results: SearchResult[] = [];
  for (const entertainer of pool) {
    const reason = eligibility(entertainer, query, eligibilityCtx);
    if (!reason) continue;

    const { priceFrom, unit, exact } = cardPrice(entertainer, query);
    if (!passesFilters(entertainer, query, exact ?? priceFrom)) continue;

    results.push({ entertainer, reason, priceFrom, priceUnit: unit, exactRate: exact, score: score(entertainer, reason) });
  }

  sortResults(results, query.sort ?? (query.gigType === 'long_term' ? 'longest_available' : 'best_match'));
  return { results, total: results.length, gigType: query.gigType };
}

function sortResults(results: SearchResult[], sort: SortKey): void {
  const byName = (a: SearchResult, b: SearchResult) =>
    a.entertainer.stageName.localeCompare(b.entertainer.stageName);

  switch (sort) {
    case 'price_asc':
      results.sort((a, b) => a.priceFrom - b.priceFrom || byName(a, b));
      break;
    case 'price_desc':
      results.sort((a, b) => b.priceFrom - a.priceFrom || byName(a, b));
      break;
    case 'rating':
      results.sort((a, b) => (b.entertainer.rating ?? 0) - (a.entertainer.rating ?? 0) || byName(a, b));
      break;
    case 'longest_available':
      results.sort(
        (a, b) =>
          Math.max(...b.entertainer.contractLengths, 0) - Math.max(...a.entertainer.contractLengths, 0) ||
          b.score - a.score ||
          byName(a, b),
      );
      break;
    default:
      results.sort((a, b) => b.score - a.score || byName(a, b));
  }
}

export const MATCH_REASON_LABEL: Record<MatchReason, string> = {
  based_in_city: 'Based here',
  travels_to_city: 'Travels here',
  within_travel_radius: 'Within travel radius',
  open_to_relocate: 'Open to relocation',
  global_long_term_pool: 'Residency-ready',
};
