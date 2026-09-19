/**
 * Which currency to show this visitor prices in.
 *
 * Order matters: a choice the visitor made beats a guess from their IP, and
 * the guess beats the marketplace default. IP geolocation is wrong often
 * enough — a VPN, a roaming phone, a corporate egress in another country —
 * that it can only ever be the starting point, never the answer.
 */
import { cookies, headers } from 'next/headers';
import { BASE_CURRENCY, currencyForCountry, knownCurrency, type FxTable } from '@/domain/currency';
import { fxTable } from '@/lib/fx';

export const CURRENCY_COOKIE = 'booktheact_currency';
/** A year: this is a display preference, not a session. */
export const CURRENCY_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export interface MoneyContext {
  /** What prices are shown in alongside the listing's own currency. */
  currency: string;
  /** True when the visitor picked it rather than us guessing. */
  chosen: boolean;
  /** The country the request appeared to come from, where the host says. */
  country: string | null;
  /** How the currency was arrived at — shown to the visitor so it is not a mystery. */
  source: 'chosen' | 'geo' | 'language' | 'default';
  fx: FxTable;
}

/**
 * Vercel sets `x-vercel-ip-country`; Cloudflare sets `cf-ipcountry`. Neither
 * exists locally, which is why there is a default at the end of the chain.
 */
async function requestCountry(): Promise<string | null> {
  const h = await headers();
  const raw = h.get('x-vercel-ip-country') ?? h.get('cf-ipcountry') ?? h.get('x-country-code');
  if (!raw) return null;
  const code = raw.trim().toUpperCase();
  // Some proxies send XX or T1 (Tor) rather than omitting the header.
  return /^[A-Z]{2}$/.test(code) && code !== 'XX' && code !== 'T1' ? code : null;
}

/**
 * The region out of `Accept-Language`, for when there is no geo header at all —
 * behind a proxy that strips it, or on a host that does not set one. `de-CH`
 * means Switzerland, not Germany, so only the region subtag is read and a bare
 * `de` is ignored rather than guessed at.
 */
async function languageCountry(): Promise<string | null> {
  const h = await headers();
  const header = h.get('accept-language');
  if (!header) return null;
  for (const part of header.split(',')) {
    const tag = part.split(';')[0]?.trim();
    const region = tag?.split('-')[1];
    if (region && /^[A-Za-z]{2}$/.test(region)) return region.toUpperCase();
  }
  return null;
}

export async function moneyContext(): Promise<MoneyContext> {
  const jar = await cookies();
  const chosen = knownCurrency(jar.get(CURRENCY_COOKIE)?.value);
  const [country, fx] = await Promise.all([requestCountry(), fxTable()]);

  if (chosen) return { currency: chosen, chosen: true, country, source: 'chosen', fx };

  const fromGeo = knownCurrency(currencyForCountry(country));
  if (fromGeo) return { currency: fromGeo, chosen: false, country, source: 'geo', fx };

  const language = await languageCountry();
  const fromLanguage = knownCurrency(currencyForCountry(language));
  if (fromLanguage) {
    return { currency: fromLanguage, chosen: false, country: country ?? language, source: 'language', fx };
  }

  return { currency: BASE_CURRENCY, chosen: false, country, source: 'default', fx };
}
