'use client';

import { useActionState, useState } from 'react';
import { adminFlagAction, adminModerateAction, adminProfileAction, type ActionState } from '@/app/actions';

/** Approve, request changes on, or suspend a profile. */
export function ReviewDecision({ entertainerId, status }: { entertainerId: string; status: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(adminProfileAction, {});
  const [mode, setMode] = useState<'approve' | 'changes' | 'suspend' | null>(null);

  const options =
    status === 'pending_review'
      ? ([
          ['approve', 'Approve', 'live'],
          ['changes', 'Request changes', 'draft'],
        ] as const)
      : status === 'live'
        ? ([['suspend', 'Suspend', 'suspended']] as const)
        : ([['approve', 'Reinstate', 'live']] as const);

  const active = options.find(([key]) => key === mode);
  const needsNote = mode === 'changes' || mode === 'suspend';

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row row--tight">
        {options.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`btn btn--sm${key === 'approve' ? ' btn--primary' : ''}${key === 'suspend' ? ' btn--danger' : ''}`}
            aria-pressed={mode === key}
            onClick={() => setMode(mode === key ? null : key)}
          >
            {label}
          </button>
        ))}
      </div>
      {active ? (
        <form action={action} className="stack" style={{ gap: 8 }}>
          <input type="hidden" name="entertainerId" value={entertainerId} />
          <input type="hidden" name="to" value={active[2]} />
          {needsNote ? (
            <textarea
              className="textarea"
              name="note"
              placeholder="What needs changing, and why"
              required
              style={{ minHeight: 60 }}
            />
          ) : null}
          {state.error ? <div className="notice notice--error">{state.error}</div> : null}
          <button className="btn btn--sm btn--primary" type="submit" disabled={pending}>
            {pending ? 'Working…' : `Confirm - ${active[1].toLowerCase()}`}
          </button>
        </form>
      ) : state.error ? (
        <div className="notice notice--error">{state.error}</div>
      ) : null}
    </div>
  );
}

/** The verified badge and homepage promotion. */
export function FlagToggle({
  entertainerId,
  flag,
  value,
  label,
}: {
  entertainerId: string;
  flag: 'verified' | 'featured';
  value: boolean;
  label: string;
}) {
  const [, action, pending] = useActionState<ActionState, FormData>(adminFlagAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="entertainerId" value={entertainerId} />
      <input type="hidden" name="flag" value={flag} />
      <input type="hidden" name="value" value={value ? '0' : '1'} />
      <button
        className="btn btn--sm"
        type="submit"
        disabled={pending}
        style={value ? { color: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}
      >
        {value ? `✓ ${label}` : label}
      </button>
    </form>
  );
}

export function ModerationDecision({ target, id }: { target: 'media' | 'reference'; id: string }) {
  const [, action, pending] = useActionState<ActionState, FormData>(adminModerateAction, {});
  return (
    <div className="row row--tight">
      {(['approve', 'reject'] as const).map((decision) => (
        <form key={decision} action={action}>
          <input type="hidden" name="target" value={target} />
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="decision" value={decision} />
          <button
            className={`btn btn--sm${decision === 'approve' ? ' btn--primary' : ' btn--danger'}`}
            type="submit"
            disabled={pending}
          >
            {decision === 'approve' ? 'Approve' : 'Reject'}
          </button>
        </form>
      ))}
    </div>
  );
}
