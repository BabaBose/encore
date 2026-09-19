import { describe, expect, it } from 'vitest';
import {
  convert,
  currencyForCountry,
  formatAmount,
  knownCurrency,
  priceIn,
  roundForDisplay,
  type FxTable,
} from '@/domain/currency';
import { BUILT_IN_FX } from '@/lib/fx';

/** 1 AED = 0.25 GBP = 40 JPY, so 1 GBP = 160 JPY. Round numbers on purpose. */
const fx: FxTable = {
  base: 'AED',
  asOf: '2026-09-01',
  source: 'built-in',
  rates: { AED: 1, GBP: 0.25, USD: 0.5, JPY: 40 },
};

describe('picking a currency', () => {
  it('maps a country to what people there think in', () => {
    expect(currencyForCountry('GB')).toBe('GBP');
    expect(currencyForCountry('ae')).toBe('AED');
    expect(currencyForCountry('DE')).toBe('EUR');
    expect(currencyForCountry('JP')).toBe('JPY');
  });

  it('gives nothing for a country it does not know, rather than a guess', () => {
    expect(currencyForCountry('ZZ')).toBeNull();
    expect(currencyForCountry(null)).toBeNull();
    expect(currencyForCountry('')).toBeNull();
  });

  it('spaces a code from the number but not a symbol', () => {
    expect(formatAmount(35000, 'AED')).toBe('AED 350');
    expect(formatAmount(35000, 'CHF')).toBe('CHF 350');
    expect(formatAmount(9500, 'USD')).toBe('$95');
    expect(formatAmount(8800, 'GBP')).toBe('£88');
  });

  it('only accepts currencies it can print', () => {
    expect(knownCurrency('gbp')).toBe('GBP');
    expect(knownCurrency('XYZ')).toBeNull();
    expect(knownCurrency(undefined)).toBeNull();
  });
});

describe('converting', () => {
  it('leaves an amount alone when the currency already matches', () => {
    expect(convert(35000, 'AED', 'AED', fx)).toBe(35000);
  });

  it('converts from the base', () => {
    // AED 350.00 at 0.25 -> GBP 87.50
    expect(convert(35000, 'AED', 'GBP', fx)).toBe(8750);
  });

  it('converts back to the base', () => {
    expect(convert(8750, 'GBP', 'AED', fx)).toBe(35000);
  });

  it('crosses two non-base currencies through the base', () => {
    // GBP 1.00 -> AED 4.00 -> JPY 160
    expect(convert(100, 'GBP', 'JPY', fx)).toBe(160);
  });

  it('respects a currency with no minor units', () => {
    // JPY has no subdivision, so 160 yen is 160 minor units, not 16000.
    expect(formatAmount(convert(100, 'GBP', 'JPY', fx)!, 'JPY')).toBe('¥160');
  });

  it('returns null rather than a wrong number when a rate is missing', () => {
    expect(convert(1000, 'AED', 'KRW', fx)).toBeNull();
    expect(convert(1000, 'KRW', 'AED', fx)).toBeNull();
  });
});

describe('rounding for display', () => {
  it('rounds to something a person would say', () => {
    expect(roundForDisplay(9528, 'USD')).toBe(9500); // 95.28 -> 95
    expect(roundForDisplay(123456, 'USD')).toBe(123000); // 1,234.56 -> 1,230
    expect(roundForDisplay(1_234_567, 'USD')).toBe(1_230_000); // 12,345.67 -> 12,300
  });

  it('leaves small amounts usable', () => {
    expect(roundForDisplay(450, 'USD')).toBe(450); // 4.50 stays 4.50
  });

  it('never moves an amount by more than about a percent', () => {
    for (const major of [7.3, 42.7, 355.5, 1234.5, 9876.5, 45_678.9, 654_321.5]) {
      const minor = Math.round(major * 100);
      const moved = Math.abs(roundForDisplay(minor, 'USD') - minor) / minor;
      expect(moved, `${major} moved ${(moved * 100).toFixed(2)}%`).toBeLessThan(0.011);
    }
  });
});

describe('what a price shows', () => {
  it('shows only the listing currency when it is the visitor’s too', () => {
    const p = priceIn(35000, 'AED', 'AED', fx);
    expect(p.exact).toBe('AED 350');
    expect(p.approx).toBeNull();
  });

  it('adds a rounded approximation for a visitor elsewhere', () => {
    const p = priceIn(35000, 'AED', 'GBP', fx);
    expect(p.exact).toBe('AED 350');
    expect(p.approx).toBe('£88'); // 87.50, to the nearest whole pound
    expect(p.approxCurrency).toBe('GBP');
  });

  it('shows the listing price alone when there is no rate', () => {
    const p = priceIn(35000, 'AED', 'KRW', fx);
    expect(p.exact).toBe('AED 350');
    expect(p.approx).toBeNull();
  });

  it('shows the listing price alone when we have no table at all', () => {
    expect(priceIn(35000, 'AED', 'GBP', null).approx).toBeNull();
  });

  it('never drops the listing currency, whatever the visitor uses', () => {
    for (const to of ['AED', 'GBP', 'JPY', 'KRW', 'nonsense']) {
      expect(priceIn(35000, 'AED', to, fx).exact).toBe('AED 350');
    }
  });
});

describe('the built-in rate table', () => {
  it('quotes against the marketplace currency', () => {
    expect(BUILT_IN_FX.base).toBe('AED');
    expect(BUILT_IN_FX.rates.AED).toBe(1);
  });

  it('has a usable, positive rate for every currency it lists', () => {
    for (const [code, rate] of Object.entries(BUILT_IN_FX.rates)) {
      expect(Number.isFinite(rate), code).toBe(true);
      expect(rate, code).toBeGreaterThan(0);
    }
  });

  it('covers every currency a country maps to', async () => {
    const { COUNTRY_CURRENCY } = await import('@/domain/currency');
    for (const code of new Set(Object.values(COUNTRY_CURRENCY))) {
      expect(BUILT_IN_FX.rates[code], `no rate for ${code}`).toBeGreaterThan(0);
    }
  });

  it('can print every currency it has a rate for', async () => {
    const { CURRENCIES } = await import('@/domain/currency');
    for (const code of Object.keys(BUILT_IN_FX.rates)) {
      expect(CURRENCIES[code], `no metadata for ${code}`).toBeTruthy();
    }
  });
});
