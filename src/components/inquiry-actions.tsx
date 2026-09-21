'use client';

/**
 * The action bar on an inquiry.
 *
 * Which buttons exist is not a UI decision — it is read straight from the
 * domain's transition table for this status and this actor, so the screen can
 * never offer a move the server would reject.
 */
import { useActionState, useState } from 'react';
import { transitionInquiryAction, leaveReviewAction, type ActionState } from '@/app/actions';
import { allowedTransitions } from '@/domain/inquiry';
import type { InquiryActor, InquiryStatus } from '@/domain/types';
import { useMoney } from '@/components/money';
import { CURRENCIES, convert, roundForDisplay } from '@/domain/currency';

export function InquiryActions({
  inquiryId,
  status,
  actor,
  currency,
  offerAmount,
}: {
  inquiryId: string;
  status: InquiryStatus;
  actor: InquiryActor;
  currency: string;
  offerAmount: number;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(transitionInquiryAction, {});
  const [open, setOpen] = useState<string | null>(null);
  // Counter in whatever currency this person is reading prices in.
  const view = useMoney();
  const counterConverted =
    view.fx && view.currency !== currency
      ? convert(offerAmount, currency, view.currency, view.fx)
      : null;
  // As on the inquiry form: without a rate, stay in the act's currency rather
  // than label a number one thing and send it as another.
  const counterCurrency = counterConverted == null ? currency : view.currency;
  const counterUnits = CURRENCIES[counterCurrency]?.minorUnits ?? 2;
  const counterPrefill = String(
    roundForDisplay(counterConverted ?? offerAmount, counterCurrency) / 10 ** counterUnits,
  );

  const moves = allowedTransitions(status, actor).filter((t) => t.to !== 'viewed');
  if (!moves.length) {
    return <p className="dim" style={{ fontSize: 12.5 }}>This inquiry is closed - nothing left to do.</p>;
  }

  const active = moves.find((m) => m.to === open);

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row row--tight">
        {moves.map((m) => (
          <button
            key={`${m.to}-${m.label}`}
            type="button"
            className={`btn btn--sm${m.to === 'confirmed' || m.to === 'accepted' ? ' btn--primary' : ''}${
              m.to === 'cancelled' || m.to === 'declined' ? ' btn--danger' : ''
            }`}
            aria-pressed={open === m.to}
            onClick={() => setOpen(open === m.to ? null : m.to)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {active ? (
        <form action={action} className="card stack" style={{ gap: 10 }}>
          <input type="hidden" name="inquiryId" value={inquiryId} />
          <input type="hidden" name="to" value={active.to} />

          {active.to === 'countered' ? (
            <div className="field">
              <label className="field__label" htmlFor="offer">
                Your counter-offer ({counterCurrency})
              </label>
              <input
                className="input"
                id="offer"
                name="offer"
                inputMode="decimal"
                defaultValue={counterPrefill}
                required
              />
              {/* Travels with the number: the same figure means different money
                  depending on what the person typing it was being shown. */}
              <input type="hidden" name="offerCurrency" value={counterCurrency} />
              {counterCurrency !== currency ? (
                <span className="field__hint">
                  Agreed and paid in {currency}, converted when you send it.
                </span>
              ) : null}
            </div>
          ) : null}

          {active.requiresReason ? (
            <div className="field">
              <label className="field__label" htmlFor="reason">
                Reason (logged for both sides)
              </label>
              <textarea className="textarea" id="reason" name="reason" required style={{ minHeight: 64 }} />
            </div>
          ) : null}

          {active.to === 'confirmed' ? (
            <p className="field__hint">
              Confirming holds these dates on the calendar immediately. Nobody else can take them.
            </p>
          ) : null}

          {state.error ? <div className="notice notice--error">{state.error}</div> : null}

          <div className="row row--tight">
            <button className="btn btn--primary btn--sm" type="submit" disabled={pending}>
              {pending ? 'Working…' : active.label}
            </button>
            <button className="btn btn--sm btn--ghost" type="button" onClick={() => setOpen(null)}>
              Cancel
            </button>
          </div>
        </form>
      ) : state.error ? (
        <div className="notice notice--error">{state.error}</div>
      ) : null}
    </div>
  );
}

/** Verified review, offered to the venue once a booking is completed. */
export function ReviewForm({ inquiryId, entertainerName }: { inquiryId: string; entertainerName: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(leaveReviewAction, {});
  if (state.ok) return <div className="notice notice--ok">{state.ok}</div>;

  return (
    <form action={action} className="card stack" style={{ gap: 12 }}>
      <input type="hidden" name="inquiryId" value={inquiryId} />
      <div>
        <div className="subtitle">How was {entertainerName}?</div>
        <p className="dim" style={{ fontSize: 12.5 }}>
          This becomes a verified review on their profile - venues can tell it apart from quotes acts add
          themselves.
        </p>
      </div>
      <div className="field">
        <label className="field__label" htmlFor="rating">
          Rating
        </label>
        <select className="select" id="rating" name="rating" defaultValue="5">
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {'★'.repeat(n)} {n}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="field__label" htmlFor="body">
          Reference
        </label>
        <textarea className="textarea" id="body" name="body" required />
      </div>
      {state.error ? <div className="notice notice--error">{state.error}</div> : null}
      <button className="btn btn--primary" type="submit" disabled={pending}>
        {pending ? 'Posting…' : 'Post review'}
      </button>
    </form>
  );
}
