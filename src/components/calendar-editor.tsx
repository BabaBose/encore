'use client';

/** Adding and lifting manual blocks. Booking blocks are shown but locked. */
import { useActionState, useState } from 'react';
import Link from 'next/link';
import { addBlockAction, removeBlockAction, type ActionState } from '@/app/actions';
import { canRemoveBlock, type AvailabilityBlock } from '@/domain/availability';
import { WEEKDAY_LABELS } from '@/domain/types';
import { formatDate } from '@/lib/format';
import type { InquiryRow } from '@/db/repo';

export function BlockForm({ entertainerId }: { entertainerId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addBlockAction, {});
  const [kind, setKind] = useState<'single' | 'range' | 'recurring_weekday'>('single');

  return (
    <form action={action} className="stack" style={{ gap: 14 }}>
      <input type="hidden" name="entertainerId" value={entertainerId} />
      <input type="hidden" name="kind" value={kind} />

      <div className="field">
        <span className="field__label">Kind</span>
        <div className="toggle" role="group" aria-label="Block kind" style={{ flexWrap: 'wrap' }}>
          {(
            [
              ['single', 'One day'],
              ['range', 'A run'],
              ['recurring_weekday', 'Every week'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className="toggle__option"
              aria-pressed={kind === value}
              onClick={() => setKind(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {kind === 'recurring_weekday' ? (
        <>
          <div className="field">
            <label className="field__label" htmlFor="weekday">
              Day
            </label>
            <select className="select" id="weekday" name="weekday" defaultValue="0">
              {WEEKDAY_LABELS.map((label, i) => (
                <option key={label} value={i}>
                  Every {label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="recurFrom">
              From (optional)
            </label>
            <input className="input" id="recurFrom" name="recurFrom" type="date" />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="recurUntil">
              Until (optional)
            </label>
            <input className="input" id="recurUntil" name="recurUntil" type="date" />
          </div>
        </>
      ) : (
        <>
          <div className="field">
            <label className="field__label" htmlFor="start">
              {kind === 'range' ? 'From' : 'Date'}
            </label>
            <input className="input" id="start" name="start" type="date" required />
          </div>
          {kind === 'range' ? (
            <div className="field">
              <label className="field__label" htmlFor="end">
                To
              </label>
              <input className="input" id="end" name="end" type="date" required />
            </div>
          ) : null}
        </>
      )}

      <div className="field">
        <label className="field__label" htmlFor="note">
          Note (only you see this)
        </label>
        <input className="input" id="note" name="note" placeholder="Touring, recording, away…" />
      </div>

      {state.error ? <div className="notice notice--error">{state.error}</div> : null}
      {state.ok ? <div className="notice notice--ok">{state.ok}</div> : null}

      <button className="btn btn--primary btn--block" type="submit" disabled={pending}>
        {pending ? 'Blocking…' : 'Block these dates'}
      </button>
    </form>
  );
}

export function BlockList({
  entertainerId,
  blocks,
  bookings,
}: {
  entertainerId: string;
  blocks: AvailabilityBlock[];
  bookings: InquiryRow[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(removeBlockAction, {});
  const bookingFor = (id?: string) => bookings.find((b) => b.id === id);

  const sorted = [...blocks].sort((a, b) => (a.start ?? '9999').localeCompare(b.start ?? '9999'));

  if (!sorted.length) {
    return <div className="empty">Nothing blocked — every date is open.</div>;
  }

  return (
    <div className="panel">
      {state.error ? (
        <div style={{ padding: 14 }}>
          <div className="notice notice--error">{state.error}</div>
        </div>
      ) : null}
      <div className="listing">
        {sorted.map((block) => {
          const booking = bookingFor(block.bookingId);
          const label =
            block.kind === 'recurring_weekday'
              ? `Every ${WEEKDAY_LABELS[block.weekday ?? 0]}`
              : block.start === block.end || !block.end
                ? formatDate(block.start!)
                : `${formatDate(block.start!)} – ${formatDate(block.end)}`;

          return (
            <div key={block.id} className="listing__item">
              <div className="listing__main">
                <div className="listing__name">{label}</div>
                <div className="listing__meta">
                  {booking ? (
                    <>
                      Confirmed booking · {booking.venueName}
                    </>
                  ) : (
                    (block.note ?? 'Blocked by you')
                  )}
                  {block.kind === 'recurring_weekday' && (block.recurFrom || block.recurUntil)
                    ? ` · ${block.recurFrom ? formatDate(block.recurFrom) : 'open'} to ${
                        block.recurUntil ? formatDate(block.recurUntil) : 'open'
                      }`
                    : ''}
                </div>
              </div>
              {canRemoveBlock(block) ? (
                <form action={action}>
                  <input type="hidden" name="entertainerId" value={entertainerId} />
                  <input type="hidden" name="blockId" value={block.id} />
                  <button className="btn btn--sm btn--ghost" type="submit" disabled={pending}>
                    Free up
                  </button>
                </form>
              ) : booking ? (
                <Link className="btn btn--sm btn--ghost" href={`/app/inquiries/${booking.id}`}>
                  Held by a booking
                </Link>
              ) : (
                <span className="pill pill--neutral">Locked</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
