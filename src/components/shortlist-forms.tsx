'use client';

import { useActionState } from 'react';
import { createShortlistAction, type ActionState } from '@/app/actions';

export function NewShortlistForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(createShortlistAction, {});
  return (
    <form action={action} className="stack" style={{ gap: 12 }}>
      <div className="field">
        <label className="field__label" htmlFor="name">
          Name
        </label>
        <input className="input" id="name" name="name" placeholder="NYE rooftop" required />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="note">
          Note
        </label>
        <input className="input" id="note" name="note" placeholder="Four hours, 180 covers" />
      </div>
      {state.error ? <div className="notice notice--error">{state.error}</div> : null}
      {state.ok ? <div className="notice notice--ok">{state.ok}</div> : null}
      <button className="btn btn--primary btn--block" type="submit" disabled={pending}>
        {pending ? 'Creating…' : 'Create collection'}
      </button>
    </form>
  );
}
