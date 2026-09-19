import { describe, expect, it } from 'vitest';
import { searchEntertainers, type CityRef, type EntertainerRecord } from '@/domain/search';
import type { RateCard } from '@/domain/rates';

const dubai: CityRef = { id: 'dubai', name: 'Dubai', country: 'AE', lat: 25.2048, lng: 55.2708 };
const abuDhabi: CityRef = { id: 'abu-dhabi', name: 'Abu Dhabi', country: 'AE', lat: 24.4539, lng: 54.3773 };
const london: CityRef = { id: 'london', name: 'London', country: 'GB', lat: 51.5072, lng: -0.1276 };
const cities = [dubai, abuDhabi, london];

const rateCard = (hourly: number, monthly?: number): RateCard => ({
  currency: 'AED',
  baseHourly: hourly,
  minimumHours: 2,
  rules: [],
  specialDates: [],
  residency: monthly
    ? { monthly, daysPerWeekIncluded: 4, extraDayRate: 50000, contractLengths: [3, 6] }
    : undefined,
});

function act(overrides: Partial<EntertainerRecord> & { id: string }): EntertainerRecord {
  return {
    slug: overrides.id,
    stageName: overrides.id,
    shortBio: 'bio',
    category: 'singer',
    genres: ['soul'],
    countryOfOrigin: 'AE',
    homeCity: dubai,
    travelCities: [],
    travelRadiusKm: 0,
    acceptsShortTerm: true,
    acceptsLongTerm: false,
    openToRelocate: false,
    contractLengths: [],
    residencyInquiryPolicy: 'when_largely_free',
    rateCard: rateCard(40000, 1200000),
    blocks: [],
    rating: 4.5,
    reviewCount: 10,
    verified: false,
    featured: false,
    isLive: true,
    heroAccent: '#ff5fa2',
    teamSize: 1,
    ...overrides,
  };
}

const ctx = { cities, today: '2026-11-01' };
const names = (r: ReturnType<typeof searchEntertainers>) => r.results.map((x) => x.entertainer.id).sort();

describe('one-time gigs stay local', () => {
  const local = act({ id: 'local' });
  const remote = act({ id: 'remote', homeCity: london, openToRelocate: true, acceptsLongTerm: true, contractLengths: [3, 6] });
  const traveller = act({ id: 'traveller', homeCity: london, travelCities: ['dubai'] });
  const nearby = act({ id: 'nearby', homeCity: abuDhabi, travelRadiusKm: 200 });

  it('never surfaces an act in another country for a one-off local date', () => {
    const out = searchEntertainers([local, remote], { gigType: 'one_time', cityId: 'dubai', date: '2026-12-31' }, ctx);
    expect(names(out)).toEqual(['local']);
  });

  it('includes an act that has marked itself as travelling to the city', () => {
    const out = searchEntertainers([traveller], { gigType: 'one_time', cityId: 'dubai', date: '2026-12-31' }, ctx);
    expect(out.results[0]?.reason).toBe('travels_to_city');
  });

  it('includes an act whose travel radius reaches the city', () => {
    const out = searchEntertainers([nearby], { gigType: 'one_time', cityId: 'dubai', date: '2026-12-31' }, ctx);
    expect(out.results[0]?.reason).toBe('within_travel_radius');
    // Abu Dhabi to Dubai is roughly 120 km, inside the 200 km radius.
  });

  it('excludes an act whose radius falls short', () => {
    const shortRadius = act({ id: 'short', homeCity: abuDhabi, travelRadiusKm: 50 });
    const out = searchEntertainers([shortRadius], { gigType: 'one_time', cityId: 'dubai', date: '2026-12-31' }, ctx);
    expect(out.total).toBe(0);
  });

  it('excludes an act already booked on the date', () => {
    const busy = act({
      id: 'busy',
      blocks: [{ id: 'x', kind: 'single', source: 'booking', start: '2026-12-31', end: '2026-12-31', bookingId: 'b' }],
    });
    const out = searchEntertainers([local, busy], { gigType: 'one_time', cityId: 'dubai', date: '2026-12-31' }, ctx);
    expect(names(out)).toEqual(['local']);
  });

  it('requires the whole run of a multi-day gig to be free', () => {
    const partlyBusy = act({
      id: 'partly',
      blocks: [{ id: 'x', kind: 'single', source: 'manual', start: '2027-01-02', end: '2027-01-02' }],
    });
    const out = searchEntertainers(
      [local, partlyBusy],
      { gigType: 'one_time', cityId: 'dubai', date: '2027-01-01', dateEnd: '2027-01-03' },
      ctx,
    );
    expect(names(out)).toEqual(['local']);
  });

  it('excludes an act that only takes residencies', () => {
    const residencyOnly = act({ id: 'res-only', acceptsShortTerm: false, acceptsLongTerm: true, contractLengths: [6] });
    const out = searchEntertainers([residencyOnly], { gigType: 'one_time', cityId: 'dubai', date: '2026-12-31' }, ctx);
    expect(out.total).toBe(0);
  });
});

describe('long-term searches reach the relocation pool', () => {
  const localResidency = act({ id: 'local-res', acceptsLongTerm: true, contractLengths: [3, 6] });
  const relocator = act({
    id: 'relocator',
    homeCity: london,
    acceptsLongTerm: true,
    openToRelocate: true,
    contractLengths: [3, 6],
  });
  const stayPut = act({
    id: 'stay-put',
    homeCity: london,
    acceptsLongTerm: true,
    openToRelocate: false,
    contractLengths: [3, 6],
  });

  it('pulls in acts anywhere who are open to relocate, alongside local ones', () => {
    const out = searchEntertainers(
      [localResidency, relocator, stayPut],
      { gigType: 'long_term', cityId: 'dubai', months: 3, startDate: '2026-12-01' },
      ctx,
    );
    expect(names(out)).toEqual(['local-res', 'relocator']);
  });

  it('labels why each act is eligible', () => {
    const out = searchEntertainers(
      [localResidency, relocator],
      { gigType: 'long_term', cityId: 'dubai', months: 3, startDate: '2026-12-01' },
      ctx,
    );
    const reasons = Object.fromEntries(out.results.map((r) => [r.entertainer.id, r.reason]));
    expect(reasons['local-res']).toBe('based_in_city');
    expect(reasons['relocator']).toBe('open_to_relocate');
  });

  it('returns the whole global pool when no city is set', () => {
    const out = searchEntertainers(
      [localResidency, relocator, stayPut],
      { gigType: 'long_term', months: 3, startDate: '2026-12-01' },
      ctx,
    );
    expect(names(out)).toEqual(['local-res', 'relocator', 'stay-put']);
    expect(out.results.every((r) => r.reason === 'global_long_term_pool')).toBe(true);
  });

  it('excludes an act that does not offer the requested contract length', () => {
    const shortOnly = act({ id: 'one-month', acceptsLongTerm: true, contractLengths: [1] });
    const out = searchEntertainers([shortOnly], { gigType: 'long_term', months: 6, startDate: '2026-12-01' }, ctx);
    expect(out.total).toBe(0);
  });

  it('excludes an act whose window is already largely committed', () => {
    const booked = act({
      id: 'booked-out',
      acceptsLongTerm: true,
      contractLengths: [3],
      blocks: [{ id: 'x', kind: 'range', source: 'booking', start: '2026-12-01', end: '2027-02-15', bookingId: 'b' }],
    });
    const out = searchEntertainers([booked], { gigType: 'long_term', months: 3, startDate: '2026-12-01' }, ctx);
    expect(out.total).toBe(0);
  });

  it('reports how clear the window is, even when the act is free', () => {
    const out = searchEntertainers(
      [localResidency],
      { gigType: 'long_term', cityId: 'dubai', months: 3, startDate: '2026-12-01' },
      ctx,
    );
    const residency = out.results[0]?.residency;
    expect(residency?.start).toBe('2026-12-01');
    expect(residency?.end).toBe('2027-02-28');
    expect(residency?.blockedDays).toBe(0);
    expect(residency?.largelyFree).toBe(true);
  });

  it('carries no residency state for a one-off search', () => {
    const out = searchEntertainers([localResidency], { gigType: 'one_time', cityId: 'dubai', date: '2026-12-31' }, ctx);
    expect(out.results[0]?.residency).toBeNull();
  });

  it('prices long-term cards per month, not per hour', () => {
    const out = searchEntertainers([localResidency], { gigType: 'long_term', months: 3, startDate: '2026-12-01' }, ctx);
    expect(out.results[0]?.priceUnit).toBe('month');
    expect(out.results[0]?.priceFrom).toBe(1200000);
  });
});

describe('an act who wants residency inquiries while booked', () => {
  // Most of December and January already committed — well past the default
  // tolerance, so the standard gate would hide this act.
  const busyWindow = [
    { id: 'x', kind: 'range' as const, source: 'booking' as const, start: '2026-12-01', end: '2027-01-31', bookingId: 'b' },
  ];

  const cautious = act({
    id: 'cautious',
    acceptsLongTerm: true,
    contractLengths: [3],
    blocks: busyWindow,
    residencyInquiryPolicy: 'when_largely_free',
  });

  const openAnyway = act({
    id: 'open-anyway',
    acceptsLongTerm: true,
    contractLengths: [3],
    blocks: busyWindow,
    residencyInquiryPolicy: 'always',
  });

  const query = { gigType: 'long_term' as const, cityId: 'dubai', months: 3 as const, startDate: '2026-12-01' };

  it('stays in the results where the cautious act drops out', () => {
    expect(names(searchEntertainers([cautious, openAnyway], query, ctx))).toEqual(['open-anyway']);
  });

  it('is shown with the conflicts attached, not as though the window were clear', () => {
    const result = searchEntertainers([openAnyway], query, ctx).results[0];
    expect(result.residency?.largelyFree).toBe(false);
    expect(result.residency?.blockedDays).toBe(62);
    expect(result.residency?.totalDays).toBe(90);
  });

  it('ranks below an act who is actually free that window', () => {
    const clear = act({ id: 'clear', acceptsLongTerm: true, contractLengths: [3] });
    const out = searchEntertainers([openAnyway, clear], query, ctx);
    expect(out.results.map((r) => r.entertainer.id)).toEqual(['clear', 'open-anyway']);
  });

  it('does not change what a one-off search does — that clash is absolute', () => {
    const openOnDate = act({
      id: 'open-anyway-oneoff',
      residencyInquiryPolicy: 'always',
      blocks: [{ id: 'x', kind: 'single', source: 'booking', start: '2026-12-31', end: '2026-12-31', bookingId: 'b' }],
    });
    const out = searchEntertainers([openOnDate], { gigType: 'one_time', cityId: 'dubai', date: '2026-12-31' }, ctx);
    expect(out.total).toBe(0);
  });

  it('still respects the contract lengths the act will consider', () => {
    const out = searchEntertainers([openAnyway], { ...query, months: 6 }, ctx);
    expect(out.total).toBe(0);
  });

  it('still respects relocation — being open while busy is not being open to move', () => {
    const remote = act({
      id: 'remote-busy',
      homeCity: london,
      acceptsLongTerm: true,
      openToRelocate: false,
      contractLengths: [3],
      blocks: busyWindow,
      residencyInquiryPolicy: 'always',
    });
    expect(names(searchEntertainers([remote], query, ctx))).toEqual([]);
  });
});

describe('filters', () => {
  const soul = act({ id: 'soul', genres: ['soul', 'rnb'], rating: 4.9, verified: true });
  const jazz = act({ id: 'jazz', category: 'band', genres: ['jazz'], rating: 4.2, rateCard: rateCard(90000) });

  const base = { gigType: 'one_time' as const, cityId: 'dubai', date: '2026-12-31' };

  it('filters by category', () => {
    expect(names(searchEntertainers([soul, jazz], { ...base, category: 'band' }, ctx))).toEqual(['jazz']);
  });

  it('filters by genre, case-insensitively', () => {
    expect(names(searchEntertainers([soul, jazz], { ...base, genres: ['SOUL'] }, ctx))).toEqual(['soul']);
  });

  it('filters by budget ceiling', () => {
    expect(names(searchEntertainers([soul, jazz], { ...base, budgetMax: 50000 }, ctx))).toEqual(['soul']);
  });

  it('budgets against the resolved rate for the searched date, not the "from" price', () => {
    const premium = act({
      id: 'premium',
      rateCard: {
        ...rateCard(40000),
        specialDates: [{ date: '2026-12-31', label: 'NYE', hourly: 300000 }],
      },
    });
    expect(names(searchEntertainers([premium], { ...base, budgetMax: 50000 }, ctx))).toEqual([]);
    expect(names(searchEntertainers([premium], { ...base, budgetMax: 400000 }, ctx))).toEqual(['premium']);
  });

  it('filters by verified badge and rating', () => {
    expect(names(searchEntertainers([soul, jazz], { ...base, verifiedOnly: true }, ctx))).toEqual(['soul']);
    expect(names(searchEntertainers([soul, jazz], { ...base, minRating: 4.5 }, ctx))).toEqual(['soul']);
  });

  it('filters by country of origin', () => {
    const french = act({ id: 'french', countryOfOrigin: 'FR' });
    expect(names(searchEntertainers([soul, french], { ...base, countryOfOrigin: 'FR' }, ctx))).toEqual(['french']);
  });

  it('never returns a profile that is not live', () => {
    const pending = act({ id: 'pending', isLive: false });
    expect(names(searchEntertainers([soul, pending], base, ctx))).toEqual(['soul']);
  });
});

describe('sorting', () => {
  const cheap = act({ id: 'cheap', rateCard: rateCard(20000), rating: 3.5 });
  const pricey = act({ id: 'pricey', rateCard: rateCard(90000), rating: 5 });
  const base = { gigType: 'one_time' as const, cityId: 'dubai', date: '2026-12-31' };

  it('sorts by price ascending', () => {
    const out = searchEntertainers([pricey, cheap], { ...base, sort: 'price_asc' }, ctx);
    expect(out.results.map((r) => r.entertainer.id)).toEqual(['cheap', 'pricey']);
  });

  it('sorts by rating', () => {
    const out = searchEntertainers([cheap, pricey], { ...base, sort: 'rating' }, ctx);
    expect(out.results.map((r) => r.entertainer.id)).toEqual(['pricey', 'cheap']);
  });
});
