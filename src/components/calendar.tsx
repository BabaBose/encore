/**
 * The availability grid a venue sees on a profile and an entertainer edits in
 * their panel. Green is free, red is blocked or booked, amber marks a date the
 * entertainer has priced specially.
 */
import { availabilityCalendar, type AvailabilityBlock } from '@/domain/availability';
import { monthBounds, weekdayOf } from '@/domain/dates';
import { WEEKDAY_LABELS, type IsoDate } from '@/domain/types';

export interface CalendarProps {
  blocks: AvailabilityBlock[];
  year: number;
  month: number;
  specialDates?: IsoDate[];
  /** Highlighted because the venue searched for it. */
  focusDate?: IsoDate | null;
}

export function AvailabilityGrid({ blocks, year, month, specialDates = [], focusDate }: CalendarProps) {
  const { start, end } = monthBounds(year, month);
  const days = availabilityCalendar(blocks, start, end);
  const specials = new Set(specialDates);

  // Pad so the first of the month lands under the right weekday column.
  const leading = weekdayOf(start);

  return (
    <div className="calendar" role="grid" aria-label={`Availability for ${year}-${String(month).padStart(2, '0')}`}>
      {WEEKDAY_LABELS.map((d, i) => (
        <div key={`${d}${i}`} className="calendar__dow">
          {d[0]}
        </div>
      ))}
      {Array.from({ length: leading }, (_, i) => (
        <div key={`pad${i}`} />
      ))}
      {days.map((day) => {
        const special = specials.has(day.date);
        const cls =
          day.status === 'available'
            ? special
              ? 'calendar__day calendar__day--special'
              : 'calendar__day calendar__day--available'
            : `calendar__day calendar__day--${day.status}`;
        const title =
          day.status === 'booked'
            ? 'Booked'
            : day.status === 'blocked'
              ? (day.blocks[0]?.note ?? 'Unavailable')
              : special
                ? 'Available — special-date rate'
                : 'Available';
        return (
          <div
            key={day.date}
            className={cls}
            title={`${day.date} · ${title}`}
            style={focusDate === day.date ? { outline: '2px solid var(--accent)', outlineOffset: 1 } : undefined}
          >
            {Number(day.date.slice(-2))}
            {special && day.status === 'available' ? <span className="calendar__mark" /> : null}
          </div>
        );
      })}
    </div>
  );
}

export function CalendarLegend() {
  return (
    <div className="legend">
      <span>
        <span className="legend__swatch" style={{ background: 'color-mix(in srgb, var(--green) 45%, transparent)' }} />
        Available
      </span>
      <span>
        <span className="legend__swatch" style={{ background: 'color-mix(in srgb, var(--red) 45%, transparent)' }} />
        Blocked or booked
      </span>
      <span>
        <span className="legend__swatch" style={{ background: 'color-mix(in srgb, var(--amber) 45%, transparent)' }} />
        Special-date rate
      </span>
    </div>
  );
}
