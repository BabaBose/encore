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
  CZK: { code: 'CZK', symbol: 'Kč', name: 'Czech koruna', minorUnits: 2, locale: 'cs-CZ' },
  HUF: { code: 'HUF', symbol: 'Ft', name: 'Hungarian forint', minorUnits: 2, locale: 'hu-HU' },
  RON: { code: 'RON', symbol: 'lei', name: 'Romanian leu', minorUnits: 2, locale: 'ro-RO' },
  BGN: { code: 'BGN', symbol: 'лв', name: 'Bulgarian lev', minorUnits: 2, locale: 'bg-BG' },
  ISK: { code: 'ISK', symbol: 'kr', name: 'Icelandic króna', minorUnits: 0, locale: 'is-IS' },
  UAH: { code: 'UAH', symbol: '₴', name: 'Ukrainian hryvnia', minorUnits: 2, locale: 'uk-UA' },
  RSD: { code: 'RSD', symbol: 'RSD', name: 'Serbian dinar', minorUnits: 2, locale: 'sr-RS' },
  BAM: { code: 'BAM', symbol: 'KM', name: 'Bosnian mark', minorUnits: 2, locale: 'bs-BA' },
  ALL: { code: 'ALL', symbol: 'L', name: 'Albanian lek', minorUnits: 2, locale: 'sq-AL' },
  MKD: { code: 'MKD', symbol: 'ден', name: 'Macedonian denar', minorUnits: 2, locale: 'mk-MK' },
  MDL: { code: 'MDL', symbol: 'L', name: 'Moldovan leu', minorUnits: 2, locale: 'ro-MD' },
  GEL: { code: 'GEL', symbol: '₾', name: 'Georgian lari', minorUnits: 2, locale: 'ka-GE' },
  AMD: { code: 'AMD', symbol: '֏', name: 'Armenian dram', minorUnits: 2, locale: 'hy-AM' },
  AZN: { code: 'AZN', symbol: '₼', name: 'Azerbaijani manat', minorUnits: 2, locale: 'az-AZ' },
  ILS: { code: 'ILS', symbol: '₪', name: 'Israeli shekel', minorUnits: 2, locale: 'he-IL' },
  VND: { code: 'VND', symbol: '₫', name: 'Vietnamese dong', minorUnits: 0, locale: 'vi-VN' },
  BDT: { code: 'BDT', symbol: '৳', name: 'Bangladeshi taka', minorUnits: 2, locale: 'bn-BD' },
  LKR: { code: 'LKR', symbol: 'Rs', name: 'Sri Lankan rupee', minorUnits: 2, locale: 'si-LK' },
  NPR: { code: 'NPR', symbol: 'Rs', name: 'Nepalese rupee', minorUnits: 2, locale: 'ne-NP' },
  TWD: { code: 'TWD', symbol: 'NT$', name: 'New Taiwan dollar', minorUnits: 2, locale: 'zh-TW' },
  GHS: { code: 'GHS', symbol: 'GH₵', name: 'Ghanaian cedi', minorUnits: 2, locale: 'en-GH' },
  TZS: { code: 'TZS', symbol: 'TSh', name: 'Tanzanian shilling', minorUnits: 2, locale: 'en-TZ' },
  UGX: { code: 'UGX', symbol: 'USh', name: 'Ugandan shilling', minorUnits: 0, locale: 'en-UG' },
  DZD: { code: 'DZD', symbol: 'DA', name: 'Algerian dinar', minorUnits: 2, locale: 'fr-DZ' },
  TND: { code: 'TND', symbol: 'DT', name: 'Tunisian dinar', minorUnits: 2, locale: 'fr-TN' },
  IQD: { code: 'IQD', symbol: 'IQD', name: 'Iraqi dinar', minorUnits: 2, locale: 'ar-IQ' },
  CLP: { code: 'CLP', symbol: 'CLP$', name: 'Chilean peso', minorUnits: 0, locale: 'es-CL' },
  COP: { code: 'COP', symbol: 'COL$', name: 'Colombian peso', minorUnits: 2, locale: 'es-CO' },
  ARS: { code: 'ARS', symbol: 'ARS$', name: 'Argentine peso', minorUnits: 2, locale: 'es-AR' },
  PEN: { code: 'PEN', symbol: 'S/', name: 'Peruvian sol', minorUnits: 2, locale: 'es-PE' },
};

/** The marketplace's home currency: what a listing defaults to. */
export const BASE_CURRENCY = 'AED';

/**
 * Country to currency. The euro members are spelled out rather than inferred,
 * because "in the EU" and "uses the euro" are not the same set.
 *
 * Europe is covered end to end on purpose. A country missing from here falls
 * all the way back to the marketplace default, and a visitor in Prague being
 * shown dirhams is exactly the bug that adding these fixes.
 */
export const COUNTRY_CURRENCY: Record<string, string> = {
  // Gulf and the wider Middle East
  AE: 'AED', SA: 'SAR', QA: 'QAR', KW: 'KWD', BH: 'BHD', OM: 'OMR',
  JO: 'JOD', LB: 'LBP', IL: 'ILS', IQ: 'IQD',

  // Euro area, and the microstates and territories that use the euro
  AT: 'EUR', BE: 'EUR', CY: 'EUR', EE: 'EUR', FI: 'EUR', FR: 'EUR', DE: 'EUR',
  GR: 'EUR', IE: 'EUR', IT: 'EUR', LV: 'EUR', LT: 'EUR', LU: 'EUR', MT: 'EUR',
  NL: 'EUR', PT: 'EUR', SK: 'EUR', SI: 'EUR', ES: 'EUR', HR: 'EUR',
  MC: 'EUR', AD: 'EUR', SM: 'EUR', VA: 'EUR', ME: 'EUR', XK: 'EUR',
  AX: 'EUR', BL: 'EUR', GF: 'EUR', GP: 'EUR', MQ: 'EUR', YT: 'EUR', RE: 'EUR',

  // The rest of Europe, each on its own currency
  GB: 'GBP', JE: 'GBP', GG: 'GBP', IM: 'GBP', GI: 'GBP',
  CH: 'CHF', LI: 'CHF',
  SE: 'SEK', NO: 'NOK', SJ: 'NOK', DK: 'DKK', FO: 'DKK', GL: 'DKK',
  PL: 'PLN', CZ: 'CZK', HU: 'HUF', RO: 'RON', BG: 'BGN', IS: 'ISK',
  UA: 'UAH', RS: 'RSD', BA: 'BAM', AL: 'ALL', MK: 'MKD', MD: 'MDL',
  BY: 'RUB', RU: 'RUB', TR: 'TRY', GE: 'GEL', AM: 'AMD', AZ: 'AZN',

  // The Americas
  US: 'USD', PR: 'USD', VI: 'USD', GU: 'USD', AS: 'USD',
  EC: 'USD', PA: 'USD', SV: 'USD', TC: 'USD', BQ: 'USD',
  CA: 'CAD', MX: 'MXN', BR: 'BRL', CL: 'CLP', CO: 'COP', AR: 'ARS', PE: 'PEN',

  // Asia and the Pacific
  IN: 'INR', PK: 'PKR', BD: 'BDT', LK: 'LKR', NP: 'NPR',
  CN: 'CNY', JP: 'JPY', KR: 'KRW', TW: 'TWD', HK: 'HKD', MO: 'HKD',
  SG: 'SGD', MY: 'MYR', ID: 'IDR', PH: 'PHP', TH: 'THB', VN: 'VND',
  AU: 'AUD', NZ: 'NZD', CK: 'NZD', NU: 'NZD',

  // Africa
  EG: 'EGP', ZA: 'ZAR', LS: 'ZAR', NA: 'ZAR', SZ: 'ZAR',
  NG: 'NGN', KE: 'KES', GH: 'GHS', TZ: 'TZS', UG: 'UGX',
  MA: 'MAD', EH: 'MAD', DZ: 'DZD', TN: 'TND',
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
 * The whole job in one call: what this price says to this visitor.
 *
 * One figure, in the visitor's own currency. Showing two — the listing's and a
 * conversion beside it — reads as clutter on a card, and the second number is
 * the one they actually think in. So the conversion happens here and only the
 * result is rendered.
 *
 * What is lost by dropping the other figure is that the act is paid in their
 * own currency, and that is a real thing to lose, so it does not vanish: the
 * listing amount stays on the object for a tooltip, `converted` says whether
 * this is a conversion at all, and a page showing converted prices carries one
 * note saying so. A caller committing money — an offer, a counter-offer —
 * should use `listing` rather than `text`.
 */
export interface PriceView {
  /** What to render. The visitor's currency where we can convert to it. */
  text: string;
  /** The currency `text` is in. */
  currency: string;
  /** False when this is the listing's own figure, unconverted. */
  converted: boolean;
  /** The listing's own amount, always, for a tooltip and for anything binding. */
  listing: string;
  listingCurrency: string;
}

export function priceIn(
  minor: number,
  listingCurrency: string,
  visitorCurrency: string | null,
  fx: FxTable | null,
  options: FormatOptions = {},
): PriceView {
  const listing = formatAmount(minor, listingCurrency, options);
  const base = { listing, listingCurrency };

  const to = knownCurrency(visitorCurrency);
  if (!to || !fx || to === listingCurrency) {
    return { ...base, text: listing, currency: listingCurrency, converted: false };
  }

  const converted = convert(minor, listingCurrency, to, fx);
  // No rate is not a licence to guess: fall back to the listing's own figure.
  if (converted == null) {
    return { ...base, text: listing, currency: listingCurrency, converted: false };
  }

  return {
    ...base,
    text: formatAmount(roundForDisplay(converted, to), to, options),
    currency: to,
    converted: true,
  };
}

/**
 * Reads an amount a person typed, in a given currency, into minor units.
 *
 * Two things `parseMoney` gets wrong once prices are not all dirhams. It
 * assumes every currency divides by a hundred, which turns ¥14,000 into
 * ¥140,000; and it strips commas, which turns a European's "1.234,56" into
 * 123,456. So the separators are worked out rather than deleted: whichever of
 * `.` or `,` comes last, with one or two digits after it and none before the
 * other, is the decimal point — everything else is grouping.
 */
export function parseAmount(input: string, currency: string): number {
  const units = CURRENCIES[currency]?.minorUnits ?? 2;
  const cleaned = input.replace(/[^0-9.,]/g, '');
  if (!cleaned) return 0;

  const lastDot = cleaned.lastIndexOf('.');
  const lastComma = cleaned.lastIndexOf(',');
  const decimalAt = Math.max(lastDot, lastComma);

  let whole = cleaned;
  let fraction = '';
  if (decimalAt !== -1) {
    const after = cleaned.slice(decimalAt + 1);
    // Three digits after the last separator is grouping — "1,500" is fifteen
    // hundred in both conventions, not one and a half.
    if (/^\d{1,2}$/.test(after)) {
      whole = cleaned.slice(0, decimalAt);
      fraction = after;
    }
  }

  const digits = whole.replace(/[.,]/g, '');
  const major = Number.parseFloat(`${digits || '0'}.${fraction || '0'}`);
  return Number.isFinite(major) ? Math.round(major * 10 ** units) : 0;
}
