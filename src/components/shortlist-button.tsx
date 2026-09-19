'use client';

/** Favourite an act into a named collection, or into the default one. */
import { useActionState } from 'react';
import { toggleShortlistAction, type ActionState } from '@/app/actions';
import type { ShortlistRow } from '@/db/repo';

export function ShortlistButton({
  entertainerId,
  shortlists,
}: {
  entertainerId: string;
  shortlists: ShortlistRow[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(toggleShortlistAction, {});
  const saved = shortlists.some((l) => l.entertainerIds.includes(entertainerId));

  return (
    <form action={formAction} className="row row--tight">
      <input type="hidden" name="entertainerId" value={entertainerId} />
      {shortlists.length > 1 ? (
        <select className="select" name="shortlistId" style={{ width: 'auto', padding: '6px 28px 6px 10px', fontSize: 12 }}>
          {shortlists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      ) : null}
      <button
        className="btn btn--sm"
        type="submit"
        disabled={pending}
        title={state.error ?? (saved ? 'Remove from your shortlist' : 'Save to a shortlist')}
        aria-label={saved ? 'Remove from shortlist' : 'Save to shortlist'}
        style={saved ? { color: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}
      >
        {saved ? '♥' : '♡'}
      </button>
    </form>
  );
}
