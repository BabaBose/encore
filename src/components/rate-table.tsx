/**
 * The published rate table: the [day-of-week] x [time block] grid, the
 * minimum-hours rule, special dates and the residency package. Read-only here;
 * the entertainer's panel renders the same shape with inputs.
 */
import { TIME_BLOCKS, TIME_BLOCK_LABELS, WEEKDAY_LABELS, type Weekday } from '@/domain/types';
import type { RateCard } from '@/domain/rates';
import { Price } from '@/components/money';

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
                    -
                  </td>
                );
              }
              return (
                <td key={b} className={rule.hourly === peak ? 'is-peak' : undefined}>
                  <Price minor={rule.hourly} currency={card.currency} />
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
      <dd>
        <Price minor={card.baseHourly} currency={card.currency} /> / hour
      </dd>
      <dt>Minimum</dt>
      <dd>
        {card.minimumHours} hour{card.minimumHours === 1 ? '' : 's'} per booking
      </dd>
      {card.residency ? (
        <>
          <dt>Residency</dt>
          <dd>
            {card.residency.monthly != null
              ? <><Price minor={card.residency.monthly} currency={card.currency} /> / month</>
              : <><Price minor={card.residency.weekly ?? 0} currency={card.currency} /> / week</>}{' '}
            · {card.residency.daysPerWeekIncluded} nights a week included
          </dd>
          {card.residency.extraDayRate != null ? (
            <>
              <dt>Extra night</dt>
              <dd>
                <Price minor={card.residency.extraDayRate} currency={card.currency} />
              </dd>
            </>
          ) : null}
        </>
      ) : null}
    </dl>
  );
}
