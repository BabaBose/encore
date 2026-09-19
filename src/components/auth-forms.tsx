'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { changePasswordAction, signInAction, signUpAction, type ActionState } from '@/app/actions';
import type { CityRef } from '@/domain/search';

export function SignInForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(signInAction, {});
  return (
    <form action={action} className="stack" style={{ gap: 14 }}>
      <div className="field">
        <label className="field__label" htmlFor="email">
          Email
        </label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="password">
          Password
        </label>
        <input
          className="input"
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      {state.error ? <div className="notice notice--error">{state.error}</div> : null}
      <button className="btn btn--primary btn--block" type="submit" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
      <p className="field__hint" style={{ textAlign: 'center' }}>
        No account yet? <Link href="/signup" style={{ textDecoration: 'underline' }}>Join Book the Act</Link>
      </p>
    </form>
  );
}

const ROLES = [
  {
    value: 'venue',
    title: 'Venue',
    blurb: 'A restaurant or hotel booking entertainment. Search, shortlist and send inquiries.',
  },
  {
    value: 'entertainer',
    title: 'Entertainer',
    blurb: 'A singer, band, magician or musician. List a profile, set your own rates and calendar.',
  },
  {
    value: 'agency',
    title: 'Agency or manager',
    blurb: 'You represent other acts. Your roster carries a visible “represented” note on each profile.',
  },
] as const;

export function SignUpForm({ cities }: { cities: CityRef[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(signUpAction, {});
  // One account is exactly one role, so this is a choice, not a set of toggles.
  const [role, setRole] = useState<(typeof ROLES)[number]['value']>('venue');

  return (
    <form action={action} className="stack" style={{ gap: 16 }}>
      <fieldset className="stack" style={{ gap: 8, border: 'none', padding: 0, margin: 0 }}>
        <legend className="field__label" style={{ marginBottom: 8 }}>
          I am a
        </legend>
        {ROLES.map((r) => (
          <label
            key={r.value}
            className="checkline card"
            style={{
              borderColor: role === r.value ? 'var(--accent)' : undefined,
              cursor: 'pointer',
              padding: 14,
            }}
          >
            <input
              type="radio"
              name="role"
              value={r.value}
              checked={role === r.value}
              onChange={() => setRole(r.value)}
            />
            <span>
              <span style={{ display: 'block', fontWeight: 700 }}>{r.title}</span>
              <span className="dim" style={{ fontSize: 12, fontWeight: 400 }}>
                {r.blurb}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="field">
        <label className="field__label" htmlFor="displayName">
          {role === 'venue' ? 'Venue name' : role === 'agency' ? 'Agency name' : 'Stage or act name'}
        </label>
        <input className="input" id="displayName" name="displayName" required />
      </div>

      {role === 'venue' ? (
        <>
          <div className="field">
            <label className="field__label" htmlFor="venueType">
              Type
            </label>
            <select className="select" id="venueType" name="venueType" defaultValue="restaurant">
              <option value="restaurant">Restaurant</option>
              <option value="hotel">Hotel</option>
              <option value="bar">Bar or lounge</option>
              <option value="events">Events company</option>
            </select>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="cityId">
              City
            </label>
            <select className="select" id="cityId" name="cityId" defaultValue={cities[0]?.id}>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </>
      ) : null}

      <div className="field">
        <label className="field__label" htmlFor="email">
          Email
        </label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="password">
          Password
        </label>
        <input
          className="input"
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <span className="field__hint">At least 8 characters.</span>
      </div>

      {role === 'entertainer' ? (
        <p className="field__hint">
          Entertainers pay a subscription — Book the Act takes no commission on a booking. You start on a free trial
          and your profile goes live once we have reviewed it.
        </p>
      ) : null}

      {state.error ? <div className="notice notice--error">{state.error}</div> : null}
      <button className="btn btn--primary btn--block" type="submit" disabled={pending}>
        {pending ? 'Creating…' : 'Create account'}
      </button>
      <p className="field__hint" style={{ textAlign: 'center' }}>
        Already here? <Link href="/signin" style={{ textDecoration: 'underline' }}>Sign in</Link>
      </p>
    </form>
  );
}

/**
 * Changing your own password. Lives with the sign-in forms because it is the
 * same concern, and because it is the one thing every account needs whatever
 * its role.
 */
export function ChangePasswordForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(changePasswordAction, {});
  return (
    <form action={action} className="stack" style={{ gap: 14, maxWidth: 420 }}>
      <div className="field">
        <label className="field__label" htmlFor="currentPassword">
          Current password
        </label>
        <input
          className="input"
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="newPassword">
          New password
        </label>
        <input
          className="input"
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
        />
        <div className="field__hint">At least 10 characters. A passphrase beats a short complicated one.</div>
      </div>
      <div className="field">
        <label className="field__label" htmlFor="confirmPassword">
          New password again
        </label>
        <input
          className="input"
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
        />
      </div>
      {state.error ? <div className="notice notice--error">{state.error}</div> : null}
      {state.ok ? <div className="notice notice--ok">{state.ok}</div> : null}
      <button className="btn btn--primary" type="submit" disabled={pending}>
        {pending ? 'Changing…' : 'Change password'}
      </button>
    </form>
  );
}
