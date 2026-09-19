/**
 * Where exchange rates come from.
 *
 * A built-in table ships with the app so a conversion never depends on a
 * network call succeeding. When `BOOKTHEACT_FX_URL` is set, rates are refreshed
 * from it and cached; any failure falls back to the built-in table rather than
 * showing the visitor nothing.
 *
 * The built-in numbers are indicative and go stale. That is why `asOf` travels
 * with them and the interface prints it: a conversion carrying a date can be
 * judged, one without a date is a number pretending to be a fact.
 */
import { BASE_CURRENCY, type FxTable } from '@/domain/currency';

/**
 * Units of each currency per 1 AED. Refresh by setting BOOKTHEACT_FX_URL, or
 * by editing these and moving `asOf` — there is nowhere else to change.
 */
const BUILT_IN: FxTable = {
  base: BASE_CURRENCY,
  asOf: '2026-09-01',
  source: 'built-in',
  rates: {
    AED: 1,
    USD: 0.2723,
    EUR: 0.2497,
    GBP: 0.2137,
    CHF: 0.2296,
    SAR: 1.0212,
    QAR: 0.9913,
    KWD: 0.0833,
    BHD: 0.1026,
    OMR: 0.1048,
    INR: 23.94,
    PKR: 76.21,
    EGP: 13.24,
    ZAR: 4.902,
    TRY: 10.92,
    RUB: 23.18,
    CNY: 1.943,
    JPY: 40.18,
    KRW: 367.4,
    SGD: 0.3495,
    HKD: 2.124,
    AUD: 0.4116,
    NZD: 0.4498,
    CAD: 0.3701,
    THB: 8.789,
    MYR: 1.148,
    IDR: 4451,
    PHP: 15.42,
    BRL: 1.482,
    MXN: 5.072,
    NGN: 416.3,
    KES: 35.19,
    MAD: 2.656,
    JOD: 0.1930,
    LBP: 24370,
    SEK: 2.601,
    NOK: 2.723,
    DKK: 1.863,
    PLN: 1.003,
    CZK: 5.752,
    HUF: 94.68,
    RON: 1.242,
    BGN: 0.4884,
    ISK: 34.12,
    UAH: 11.27,
    RSD: 29.26,
    BAM: 0.4884,
    ALL: 24.36,
    MKD: 15.37,
    MDL: 4.741,
    GEL: 0.7364,
    AMD: 105.2,
    AZN: 0.4629,
    ILS: 0.9914,
    VND: 6912,
    BDT: 32.54,
    LKR: 81.94,
    NPR: 38.31,
    TWD: 8.412,
    GHS: 3.268,
    TZS: 712.4,
    UGX: 998.2,
    DZD: 35.64,
    TND: 0.8362,
    IQD: 356.7,
    CLP: 258.4,
    COP: 1094,
    ARS: 368.9,
    PEN: 1.012,
  },
};

/** How long a fetched table is reused before another attempt. */
const CACHE_SECONDS = 6 * 60 * 60;

/**
 * The response shape of the usual free endpoints (open.er-api.com and
 * exchangerate.host both return `rates` keyed by code). Anything else is
 * treated as a failure and the built-in table is used.
 */
interface FxResponse {
  base_code?: string;
  base?: string;
  time_last_update_utc?: string;
  date?: string;
  rates?: Record<string, number>;
}

let warned = false;

export async function fxTable(): Promise<FxTable> {
  const url = process.env.BOOKTHEACT_FX_URL;
  if (!url) return BUILT_IN;

  try {
    const res = await fetch(url, { next: { revalidate: CACHE_SECONDS } });
    if (!res.ok) throw new Error(`rates endpoint returned ${res.status}`);
    const body = (await res.json()) as FxResponse;

    const base = (body.base_code ?? body.base ?? '').toUpperCase();
    if (base !== BASE_CURRENCY) throw new Error(`rates are quoted against ${base || 'nothing'}, not ${BASE_CURRENCY}`);
    if (!body.rates || typeof body.rates !== 'object') throw new Error('no rates in the response');

    // Keep only the currencies we can print, and only sane numbers.
    const rates: Record<string, number> = { [BASE_CURRENCY]: 1 };
    for (const code of Object.keys(BUILT_IN.rates)) {
      const value = body.rates[code];
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) rates[code] = value;
    }
    // A response missing most of what we ask for is a bad response.
    if (Object.keys(rates).length < Object.keys(BUILT_IN.rates).length / 2) {
      throw new Error('the response covered too few currencies');
    }

    const stamp = body.time_last_update_utc ?? body.date;
    const asOf = stamp ? new Date(stamp).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    return { base: BASE_CURRENCY, asOf, rates, source: 'live' };
  } catch (err) {
    // Once per process: a broken rates feed should be findable in the logs but
    // must not turn every page render into a log line.
    if (!warned) {
      warned = true;
      console.warn('[fx] falling back to the built-in table:', err instanceof Error ? err.message : err);
    }
    return BUILT_IN;
  }
}

export const BUILT_IN_FX = BUILT_IN;
