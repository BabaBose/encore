'use client';

/**
 * Prices, shown twice.
 *
 * The listing's own currency is what the act is paid in, so it is always the
 * figure in front: full size, exact, unqualified. The visitor's currency
 * follows it as a rounded approximation, clearly marked with "≈", because it
 * is a courtesy and not a quote. Nothing here ever shows the converted figure
 * on its own.
 *
 * The context is filled once per request by the server and read by every price
 * on the page, so a card deep in a carousel does not need the conversion
 * threaded down to it.
 */
import { createContext, useContext, useTransition } from 'react';
import { CURRENCIES, priceIn, type FormatOptions, type FxTable } from '@/domain/currency';
import { setCurrencyAction } from '@/app/actions';

export interface MoneyView {
  currency: string;
  chosen: boolean;
  country: string | null;
  fx: FxTable | null;
}

const MoneyContext = createContext<MoneyView>({ currency: 'AED', chosen: false, country: null, fx: null });

export function MoneyProvider({ value, children }: { value: MoneyView; children: React.ReactNode }) {
  return <MoneyContext.Provider value={value}>{children}</MoneyContext.Provider>;
}

export function useMoney(): MoneyView {
  return useContext(MoneyContext);
}

export function Price({
  minor,
  currency,
  short = false,
  suffix,
  className,
  style,
}: {
  minor: number;
  /** The listing's currency, not the visitor's. */
  currency: string;
  short?: boolean;
  /** "/hr", "/month" — sits with the exact figure, not the approximation. */
  suffix?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const view = useMoney();
  const options: FormatOptions = { short };
  const { exact, approx, approxCurrency } = priceIn(minor, currency, view.currency, view.fx, options);

  return (
    <span className={className} style={style}>
      {/* Each figure stays whole: a line may break between them, never inside
          one, so "AED" never ends up on its own line above its number. */}
      <span className="price__exact">
        {exact}
        {suffix}
      </span>
      {approx ? (
        <span className="price__approx" title={approxNote(currency, approxCurrency!, view.fx)}>
          {' '}
          ≈ {approx}
          {suffix}
        </span>
      ) : null}
    </span>
  );
}

function approxNote(from: string, to: string, fx: FxTable | null): string {
  const name = CURRENCIES[to]?.name ?? to;
  const when = fx ? ` Rates as of ${fx.asOf}.` : '';
  return `Approximate only — about this much in ${name}. The booking is agreed and paid in ${from}.${when}`;
}

/**
 * The override. It posts rather than reading `navigator.language`, so the
 * choice is stored server-side in a cookie and the next server render already
 * knows it — no flash of the wrong currency.
 */
export function CurrencyPicker({ compact = false }: { compact?: boolean }) {
  const view = useMoney();
  const [pending, startTransition] = useTransition();
  const codes = Object.keys(CURRENCIES).sort();

  return (
    <label className={`currency-picker${compact ? ' currency-picker--compact' : ''}`}>
      <span className="visually-hidden">Show prices in</span>
      <select
        className="currency-picker__select"
        value={view.currency}
        disabled={pending}
        aria-label="Show prices in"
        onChange={(e) => {
          const next = e.target.value;
          startTransition(async () => {
            await setCurrencyAction(next);
          });
        }}
      >
        {codes.map((code) => (
          <option key={code} value={code}>
            {compact ? code : `${code} — ${CURRENCIES[code].name}`}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * The footnote that makes the approximations honest: where the rates came
 * from, when, and that the act is paid in the listing currency.
 */
export function CurrencyNote() {
  const view = useMoney();
  if (!view.fx) return null;
  return (
    <p className="dim" style={{ fontSize: 11.5, marginTop: 10 }}>
      Prices in {view.currency} are approximate, converted at rates from {view.fx.asOf}
      {view.fx.source === 'built-in' ? ' (built in)' : ''}. Every booking is agreed and paid in the
      currency the act lists.
    </p>
  );
}
