/**
 * Search results.
 *
 * The gig-type toggle is the important control on this page: switching between
 * a one-off and a residency changes which filters are even shown, and changes
 * which entertainers are eligible at all. Filters are URL state, so a venue can
 * share a search with a colleague.
 */
import Link from 'next/link';
import { getDb } from '@/db/client';
import * as repo from '@/db/repo';
import { searchEntertainers, MATCH_REASON_LABEL, type SearchQuery, type SortKey } from '@/domain/search';
import { isIsoDate, today } from '@/domain/dates';
import { CONTRACT_LENGTHS, type ContractLength, type GigType, type TopCategory } from '@/domain/types';
import { pageContext } from '@/lib/page-data';
import { Shell } from '@/components/shell';
import { ActCard, Chip, Empty } from '@/components/ui';
import { CurrencyNote } from '@/components/money';
import { formatDateShort } from '@/lib/format';
import {
  BASE_CURRENCY,
  CURRENCIES,
  convert,
  formatAmount,
  knownCurrency,
  parseAmount,
  type FxTable,
} from '@/domain/currency';

export const dynamic = 'force-dynamic';

type Params = Record<string, string | string[] | undefined>;

const one = (p: Params, key: string): string | null => {
  const v = p[key];
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.length ? s : null;
};

/**
 * Read the query out of the URL, dropping anything malformed rather than
 * failing the page — a hand-edited URL should degrade to a broader search.
 */
function readQuery(p: Params, fx: FxTable | null): SearchQuery {
  const gigType: GigType = one(p, 'gigType') === 'long_term' ? 'long_term' : 'one_time';
  const date = one(p, 'date');
  const dateEnd = one(p, 'dateEnd');
  const startDate = one(p, 'startDate');
  const monthsRaw = Number(one(p, 'months'));
  const months = CONTRACT_LENGTHS.includes(monthsRaw as ContractLength) ? (monthsRaw as ContractLength) : null;
  const budget = one(p, 'budgetMax');
  /*
   * The ceiling is typed in whatever currency the visitor is being shown, and
   * the form says which alongside it. Rates are stored in the listing currency,
   * so it is converted here rather than compared as if the number were dirhams
   * — which is what used to happen, and meant a ceiling of 100 typed by someone
   * seeing euros filtered at AED 100, about a quarter of what they meant.
   */
  const budgetCurrency = knownCurrency(one(p, 'budgetCurrency')) ?? BASE_CURRENCY;
  const budgetMinor = budget ? parseAmount(budget, budgetCurrency) : null;
  const budgetInBase =
    budgetMinor == null || !fx
      ? budgetMinor
      : convert(budgetMinor, budgetCurrency, BASE_CURRENCY, fx) ?? budgetMinor;

  return {
    gigType,
    cityId: one(p, 'city'),
    category: (one(p, 'category') as TopCategory | null) ?? null,
    genres: one(p, 'genre') ? [one(p, 'genre')!] : [],
    countryOfOrigin: one(p, 'origin'),
    date: date && isIsoDate(date) ? date : null,
    dateEnd: dateEnd && isIsoDate(dateEnd) ? dateEnd : null,
    timeBlock: (one(p, 'timeBlock') as SearchQuery['timeBlock']) ?? null,
    months,
    startDate: startDate && isIsoDate(startDate) ? startDate : null,
    budgetMax: budgetInBase,
    minRating: one(p, 'minRating') ? Number(one(p, 'minRating')) : null,
    verifiedOnly: one(p, 'verified') === '1',
    sort: (one(p, 'sort') as SortKey | null) ?? undefined,
  };
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const { user, badges, money } = await pageContext();
  const query = readQuery(params, money.fx);
  // What the budget field shows and accepts: the visitor's own currency.
  const budgetCurrency = knownCurrency(one(params, 'budgetCurrency')) ?? money.currency;
  /*
   * A plain number, not a formatted one: this is an input's value and it has to
   * survive being read back by `parseAmount`. A Czech-formatted "1 234,56" comes
   * back as 123456 once the separators are stripped.
   */
  const budgetShown =
    query.budgetMax == null
      ? ''
      : String(
          ((money.fx ? convert(query.budgetMax, BASE_CURRENCY, budgetCurrency, money.fx) : null) ??
            query.budgetMax) / 10 ** (CURRENCIES[budgetCurrency]?.minorUnits ?? 2),
        );
  // What the collapsed panel reports on a phone: how many filters are doing
  // something. Gig type always has a value, so it is not a narrowing.
  const activeFilters = [
    query.cityId,
    query.category,
    query.genres?.length ? query.genres[0] : null,
    query.countryOfOrigin,
    query.date,
    query.dateEnd,
    query.timeBlock,
    query.months,
    query.startDate,
    query.budgetMax,
    query.minRating,
    query.verifiedOnly || null,
  ].filter(Boolean).length;

  const db = getDb();
  const cities = await repo.listCities(db);
  const categories = await repo.topCategories(db);
  const pool = await repo.liveEntertainers(db);
  const outcome = searchEntertainers(pool, query, { cities, today: today() });

  const longTerm = query.gigType === 'long_term';
  const genreOptions = query.category
    ? await repo.genresFor(db, `cat_${query.category}`)
    : [];

  // Keep the current filters when only the toggle changes.
  const toggleHref = (target: GigType) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (typeof v === 'string' && v) next.set(k, v);
    }
    next.set('gigType', target);
    // Date fields do not carry across: a residency has no single date.
    if (target === 'long_term') {
      next.delete('date');
      next.delete('dateEnd');
      next.delete('timeBlock');
    } else {
      next.delete('months');
      next.delete('startDate');
    }
    return `/search?${next.toString()}`;
  };

  return (
    <Shell user={user} current="/search" badges={badges} money={money}>
      <div className="page page--wide search-layout">
        <form className="panel filters sticky" method="get" action="/search">
          {/*
            The panel collapses on a phone, where the form is taller than the
            screen and would otherwise bury every result under it. A checkbox
            rather than a script: this page works without JavaScript, and it
            has no name so it is never submitted with the query. At desktop
            widths the media query forces the body open and hides the control.
          */}
          <input type="checkbox" id="filters-open" className="filters__switch" />
          <label className="panel__head filters__head" htmlFor="filters-open">
            <span className="eyebrow">Filters</span>
            <span className="filters__state">
              {activeFilters ? `${activeFilters} applied` : 'None applied'}
            </span>
            <span className="filters__chevron" aria-hidden="true" />
          </label>
          <div className="panel__body filters__body stack" style={{ gap: 16 }}>
            {/* The toggle that changes what "available" means. */}
            <div className="field">
              <span className="field__label">Gig type</span>
              <div className="toggle" role="group" aria-label="Gig type">
                <Link
                  href={toggleHref('one_time')}
                  className="toggle__option"
                  aria-pressed={!longTerm}
                  role="button"
                >
                  One-off
                </Link>
                <Link
                  href={toggleHref('long_term')}
                  className="toggle__option"
                  aria-pressed={longTerm}
                  role="button"
                >
                  Residency
                </Link>
              </div>
              <span className="field__hint">
                {longTerm
                  ? 'Residency searches also reach acts elsewhere who are open to relocating.'
                  : 'One-off searches only show acts who can reach your city on the date.'}
              </span>
            </div>
            <input type="hidden" name="gigType" value={query.gigType} />

            <div className="field">
              <label className="field__label" htmlFor="city">
                City
              </label>
              <select className="select" id="city" name="city" defaultValue={query.cityId ?? ''}>
                <option value="">{longTerm ? 'Anywhere' : 'Any city'}</option>
                {cities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {longTerm ? (
              <>
                <div className="field">
                  <label className="field__label" htmlFor="months">
                    Contract length
                  </label>
                  <select className="select" id="months" name="months" defaultValue={query.months ?? ''}>
                    <option value="">Any length</option>
                    {CONTRACT_LENGTHS.map((m) => (
                      <option key={m} value={m}>
                        {m} month{m > 1 ? 's' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label className="field__label" htmlFor="startDate">
                    Target start
                  </label>
                  <input
                    className="input"
                    id="startDate"
                    name="startDate"
                    type="date"
                    defaultValue={query.startDate ?? ''}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="field">
                  <label className="field__label" htmlFor="date">
                    Date
                  </label>
                  <input className="input" id="date" name="date" type="date" defaultValue={query.date ?? ''} />
                </div>
                <div className="field">
                  <label className="field__label" htmlFor="dateEnd">
                    Through (for a short run)
                  </label>
                  <input
                    className="input"
                    id="dateEnd"
                    name="dateEnd"
                    type="date"
                    defaultValue={query.dateEnd ?? ''}
                  />
                </div>
                <div className="field">
                  <label className="field__label" htmlFor="timeBlock">
                    Time of day
                  </label>
                  <select className="select" id="timeBlock" name="timeBlock" defaultValue={query.timeBlock ?? ''}>
                    <option value="">Any</option>
                    <option value="daytime">Daytime</option>
                    <option value="evening">Evening</option>
                    <option value="late_night">Late night</option>
                  </select>
                </div>
              </>
            )}

            <div className="field">
              <label className="field__label" htmlFor="category">
                Category
              </label>
              <select className="select" id="category" name="category" defaultValue={query.category ?? ''}>
                <option value="">Any category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.slug}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            {genreOptions.length ? (
              <div className="field">
                <label className="field__label" htmlFor="genre">
                  Genre
                </label>
                <select className="select" id="genre" name="genre" defaultValue={query.genres?.[0] ?? ''}>
                  <option value="">Any genre</option>
                  {genreOptions.map((g) => (
                    <option key={g.id} value={g.slug}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="field">
              <label className="field__label" htmlFor="budgetMax">
                Budget ceiling ({longTerm ? 'per month' : 'per hour'}) in {budgetCurrency}
              </label>
              <input
                className="input"
                id="budgetMax"
                name="budgetMax"
                inputMode="decimal"
                placeholder={budgetCurrency}
                defaultValue={budgetShown}
              />
              {/* Travels with the number so the server knows what it meant. */}
              <input type="hidden" name="budgetCurrency" value={budgetCurrency} />
              {budgetCurrency !== BASE_CURRENCY && query.budgetMax != null ? (
                <div className="field__hint">
                  Matched against listing rates as {formatAmount(query.budgetMax, BASE_CURRENCY)}
                </div>
              ) : null}
            </div>

            <div className="field">
              <label className="field__label" htmlFor="minRating">
                Minimum rating
              </label>
              <select className="select" id="minRating" name="minRating" defaultValue={query.minRating ?? ''}>
                <option value="">Any</option>
                <option value="4">4.0+</option>
                <option value="4.5">4.5+</option>
              </select>
            </div>

            <label className="checkline">
              <input type="checkbox" name="verified" value="1" defaultChecked={query.verifiedOnly} />
              <span>Verified acts only</span>
            </label>

            <div className="field">
              <label className="field__label" htmlFor="sort">
                Sort
              </label>
              <select className="select" id="sort" name="sort" defaultValue={query.sort ?? ''}>
                <option value="">{longTerm ? 'Longest available' : 'Best match'}</option>
                <option value="price_asc">Price, low to high</option>
                <option value="price_desc">Price, high to low</option>
                <option value="rating">Rating</option>
              </select>
            </div>

            <button className="btn btn--primary btn--block" type="submit">
              Apply filters
            </button>
            <Link className="btn btn--ghost btn--block" href={`/search?gigType=${query.gigType}`}>
              Clear
            </Link>
          </div>
        </form>

        <div>
          <div className="spread" style={{ marginBottom: 16 }}>
            <div>
              <div className="eyebrow">
                {outcome.total} entertainer{outcome.total === 1 ? '' : 's'} ·{' '}
                {longTerm ? 'residency-ready' : 'one-time'}
              </div>
              <h1 className="title" style={{ marginTop: 4 }}>
                {longTerm ? 'Residencies' : 'One-off gigs'}
                {query.cityId ? ` in ${cities.find((c) => c.id === query.cityId)?.name}` : ''}
              </h1>
            </div>
          </div>

          <div className="row row--tight" style={{ marginBottom: 18 }}>
            {longTerm && !query.cityId ? <Chip accent>Global pool — no city set</Chip> : null}
            {query.date ? <Chip>{formatDateShort(query.date)}</Chip> : null}
            {query.months ? <Chip>{query.months} months</Chip> : null}
            {query.category ? <Chip>{categories.find((c) => c.slug === query.category)?.label}</Chip> : null}
            {query.verifiedOnly ? <Chip accent>Verified only</Chip> : null}
          </div>

          {outcome.total === 0 ? (
            <Empty>
              Nothing matches yet.{' '}
              {longTerm
                ? 'Try a shorter contract, or clear the city to reach acts open to relocating.'
                : 'Try another date, or widen the city — some acts travel but have not listed yours.'}
            </Empty>
          ) : (
            <div className="grid grid--cards">
              {outcome.results.map((r) => (
                <ActCard
                  key={r.entertainer.id}
                  slug={r.entertainer.slug}
                  name={r.entertainer.stageName}
                  accent={r.entertainer.heroAccent}
                  photo={r.entertainer.photo}
                  categoryLabel={(r.entertainer as repo.EntertainerDetail).categoryLabel}
                  genreLabels={(r.entertainer as repo.EntertainerDetail).genreLabels}
                  cityName={r.entertainer.homeCity.name}
                  priceFrom={r.exactRate ?? r.priceFrom}
                  priceUnit={r.priceUnit}
                  currency={r.entertainer.rateCard.currency}
                  rating={r.entertainer.rating}
                  reviewCount={r.entertainer.reviewCount}
                  verified={r.entertainer.verified}
                  reason={r.reason}
                  badge={
                    r.entertainer.featured
                      ? 'Featured'
                      : r.reason === 'open_to_relocate'
                        ? 'Will relocate'
                        : null
                  }
                  priceNote={r.exactRate && query.date ? `on ${formatDateShort(query.date)}` : null}
                  windowNote={
                    r.residency && !r.residency.largelyFree
                      ? `${r.residency.blockedDays} of ${r.residency.totalDays} days already booked — open to talking`
                      : null
                  }
                />
              ))}
            </div>
          )}

          <p className="dim" style={{ marginTop: 22, fontSize: 12 }}>
            {longTerm
              ? `Residency matching: acts based in the city, plus anyone anywhere marked ${MATCH_REASON_LABEL.open_to_relocate.toLowerCase()}. ` +
                'Acts who take residency inquiries while already booked appear too, with their committed days shown.'
              : 'One-off matching: acts based in, travelling to, or within travel range of the city, and free on the date.'}
          </p>
          <CurrencyNote style={{ marginTop: 4 }} />
        </div>
      </div>
    </Shell>
  );
}
