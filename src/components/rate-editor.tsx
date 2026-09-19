'use client';

/**
 * Authoring the rate card. The grid posts one field per cell named
 * `rule:<weekday>:<timeBlock>`, so adding a time block is a change in one enum
 * rather than in a form layout.
 */
import { useActionState } from 'react';
import { addSpecialDateAction, removeSpecialDateAction, saveRatesAction, type ActionState } from '@/app/actions';
import type { RateCard } from '@/domain/rates';
import { TIME_BLOCKS, TIME_BLOCK_LABELS, WEEKDAY_LABELS, type Weekday } from '@/domain/types';
import { formatDate, formatMoney } from '@/lib/format';

const major = (minor: number | undefined | null) => (minor ? String(minor / 100) : '');

export function RateEditor({
  entertainerId,
  card,
  published,
  acceptsLongTerm,
}: {
  entertainerId: string;
  card: RateCard;
  published: boolean;
  acceptsLongTerm: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveRatesAction, {});
  const rule = (w: Weekday, b: (typeof TIME_BLOCKS)[number]) =>
    card.rules.find((r) => r.weekday === w && r.timeBlock === b);

  return (
    <form action={action} className="panel">
      <input type="hidden" name="entertainerId" value={entertainerId} />
      <div className="panel__head spread">
        <span className="eyebrow">Short-term · per gig</span>
        <label className="checkline" style={{ fontSize: 12 }}>
          <input type="checkbox" name="published" defaultChecked={published} />
          <span>Published — venues can see these</span>
        </label>
      </div>
      <div className="panel__body stack" style={{ gap: 20 }}>
        <div className="row" style={{ gap: 14, alignItems: 'flex-end' }}>
          <div className="field" style={{ width: 150 }}>
            <label className="field__label" htmlFor="baseHourly">
              Base hourly
            </label>
            <input className="input" id="baseHourly" name="baseHourly" inputMode="decimal" defaultValue={major(card.baseHourly)} />
          </div>
          <div className="field" style={{ width: 130 }}>
            <label className="field__label" htmlFor="minimumHours">
              Minimum hours
            </label>
            <input
              className="input"
              id="minimumHours"
              name="minimumHours"
              type="number"
              min={1}
              step={0.5}
              defaultValue={card.minimumHours}
            />
          </div>
          <div className="field" style={{ width: 110 }}>
            <label className="field__label" htmlFor="currency">
              Currency
            </label>
            <input className="input" id="currency" name="currency" defaultValue={card.currency} />
          </div>
        </div>

        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            Day of week × time of day — leave a cell blank if you do not play it
          </div>
          <div className="scroll-x">
            <table className="rate-grid">
              <thead>
                <tr>
                  <th scope="col">Day</th>
                  {TIME_BLOCKS.map((b) => (
                    <th key={b} scope="col">
                      {TIME_BLOCK_LABELS[b]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {WEEKDAY_LABELS.map((label, i) => (
                  <tr key={label}>
                    <td>{label}</td>
                    {TIME_BLOCKS.map((b) => (
                      <td key={b}>
                        <input
                          name={`rule:${i}:${b}`}
                          inputMode="decimal"
                          placeholder="—"
                          aria-label={`${label} ${TIME_BLOCK_LABELS[b]} hourly rate`}
                          defaultValue={major(rule(i as Weekday, b)?.hourly)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {acceptsLongTerm ? (
          <>
            <hr className="divider" />
            <div>
              <div className="eyebrow" style={{ marginBottom: 10 }}>
                Long-term · residency package
              </div>
              <div className="row" style={{ gap: 14, alignItems: 'flex-end' }}>
                <div className="field" style={{ width: 150 }}>
                  <label className="field__label" htmlFor="residencyMonthly">
                    Monthly
                  </label>
                  <input
                    className="input"
                    id="residencyMonthly"
                    name="residencyMonthly"
                    inputMode="decimal"
                    defaultValue={major(card.residency?.monthly)}
                  />
                </div>
                <div className="field" style={{ width: 150 }}>
                  <label className="field__label" htmlFor="residencyWeekly">
                    Weekly
                  </label>
                  <input
                    className="input"
                    id="residencyWeekly"
                    name="residencyWeekly"
                    inputMode="decimal"
                    defaultValue={major(card.residency?.weekly)}
                  />
                </div>
                <div className="field" style={{ width: 150 }}>
                  <label className="field__label" htmlFor="daysPerWeekIncluded">
                    Nights included
                  </label>
                  <input
                    className="input"
                    id="daysPerWeekIncluded"
                    name="daysPerWeekIncluded"
                    type="number"
                    min={1}
                    max={7}
                    defaultValue={card.residency?.daysPerWeekIncluded ?? 5}
                  />
                </div>
                <div className="field" style={{ width: 150 }}>
                  <label className="field__label" htmlFor="extraDayRate">
                    Extra night
                  </label>
                  <input
                    className="input"
                    id="extraDayRate"
                    name="extraDayRate"
                    inputMode="decimal"
                    defaultValue={major(card.residency?.extraDayRate)}
                  />
                </div>
              </div>
              <p className="field__hint" style={{ marginTop: 8 }}>
                A residency is priced as a package, not hours × rate. Set which contract lengths you will
                consider on your profile.
              </p>
            </div>
          </>
        ) : null}

        {state.error ? <div className="notice notice--error">{state.error}</div> : null}
        {state.ok ? <div className="notice notice--ok">{state.ok}</div> : null}

        <button className="btn btn--primary" type="submit" disabled={pending} style={{ alignSelf: 'flex-start' }}>
          {pending ? 'Saving…' : 'Save rates'}
        </button>
      </div>
    </form>
  );
}

export function SpecialDateEditor({ entertainerId, card }: { entertainerId: string; card: RateCard }) {
  const [addState, addAction, adding] = useActionState<ActionState, FormData>(addSpecialDateAction, {});
  const [, removeAction, removing] = useActionState<ActionState, FormData>(removeSpecialDateAction, {});

  return (
    <section className="panel">
      <div className="panel__head">
        <span className="eyebrow">Special dates</span>
        <span className="dim" style={{ fontSize: 12 }}>
          NYE, Eid, Diwali — these override the grid
        </span>
      </div>

      {card.specialDates.length ? (
        <div className="listing">
          {card.specialDates.map((s) => (
            <div key={s.date} className="listing__item">
              <div className="listing__main">
                <div className="listing__name">{s.label}</div>
                <div className="listing__meta">
                  {formatDate(s.date)}
                  {s.minimumHours ? ` · ${s.minimumHours} hr minimum` : ''}
                </div>
              </div>
              <span className="mono" style={{ color: 'var(--amber)' }}>
                {formatMoney(s.hourly, card.currency)}/hr
              </span>
              <form action={removeAction}>
                <input type="hidden" name="entertainerId" value={entertainerId} />
                <input type="hidden" name="date" value={s.date} />
                <button className="btn btn--sm btn--ghost" type="submit" disabled={removing}>
                  Remove
                </button>
              </form>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty">No special dates priced yet.</div>
      )}

      <form action={addAction} className="panel__body row" style={{ gap: 10, alignItems: 'flex-end', borderTop: '1px solid var(--line-soft)' }}>
        <input type="hidden" name="entertainerId" value={entertainerId} />
        <div className="field" style={{ width: 160 }}>
          <label className="field__label" htmlFor="sd-date">
            Date
          </label>
          <input className="input" id="sd-date" name="date" type="date" required />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 140 }}>
          <label className="field__label" htmlFor="sd-label">
            Occasion
          </label>
          <input className="input" id="sd-label" name="label" placeholder="New Year’s Eve" required />
        </div>
        <div className="field" style={{ width: 130 }}>
          <label className="field__label" htmlFor="sd-hourly">
            Hourly
          </label>
          <input className="input" id="sd-hourly" name="hourly" inputMode="decimal" required />
        </div>
        <div className="field" style={{ width: 110 }}>
          <label className="field__label" htmlFor="sd-min">
            Min hours
          </label>
          <input className="input" id="sd-min" name="minimumHours" type="number" min={1} step={0.5} />
        </div>
        <button className="btn" type="submit" disabled={adding}>
          {adding ? 'Adding…' : 'Add'}
        </button>
        {addState.error ? <div className="notice notice--error" style={{ width: '100%' }}>{addState.error}</div> : null}
      </form>
    </section>
  );
}
