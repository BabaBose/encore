'use client';

/**
 * The booking panel.
 *
 * It quotes live as the venue changes the date, hours or contract length — and
 * it does so by calling the very same rate and availability functions the
 * server uses, which is the payoff of keeping the domain layer pure. The price
 * shown here cannot drift from the price the inquiry is created with.
 */
import { useActionState, useMemo, useState } from 'react';
import { sendInquiryAction, type ActionState } from '@/app/actions';
import { isRangeFree, blockedDatesIn, residencyAvailability, type AvailabilityBlock } from '@/domain/availability';
import { quoteHourly, quoteResidency, type RateCard } from '@/domain/rates';
import { addDays, addMonths, isIsoDate, today } from '@/domain/dates';
import { TIME_BLOCK_LABELS, TIME_BLOCKS, type ContractLength, type TimeBlock } from '@/domain/types';
import { formatMoney, formatDate } from '@/lib/format';
import type { CityRef } from '@/domain/search';

export interface InquiryPanelProps {
  entertainerId: string;
  acceptsShortTerm: boolean;
  acceptsLongTerm: boolean;
  contractLengths: ContractLength[];
  rateCard: RateCard;
  blocks: AvailabilityBlock[];
  cities: CityRef[];
  defaultCityId: string;
  defaultDate?: string | null;
}

export function InquiryPanel(props: InquiryPanelProps) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(sendInquiryAction, {});

  const canSwitch = props.acceptsShortTerm && props.acceptsLongTerm;
  const [gigType, setGigType] = useState<'one_time' | 'long_term'>(
    props.acceptsShortTerm ? 'one_time' : 'long_term',
  );
  const [startDate, setStartDate] = useState(props.defaultDate ?? addDays(today(), 14));
  const [endDate, setEndDate] = useState('');
  const [timeBlock, setTimeBlock] = useState<TimeBlock>('evening');
  const [hours, setHours] = useState(String(Math.max(props.rateCard.minimumHours, 3)));
  const [months, setMonths] = useState<ContractLength>(props.contractLengths[0] ?? 3);
  const [daysPerWeek, setDaysPerWeek] = useState(
    String(props.rateCard.residency?.daysPerWeekIncluded ?? 5),
  );
  const [offerEdited, setOfferEdited] = useState<string | null>(null);

  /** The live quote, resolved through the act's own rate rules. */
  const quote = useMemo(() => {
    try {
      if (gigType === 'long_term') {
        const q = quoteResidency(props.rateCard, months, Number(daysPerWeek) || 1);
        return {
          amount: q.monthlyTotal,
          currency: q.currency,
          headline: `${formatMoney(q.monthlyTotal, q.currency)} / month`,
          detail: `${months} months · ${daysPerWeek} nights a week${
            q.extraDaysPerWeek ? ` · ${q.extraDaysPerWeek} beyond the package` : ''
          }`,
          total: `${formatMoney(q.contractTotal, q.currency)} over the contract`,
          error: null as string | null,
        };
      }
      if (!isIsoDate(startDate)) throw new Error('Pick a date');
      const q = quoteHourly(props.rateCard, startDate, timeBlock, Number(hours) || 1);
      return {
        amount: q.total,
        currency: q.currency,
        headline: `${formatMoney(q.total, q.currency)}`,
        detail: `${q.label} · ${q.billableHours} hr × ${formatMoney(q.hourly, q.currency)}${
          q.minimumApplied ? ` (${q.minimumHours} hr minimum)` : ''
        }`,
        total: q.source === 'special_date' ? 'Special-date rate — overrides the weekly grid' : null,
        error: null as string | null,
      };
    } catch (err) {
      return {
        amount: 0,
        currency: props.rateCard.currency,
        headline: '—',
        detail: '',
        total: null,
        error: err instanceof Error ? err.message : 'Cannot quote this yet',
      };
    }
  }, [gigType, startDate, timeBlock, hours, months, daysPerWeek, props.rateCard]);

  /** Whether the dates asked for are actually free. */
  const availability = useMemo(() => {
    if (!isIsoDate(startDate)) return null;
    if (gigType === 'long_term') {
      const end = addDays(addMonths(startDate, months), -1);
      const r = residencyAvailability(props.blocks, startDate, end);
      return {
        free: r.available,
        message: r.available
          ? `Substantially open across those ${months} months`
          : `${r.blockedDays} of ${r.totalDays} days are already committed`,
      };
    }
    const end = isIsoDate(endDate) ? endDate : startDate;
    const free = isRangeFree(props.blocks, startDate, end);
    const clashes = free ? [] : blockedDatesIn(props.blocks, startDate, end);
    return {
      free,
      message: free
        ? 'Free on that date'
        : `Already committed: ${clashes.slice(0, 3).map(formatDate).join(', ')}${clashes.length > 3 ? '…' : ''}`,
    };
  }, [gigType, startDate, endDate, months, props.blocks]);

  const offerValue = offerEdited ?? (quote.amount ? String(quote.amount / 100) : '');

  return (
    <form action={formAction} className="stack" style={{ gap: 14 }}>
      <input type="hidden" name="entertainerId" value={props.entertainerId} />
      <input type="hidden" name="gigType" value={gigType} />

      {canSwitch ? (
        <div className="toggle" role="group" aria-label="Gig type">
          <button
            type="button"
            className="toggle__option"
            aria-pressed={gigType === 'one_time'}
            onClick={() => setGigType('one_time')}
          >
            One-off
          </button>
          <button
            type="button"
            className="toggle__option"
            aria-pressed={gigType === 'long_term'}
            onClick={() => setGigType('long_term')}
          >
            Residency
          </button>
        </div>
      ) : null}

      <div className="field">
        <label className="field__label" htmlFor="startDate">
          {gigType === 'long_term' ? 'Target start' : 'Date'}
        </label>
        <input
          className="input"
          id="startDate"
          name="startDate"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          required
        />
      </div>

      {gigType === 'one_time' ? (
        <>
          <div className="field">
            <label className="field__label" htmlFor="endDate">
              Through (optional, for a run)
            </label>
            <input
              className="input"
              id="endDate"
              name="endDate"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div className="row" style={{ gap: 10, flexWrap: 'nowrap' }}>
            <div className="field" style={{ flex: 1 }}>
              <label className="field__label" htmlFor="timeBlock">
                Time
              </label>
              <select
                className="select"
                id="timeBlock"
                name="timeBlock"
                value={timeBlock}
                onChange={(e) => setTimeBlock(e.target.value as TimeBlock)}
              >
                {TIME_BLOCKS.map((b) => (
                  <option key={b} value={b}>
                    {TIME_BLOCK_LABELS[b]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ width: 96 }}>
              <label className="field__label" htmlFor="hours">
                Hours
              </label>
              <input
                className="input"
                id="hours"
                name="hours"
                type="number"
                min={1}
                step={0.5}
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
            </div>
          </div>
        </>
      ) : (
        <div className="row" style={{ gap: 10, flexWrap: 'nowrap' }}>
          <div className="field" style={{ flex: 1 }}>
            <label className="field__label" htmlFor="months">
              Length
            </label>
            <select
              className="select"
              id="months"
              name="months"
              value={months}
              onChange={(e) => setMonths(Number(e.target.value) as ContractLength)}
            >
              {(props.contractLengths.length ? props.contractLengths : [1, 3, 6, 12]).map((m) => (
                <option key={m} value={m}>
                  {m} month{m > 1 ? 's' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ width: 110 }}>
            <label className="field__label" htmlFor="daysPerWeek">
              Nights/wk
            </label>
            <input
              className="input"
              id="daysPerWeek"
              name="daysPerWeek"
              type="number"
              min={1}
              max={7}
              value={daysPerWeek}
              onChange={(e) => setDaysPerWeek(e.target.value)}
            />
          </div>
        </div>
      )}

      <div className="card" style={{ background: 'var(--surface-sunken)' }}>
        <div className="eyebrow">Their published rate</div>
        <div className="title" style={{ fontSize: 19, margin: '4px 0 6px' }}>
          {quote.headline}
        </div>
        <div className="dim" style={{ fontSize: 12 }}>
          {quote.error ?? quote.detail}
        </div>
        {quote.total ? (
          <div className="mono" style={{ fontSize: 11.5, marginTop: 6, color: 'var(--amber)' }}>
            {quote.total}
          </div>
        ) : null}
        {availability ? (
          <div
            className="mono"
            style={{ fontSize: 11.5, marginTop: 8, color: availability.free ? 'var(--green)' : 'var(--red)' }}
          >
            {availability.free ? '●' : '●'} {availability.message}
          </div>
        ) : null}
      </div>

      <div className="field">
        <label className="field__label" htmlFor="offer">
          Your offer ({quote.currency})
        </label>
        <input
          className="input"
          id="offer"
          name="offer"
          inputMode="decimal"
          value={offerValue}
          onChange={(e) => setOfferEdited(e.target.value)}
        />
        <span className="field__hint">Pre-filled from their rate. Edit it to propose something else.</span>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="cityId">
          Venue city
        </label>
        <select className="select" id="cityId" name="cityId" defaultValue={props.defaultCityId}>
          {props.cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="eventType">
          Event
        </label>
        <input className="input" id="eventType" name="eventType" placeholder="NYE rooftop, Friday brunch…" />
      </div>

      <div className="field">
        <label className="field__label" htmlFor="notes">
          Notes
        </label>
        <textarea className="textarea" id="notes" name="notes" placeholder="Covers, set times, load-in…" />
      </div>

      {state.error ? <div className="notice notice--error">{state.error}</div> : null}

      <button className="btn btn--primary btn--block" type="submit" disabled={pending || !!quote.error}>
        {pending ? 'Sending…' : 'Send inquiry'}
      </button>
      <p className="field__hint" style={{ textAlign: 'center' }}>
        {availability && !availability.free
          ? 'You can still ask — they may free the date up.'
          : 'They accept or counter; nothing is booked until they do.'}
      </p>
    </form>
  );
}
