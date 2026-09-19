/**
 * The published rate table: the [day-of-week] x [time block] grid, the
 * minimum-hours rule, special dates and the residency package. Read-only here;
 * the entertainer's panel renders the same shape with inputs.
 */
import { TIME_BLOCKS, TIME_BLOCK_LABELS, WEEKDAY_LABELS, type Weekday } from '@/domain/types';
import type { RateCard } from '@/domain/rates';
import { formatMoney } from '@/lib/format';

export function RateGrid({ card }: { card: RateCard }) {
  const cell = (weekday: Weekday, block: (typeof TIME_BLOCKS)[number]) =>
    card.rules.find((r) => r.weekday === weekday && r.timeBlock === block);
  const peak = Math.max(0, ...card.rules.map((r) => r.hourly));

  return (
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
            {TIME_BLOCKS.map((b) => {
              const rule = cell(i as Weekday, b);
              if (!rule) {
                return (
                  <td key={b} className="is-empty">
                    —
                  </td>
                );
              }
              return (
                <td key={b} className={rule.hourly === peak ? 'is-peak' : undefined}>
                  {formatMoney(rule.hourly, card.currency)}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function RateSummary({ card }: { card: RateCard }) {
  return (
    <dl className="kv">
      <dt>Base</dt>
      <dd>{formatMoney(card.baseHourly, card.currency)} / hour</dd>
      <dt>Minimum</dt>
      <dd>
        {card.minimumHours} hour{card.minimumHours === 1 ? '' : 's'} per booking
      </dd>
      {card.residency ? (
        <>
          <dt>Residency</dt>
          <dd>
            {card.residency.monthly != null
              ? `${formatMoney(card.residency.monthly, card.currency)} / month`
              : `${formatMoney(card.residency.weekly ?? 0, card.currency)} / week`}{' '}
            · {card.residency.daysPerWeekIncluded} nights a week included
          </dd>
          {card.residency.extraDayRate != null ? (
            <>
              <dt>Extra night</dt>
              <dd>{formatMoney(card.residency.extraDayRate, card.currency)}</dd>
            </>
          ) : null}
        </>
      ) : null}
    </dl>
  );
}
