/**
 * Currencies, and what a listing price looks like to someone who does not
 * think in it.
 *
 * Two rules shape everything here:
 *
 *  1. A listing is priced in one currency and that is the currency the act is
 *     paid in. A conversion is a courtesy, never the deal — so a converted
 *     figure is always marked approximate and never replaces the original.
 *  2. Nothing in this file talks to the network or reads a request. It takes a
 *     rate table and gives an answer, which is why it can be tested.
 */

/** ISO 4217, with what it takes to print an amount in it. */
export interface Currency {
  code: string;
  /** Written before the number where the convention is a symbol. */
  symbol: string;
  name: string;
  /** Most currencies divide by 100. A few — JPY, KRW — do not divide at all. */
  minorUnits: 0 | 2;
  /** Grouping and separators follow this, not the visitor's browser. */
  locale: string;
}

export const CURRENCIES: Record<string, Currency> = {
  AED: { code: 'AED', symbol: 'AED', name: 'UAE dirham', minorUnits: 2, locale: 'en-AE' },
  SAR: { code: 'SAR', symbol: 'SAR', name: 'Saudi riyal', minorUnits: 2, locale: 'en-SA' },
  QAR: { code: 'QAR', symbol: 'QAR', name: 'Qatari riyal', minorUnits: 2, locale: 'en-QA' },
  KWD: { code: 'KWD', symbol: 'KWD', name: 'Kuwaiti dinar', minorUnits: 2, locale: 'en-KW' },
  BHD: { code: 'BHD', symbol: 'BHD', name: 'Bahraini dinar', minorUnits: 2, locale: 'en-BH' },
  OMR: { code: 'OMR', symbol: 'OMR', name: 'Omani rial', minorUnits: 2, locale: 'en-OM' },
  USD: { code: 'USD', symbol: '$', name: 'US dollar', minorUnits: 2, locale: 'en-US' },
  EUR: { code: 'EUR', symbol: '€', name: 'Euro', minorUnits: 2, locale: 'en-IE' },
  GBP: { code: 'GBP', symbol: '£', name: 'Pound sterling', minorUnits: 2, locale: 'en-GB' },
  CHF: { code: 'CHF', symbol: 'CHF', name: 'Swiss franc', minorUnits: 2, locale: 'de-CH' },
  INR: { code: 'INR', symbol: '₹', name: 'Indian rupee', minorUnits: 2, locale: 'en-IN' },
  PKR: { code: 'PKR', symbol: 'PKR', name: 'Pakistani rupee', minorUnits: 2, locale: 'en-PK' },
  EGP: { code: 'EGP', symbol: 'EGP', name: 'Egyptian pound', minorUnits: 2, locale: 'en-EG' },
  ZAR: { code: 'ZAR', symbol: 'R', name: 'South African rand', minorUnits: 2, locale: 'en-ZA' },
  TRY: { code: 'TRY', symbol: '₺', name: 'Turkish lira', minorUnits: 2, locale: 'tr-TR' },
  RUB: { code: 'RUB', symbol: '₽', name: 'Russian rouble', minorUnits: 2, locale: 'ru-RU' },
  CNY: { code: 'CNY', symbol: '¥', name: 'Chinese yuan', minorUnits: 2, locale: 'zh-CN' },
  JPY: { code: 'JPY', symbol: '¥', name: 'Japanese yen', minorUnits: 0, locale: 'ja-JP' },
  KRW: { code: 'KRW', symbol: '₩', name: 'South Korean won', minorUnits: 0, locale: 'ko-KR' },
  SGD: { code: 'SGD', symbol: 'S$', name: 'Singapore dollar', minorUnits: 2, locale: 'en-SG' },
  HKD: { code: 'HKD', symbol: 'HK$', name: 'Hong Kong dollar', minorUnits: 2, locale: 'en-HK' },
  AUD: { code: 'AUD', symbol: 'A$', name: 'Australian dollar', minorUnits: 2, locale: 'en-AU' },
  NZD: { code: 'NZD', symbol: 'NZ$', name: 'New Zealand dollar', minorUnits: 2, locale: 'en-NZ' },
  CAD: { code: 'CAD', symbol: 'C$', name: 'Canadian dollar', minorUnits: 2, locale: 'en-CA' },
  THB: { code: 'THB', symbol: '฿', name: 'Thai baht', minorUnits: 2, locale: 'th-TH' },
  MYR: { code: 'MYR', symbol: 'RM', name: 'Malaysian ringgit', minorUnits: 2, locale: 'en-MY' },
  IDR: { code: 'IDR', symbol: 'Rp', name: 'Indonesian rupiah', minorUnits: 2, locale: 'id-ID' },
  PHP: { code: 'PHP', symbol: '₱', name: 'Philippine peso', minorUnits: 2, locale: 'en-PH' },
  BRL: { code: 'BRL', symbol: 'R$', name: 'Brazilian real', minorUnits: 2, locale: 'pt-BR' },
  MXN: { code: 'MXN', symbol: 'MX$', name: 'Mexican peso', minorUnits: 2, locale: 'es-MX' },
  NGN: { code: 'NGN', symbol: '₦', name: 'Nigerian naira', minorUnits: 2, locale: 'en-NG' },
  KES: { code: 'KES', symbol: 'KSh', name: 'Kenyan shilling', minorUnits: 2, locale: 'en-KE' },
  MAD: { code: 'MAD', symbol: 'MAD', name: 'Moroccan dirham', minorUnits: 2, locale: 'fr-MA' },
  JOD: { code: 'JOD', symbol: 'JOD', name: 'Jordanian dinar', minorUnits: 2, locale: 'en-JO' },
  LBP: { code: 'LBP', symbol: 'LBP', name: 'Lebanese pound', minorUnits: 2, locale: 'en-LB' },
  SEK: { code: 'SEK', symbol: 'kr', name: 'Swedish krona', minorUnits: 2, locale: 'sv-SE' },
  NOK: { code: 'NOK', symbol: 'kr', name: 'Norwegian krone', minorUnits: 2, locale: 'nb-NO' },
  DKK: { code: 'DKK', symbol: 'kr', name: 'Danish krone', minorUnits: 2, locale: 'da-DK' },
  PLN: { code: 'PLN', symbol: 'zł', name: 'Polish złoty', minorUnits: 2, locale: 'pl-PL' },
};

/** The marketplace's home currency: what a listing defaults to. */
export const BASE_CURRENCY = 'AED';

/**
 * Country to currency. The euro members are spelled out rather than inferred,
 * because "in the EU" and "uses the euro" are not the same set.
 */
export const COUNTRY_CURRENCY: Record<string, string> = {
  AE: 'AED', SA: 'SAR', QA: 'QAR', KW: 'KWD', BH: 'BHD', OM: 'OMR',
  US: 'USD', PR: 'USD', EC: 'USD', PA: 'USD', SV: 'USD',
  GB: 'GBP', JE: 'GBP', GG: 'GBP', IM: 'GBP',
  AT: 'EUR', BE: 'EUR', CY: 'EUR', EE: 'EUR', FI: 'EUR', FR: 'EUR', DE: 'EUR',
  GR: 'EUR', IE: 'EUR', IT: 'EUR', LV: 'EUR', LT: 'EUR', LU: 'EUR', MT: 'EUR',
  NL: 'EUR', PT: 'EUR', SK: 'EUR', SI: 'EUR', ES: 'EUR', HR: 'EUR', MC: 'EUR', AD: 'EUR',
  CH: 'CHF', LI: 'CHF',
  IN: 'INR', PK: 'PKR', EG: 'EGP', ZA: 'ZAR', TR: 'TRY', RU: 'RUB',
  CN: 'CNY', JP: 'JPY', KR: 'KRW', SG: 'SGD', HK: 'HKD',
  AU: 'AUD', NZ: 'NZD', CA: 'CAD', TH: 'THB', MY: 'MYR', ID: 'IDR', PH: 'PHP',
  BR: 'BRL', MX: 'MXN', NG: 'NGN', KE: 'KES', MA: 'MAD', JO: 'JOD', LB: 'LBP',
  SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN',
};

/**
 * Exchange rates, all quoted against one base: `rates[X]` is how many X one
 * unit of `base` buys. `asOf` is shown to the visitor, because a conversion
 * without a date is a number pretending to be a fact.
 */
export interface FxTable {
  base: string;
  asOf: string;
  rates: Record<string, number>;
  /** Where the numbers came from, for the footnote and for debugging. */
  source: 'live' | 'built-in';
}

/** A currency code, if it is one we can print. */
export function knownCurrency(code: string | null | undefined): string | null {
  if (!code) return null;
  const upper = code.trim().toUpperCase();
  return CURRENCIES[upper] ? upper : null;
}

/** What someone browsing from this country most likely thinks in. */
export function currencyForCountry(country: string | null | undefined): string | null {
  if (!country) return null;
  return COUNTRY_CURRENCY[country.trim().toUpperCase()] ?? null;
}

/**
 * Converts between two currencies through the table's base, so a table quoted
 * against AED can still turn GBP into JPY.
 *
 * Returns null rather than guessing when either side is missing a rate — a
 * missing conversion is shown as nothing at all, never as a wrong number.
 */
export function convert(minor: number, from: string, to: string, fx: FxTable): number | null {
  if (from === to) return minor;
  const rateFrom = from === fx.base ? 1 : fx.rates[from];
  const rateTo = to === fx.base ? 1 : fx.rates[to];
  if (!rateFrom || !rateTo || !Number.isFinite(rateFrom) || !Number.isFinite(rateTo)) return null;

  const fromUnits = CURRENCIES[from]?.minorUnits ?? 2;
  const toUnits = CURRENCIES[to]?.minorUnits ?? 2;
  // Into major units, across, then back — the two sides may not divide alike.
  const major = minor / 10 ** fromUnits;
  const converted = (major / rateFrom) * rateTo;
  return Math.round(converted * 10 ** toUnits);
}

/**
 * Rounds a converted amount to something a person would say out loud.
 *
 * An exact conversion of a round price reads as false precision: AED 350 is a
 * price someone chose, US$95.28 is arithmetic. The step grows with the number
 * but stays near three significant figures, so the rounding never moves the
 * answer by more than about a percent — a courtesy figure may be vague, it may
 * not be wrong.
 */
export function roundForDisplay(minor: number, currency: string): number {
  const units = CURRENCIES[currency]?.minorUnits ?? 2;
  const major = minor / 10 ** units;
  const abs = Math.abs(major);
  const step =
    abs >= 100_000 ? 1_000 : abs >= 10_000 ? 100 : abs >= 1_000 ? 10 : abs >= 100 ? 5 : abs >= 10 ? 1 : 0.1;
  return Math.round(Math.round(major / step) * step * 10 ** units);
}

export interface FormatOptions {
  /** Compact form for a card, where space is tight: "AED 4.2k". */
  short?: boolean;
  /** Drop the code or symbol entirely — for an input's neighbour label. */
  bare?: boolean;
}

/** Minor units in, a display string out. */
export function formatAmount(minor: number, currency: string, options: FormatOptions = {}): string {
  const meta = CURRENCIES[currency] ?? {
    code: currency, symbol: currency, name: currency, minorUnits: 2 as const, locale: 'en-GB',
  };
  const major = minor / 10 ** meta.minorUnits;

  let number: string;
  if (options.short && Math.abs(major) >= 1000) {
    const k = major / 1000;
    number = `${Number.isInteger(k) ? k : k.toFixed(1)}k`;
  } else if (options.short) {
    number = new Intl.NumberFormat(meta.locale, { maximumFractionDigits: 0 }).format(Math.round(major));
  } else {
    const whole = Number.isInteger(major);
    number = new Intl.NumberFormat(meta.locale, {
      minimumFractionDigits: whole ? 0 : meta.minorUnits,
      maximumFractionDigits: meta.minorUnits,
    }).format(major);
  }

  if (options.bare) return number;
  // A symbol sits against the number ("$95"), a code stands off it ("AED 350").
  const spaced = /[A-Za-z]$/.test(meta.symbol);
  return `${meta.symbol}${spaced ? ' ' : ''}${number}`;
}

/**
 * The whole job in one call: what the listing says, and what that is worth to
 * this visitor. `approx` is null whenever there is nothing useful to add —
 * same currency, or no rate — so a caller renders it or does not.
 */
export interface PricePair {
  /** Always the listing's own currency. This is what will be paid. */
  exact: string;
  /** Rounded, approximate, in the visitor's currency. Null when not useful. */
  approx: string | null;
  approxCurrency: string | null;
}

export function priceIn(
  minor: number,
  listingCurrency: string,
  visitorCurrency: string | null,
  fx: FxTable | null,
  options: FormatOptions = {},
): PricePair {
  const exact = formatAmount(minor, listingCurrency, options);
  const to = knownCurrency(visitorCurrency);
  if (!to || !fx || to === listingCurrency) {
    return { exact, approx: null, approxCurrency: null };
  }
  const converted = convert(minor, listingCurrency, to, fx);
  if (converted == null) return { exact, approx: null, approxCurrency: null };
  return {
    exact,
    approx: formatAmount(roundForDisplay(converted, to), to, options),
    approxCurrency: to,
  };
}
