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
import { CURRENCIES, priceIn, type FormatOptions, type FxTable, type PriceView } from '@/domain/currency';
import { setCurrencyAction } from '@/app/actions';

export interface MoneyView {
  currency: string;
  chosen: boolean;
  country: string | null;
  /** How this currency was arrived at, so the picker can say. */
  source?: 'chosen' | 'geo' | 'language' | 'default';
  fx: FxTable | null;
}

const MoneyContext = createContext<MoneyView>({
  currency: 'AED',
  chosen: false,
  country: null,
  source: 'default',
  fx: null,
});

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
  /** The listing's currency. What the visitor sees may not be this. */
  currency: string;
  short?: boolean;
  /** "/hr", "/month" — part of the figure, so it stays on the same line. */
  suffix?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const view = useMoney();
  const options: FormatOptions = { short };
  const price = priceIn(minor, currency, view.currency, view.fx, options);

  return (
    <span
      className={className}
      style={style}
      // The act's own figure stays one hover away rather than on the card.
      title={price.converted ? listingNote(price) : undefined}
    >
      {price.text}
      {suffix}
    </span>
  );
}

function listingNote(price: PriceView): string {
  return `Converted for you. ${price.listing} in the currency this act lists and is paid in.`;
}

/** Answers "why is it showing me this?" without anyone having to ask. */
function whyThisCurrency(view: MoneyView): string {
  const name = CURRENCIES[view.currency]?.name ?? view.currency;
  const where = view.country ? ` (${view.country})` : '';
  switch (view.source) {
    case 'chosen':
      return `Showing ${name} because you picked it. Change it here.`;
    case 'geo':
      return `Showing ${name}, from where you appear to be browsing${where}. Change it here.`;
    case 'language':
      return `Showing ${name}, from your browser's language${where}. Change it here.`;
    default:
      return `Showing ${name}, the marketplace default — we could not tell where you are. Change it here.`;
  }
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
        title={whyThisCurrency(view)}
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
export function CurrencyNote({ style }: { style?: React.CSSProperties }) {
  const view = useMoney();
  if (!view.fx) return null;
  const name = CURRENCIES[view.currency]?.name ?? view.currency;
  return (
    <p className="dim" style={{ fontSize: 11.5, marginTop: 10, ...style }}>
      Prices are shown in {name}, converted at rates from {view.fx.asOf}
      {view.fx.source === 'built-in' ? ' (built in)' : ''} and rounded. Each act is paid in the
      currency it lists, which is what a booking is agreed in.
    </p>
  );
}
