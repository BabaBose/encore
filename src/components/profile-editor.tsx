'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import {
  addAwardAction,
  addMediaAction,
  addReferenceAction,
  deleteMediaAction,
  saveProfileAction,
  submitForReviewAction,
  type ActionState,
} from '@/app/actions';
import {
  CONTRACT_LENGTHS,
  RESIDENCY_INQUIRY_POLICIES,
  RESIDENCY_POLICY_HINT,
  RESIDENCY_POLICY_LABEL,
  type ContractLength,
  type ProfileStatus,
  type ResidencyInquiryPolicy,
} from '@/domain/types';
import { MAX_VIDEOS, PROFILE_STATUS_LABEL, type Requirement } from '@/domain/profile';
import type { AwardRow, CategoryRow, MediaRow, ReferenceRow } from '@/db/repo';
import type { CityRef } from '@/domain/search';
import { formatDate } from '@/lib/format';

export interface ActFormValues {
  id: string;
  stageName: string;
  realName: string | null;
  shortBio: string;
  fullBio: string;
  categorySlug: string;
  genreSlugs: string[];
  homeCityId: string;
  countryOfOrigin: string;
  teamSize: number;
  languages: string[];
  equipmentProvided: string;
  equipmentRequired: string;
  travelRadiusKm: number;
  acceptsShortTerm: boolean;
  acceptsLongTerm: boolean;
  openToRelocate: boolean;
  contractLengths: ContractLength[];
  residencyInquiryPolicy: ResidencyInquiryPolicy;
  representationNote: string | null;
  isManaged: boolean;
}

export function ProfileForm({
  act,
  categories,
  genres,
  cities,
}: {
  act: ActFormValues;
  categories: CategoryRow[];
  genres: CategoryRow[];
  cities: CityRef[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveProfileAction, {});
  const [categoryId, setCategoryId] = useState(
    categories.find((c) => c.slug === act.categorySlug)?.id ?? categories[0]?.id ?? '',
  );
  // Long-term fields only make sense once residencies are switched on.
  const [longTerm, setLongTerm] = useState(act.acceptsLongTerm);
  const [residencyPolicy, setResidencyPolicy] = useState(act.residencyInquiryPolicy);

  const visibleGenres = genres.filter((g) => g.parentId === categoryId);

  return (
    <form action={action} className="panel">
      <input type="hidden" name="entertainerId" value={act.id} />
      <div className="panel__head">
        <span className="eyebrow">Identity and act</span>
      </div>
      <div className="panel__body stack" style={{ gap: 16 }}>
        <div className="row" style={{ gap: 14 }}>
          <div className="field" style={{ flex: 1, minWidth: 180 }}>
            <label className="field__label" htmlFor="stageName">
              Stage or act name
            </label>
            <input className="input" id="stageName" name="stageName" defaultValue={act.stageName} required />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 180 }}>
            <label className="field__label" htmlFor="realName">
              Real name (private)
            </label>
            <input className="input" id="realName" name="realName" defaultValue={act.realName ?? ''} />
            <span className="field__hint">Never shown to venues.</span>
          </div>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="shortBio">
            Short bio — one or two lines, used on search cards
          </label>
          <input className="input" id="shortBio" name="shortBio" defaultValue={act.shortBio} maxLength={140} />
        </div>

        <div className="field">
          <label className="field__label" htmlFor="fullBio">
            Full bio
          </label>
          <textarea className="textarea" id="fullBio" name="fullBio" defaultValue={act.fullBio} style={{ minHeight: 130 }} />
        </div>

        <div className="row" style={{ gap: 14 }}>
          <div className="field" style={{ flex: 1, minWidth: 170 }}>
            <label className="field__label" htmlFor="categoryId">
              Category
            </label>
            <select
              className="select"
              id="categoryId"
              name="categoryId"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: 1, minWidth: 170 }}>
            <label className="field__label" htmlFor="homeCityId">
              Base location
            </label>
            <select className="select" id="homeCityId" name="homeCityId" defaultValue={act.homeCityId}>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ width: 140 }}>
            <label className="field__label" htmlFor="countryOfOrigin">
              Country of origin
            </label>
            <input
              className="input"
              id="countryOfOrigin"
              name="countryOfOrigin"
              defaultValue={act.countryOfOrigin}
              maxLength={2}
              placeholder="AE"
            />
          </div>
        </div>

        <fieldset className="field" style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend className="field__label" style={{ marginBottom: 8 }}>
            Genre tags
          </legend>
          <div className="row row--tight">
            {visibleGenres.map((g) => (
              <label key={g.id} className="chip" style={{ cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  name="genres"
                  value={g.id}
                  defaultChecked={act.genreSlugs.includes(g.slug)}
                  style={{ accentColor: 'var(--accent)' }}
                />
                {g.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="row" style={{ gap: 14 }}>
          <div className="field" style={{ width: 120 }}>
            <label className="field__label" htmlFor="teamSize">
              Team size
            </label>
            <input className="input" id="teamSize" name="teamSize" type="number" min={1} defaultValue={act.teamSize} />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 180 }}>
            <label className="field__label" htmlFor="languages">
              Languages performed in
            </label>
            <input
              className="input"
              id="languages"
              name="languages"
              defaultValue={act.languages.join(', ')}
              placeholder="English, Arabic"
            />
          </div>
          <div className="field" style={{ width: 150 }}>
            <label className="field__label" htmlFor="travelRadiusKm">
              Travel radius (km)
            </label>
            <input
              className="input"
              id="travelRadiusKm"
              name="travelRadiusKm"
              type="number"
              min={0}
              defaultValue={act.travelRadiusKm}
            />
          </div>
        </div>

        <div className="row" style={{ gap: 14 }}>
          <div className="field" style={{ flex: 1, minWidth: 200 }}>
            <label className="field__label" htmlFor="equipmentProvided">
              What you bring
            </label>
            <input
              className="input"
              id="equipmentProvided"
              name="equipmentProvided"
              defaultValue={act.equipmentProvided}
              placeholder="Own sound rig, IEMs…"
            />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 200 }}>
            <label className="field__label" htmlFor="equipmentRequired">
              What the venue must provide
            </label>
            <input
              className="input"
              id="equipmentRequired"
              name="equipmentRequired"
              defaultValue={act.equipmentRequired}
              placeholder="PA system, two monitor sends…"
            />
          </div>
        </div>

        <hr className="divider" />

        <div className="stack" style={{ gap: 10 }}>
          <div className="eyebrow">Availability modes — both can be on at once</div>
          <label className="checkline">
            <input type="checkbox" name="acceptsShortTerm" defaultChecked={act.acceptsShortTerm} />
            <span>
              <strong>Short-term and one-off gigs</strong>
              <br />
              <span className="dim" style={{ fontSize: 12 }}>
                Single dates or short runs, shown as your open and blocked days.
              </span>
            </span>
          </label>
          <label className="checkline">
            <input
              type="checkbox"
              name="acceptsLongTerm"
              checked={longTerm}
              onChange={(e) => setLongTerm(e.target.checked)}
            />
            <span>
              <strong>Long-term residencies</strong>
              <br />
              <span className="dim" style={{ fontSize: 12 }}>
                Extended contracts, priced as a package rather than by the hour.
              </span>
            </span>
          </label>

          {longTerm ? (
            <div className="card stack" style={{ gap: 12 }}>
              <fieldset className="field" style={{ border: 'none', padding: 0, margin: 0 }}>
                <legend className="field__label" style={{ marginBottom: 8 }}>
                  Contract lengths you will consider
                </legend>
                <div className="row row--tight">
                  {CONTRACT_LENGTHS.map((m) => (
                    <label key={m} className="chip" style={{ cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        name="contractLengths"
                        value={m}
                        defaultChecked={act.contractLengths.includes(m)}
                        style={{ accentColor: 'var(--accent)' }}
                      />
                      {m} month{m > 1 ? 's' : ''}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="checkline">
                <input type="checkbox" name="openToRelocate" defaultChecked={act.openToRelocate} />
                <span>
                  <strong>Open to relocating for a residency</strong>
                  <br />
                  <span className="dim" style={{ fontSize: 12 }}>
                    This is what puts you in front of venues in other cities and countries. Leave it off and your
                    residency availability applies to your home city only.
                  </span>
                </span>
              </label>

              <fieldset className="stack" style={{ gap: 8, border: 'none', padding: 0, margin: 0 }}>
                <legend className="field__label" style={{ marginBottom: 6 }}>
                  Show me in residency searches
                </legend>
                {RESIDENCY_INQUIRY_POLICIES.map((policy) => (
                  <label key={policy} className="checkline">
                    <input
                      type="radio"
                      name="residencyInquiryPolicy"
                      value={policy}
                      checked={residencyPolicy === policy}
                      onChange={() => setResidencyPolicy(policy)}
                    />
                    <span>
                      <strong>{RESIDENCY_POLICY_LABEL[policy]}</strong>
                      <br />
                      <span className="dim" style={{ fontSize: 12 }}>
                        {RESIDENCY_POLICY_HINT[policy]}
                      </span>
                    </span>
                  </label>
                ))}
                <p className="field__hint">
                  A single date is different: if a night is already taken you never appear in a one-off search
                  for it, whichever of these you pick.
                </p>
              </fieldset>
            </div>
          ) : null}
        </div>

        {act.isManaged ? (
          <div className="field">
            <label className="field__label" htmlFor="representationNote">
              Representation — shown on your public profile
            </label>
            <input
              className="input"
              id="representationNote"
              name="representationNote"
              defaultValue={act.representationNote ?? ''}
              placeholder="Represented by … (agency)"
            />
            <span className="field__hint">
              An agency or manager listing on an act’s behalf has to say so. Venues see this note.
            </span>
          </div>
        ) : null}

        {state.error ? <div className="notice notice--error">{state.error}</div> : null}
        {state.ok ? <div className="notice notice--ok">{state.ok}</div> : null}

        <button className="btn btn--primary" type="submit" disabled={pending} style={{ alignSelf: 'flex-start' }}>
          {pending ? 'Saving…' : 'Save profile'}
        </button>
      </div>
    </form>
  );
}

export function MediaEditor({
  entertainerId,
  videos,
  awards,
}: {
  entertainerId: string;
  videos: MediaRow[];
  awards: AwardRow[];
}) {
  const [addState, addAction, adding] = useActionState<ActionState, FormData>(addMediaAction, {});
  const [, removeAction, removing] = useActionState<ActionState, FormData>(deleteMediaAction, {});
  const [awardState, awardAction, addingAward] = useActionState<ActionState, FormData>(addAwardAction, {});

  return (
    <section className="panel">
      <div className="panel__head">
        <span className="eyebrow">Showcase</span>
        <span className="dim" style={{ fontSize: 12 }}>
          at least one video to go live, up to {MAX_VIDEOS}
        </span>
      </div>

      {videos.length ? (
        <div className="listing">
          {videos.map((v) => (
            <div key={v.id} className="listing__item">
              <div className="listing__main">
                <div className="listing__name">{v.title ?? 'Video'}</div>
                <div className="listing__meta">{v.url}</div>
              </div>
              {v.moderation !== 'approved' ? (
                <span className={`pill pill--${v.moderation === 'rejected' ? 'negative' : 'neutral'}`}>
                  {v.moderation}
                </span>
              ) : null}
              <form action={removeAction}>
                <input type="hidden" name="entertainerId" value={entertainerId} />
                <input type="hidden" name="mediaId" value={v.id} />
                <button className="btn btn--sm btn--ghost" type="submit" disabled={removing}>
                  Remove
                </button>
              </form>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty">No videos yet — a venue will not book what it cannot watch.</div>
      )}

      <form action={addAction} className="panel__body row" style={{ gap: 10, alignItems: 'flex-end', borderTop: '1px solid var(--line-soft)' }}>
        <input type="hidden" name="entertainerId" value={entertainerId} />
        <div className="field" style={{ flex: 2, minWidth: 220 }}>
          <label className="field__label" htmlFor="video-url">
            YouTube, Vimeo or Instagram link
          </label>
          <input className="input" id="video-url" name="url" placeholder="https://…" required />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 150 }}>
          <label className="field__label" htmlFor="video-title">
            Title
          </label>
          <input className="input" id="video-title" name="title" placeholder="Rooftop set" />
        </div>
        <button className="btn" type="submit" disabled={adding || videos.length >= MAX_VIDEOS}>
          {adding ? 'Adding…' : 'Add video'}
        </button>
        {addState.error ? <div className="notice notice--error" style={{ width: '100%' }}>{addState.error}</div> : null}
      </form>

      <div className="panel__head" style={{ borderTop: '1px solid var(--line-soft)' }}>
        <span className="eyebrow">Awards and recognitions</span>
      </div>
      {awards.length ? (
        <div className="listing">
          {awards.map((a) => (
            <div key={a.id} className="listing__item">
              <div className="listing__main">
                <div className="listing__name">{a.title}</div>
                <div className="listing__meta">{a.issuer}</div>
              </div>
              <span className="mono dim">{a.year}</span>
            </div>
          ))}
        </div>
      ) : null}
      <form action={awardAction} className="panel__body row" style={{ gap: 10, alignItems: 'flex-end', borderTop: '1px solid var(--line-soft)' }}>
        <input type="hidden" name="entertainerId" value={entertainerId} />
        <div className="field" style={{ flex: 2, minWidth: 180 }}>
          <label className="field__label" htmlFor="award-title">
            Award
          </label>
          <input className="input" id="award-title" name="title" required />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 150 }}>
          <label className="field__label" htmlFor="award-issuer">
            Issued by
          </label>
          <input className="input" id="award-issuer" name="issuer" />
        </div>
        <div className="field" style={{ width: 100 }}>
          <label className="field__label" htmlFor="award-year">
            Year
          </label>
          <input className="input" id="award-year" name="year" type="number" min={1950} max={2100} />
        </div>
        <button className="btn" type="submit" disabled={addingAward}>
          Add
        </button>
        {awardState.error ? <div className="notice notice--error" style={{ width: '100%' }}>{awardState.error}</div> : null}
      </form>
    </section>
  );
}

export function ReferenceEditor({
  entertainerId,
  references,
}: {
  entertainerId: string;
  references: ReferenceRow[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addReferenceAction, {});

  return (
    <section className="panel">
      <div className="panel__head">
        <span className="eyebrow">References you add yourself</span>
        <span className="dim" style={{ fontSize: 12 }}>
          shown apart from verified reviews
        </span>
      </div>

      {references.length ? (
        <div className="listing">
          {references.map((r) => (
            <div key={r.id} className="listing__item">
              <div className="listing__main">
                <div className="listing__name">{r.clientName}</div>
                <div className="listing__meta">
                  “{r.quote}”{r.gigDate ? ` · ${formatDate(r.gigDate)}` : ''}
                </div>
              </div>
              <span
                className={`pill pill--${
                  r.moderation === 'approved' ? 'positive' : r.moderation === 'rejected' ? 'negative' : 'neutral'
                }`}
              >
                {r.moderation}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty">No references yet.</div>
      )}

      <form action={action} className="panel__body stack" style={{ gap: 12, borderTop: '1px solid var(--line-soft)' }}>
        <input type="hidden" name="entertainerId" value={entertainerId} />
        <div className="field">
          <label className="field__label" htmlFor="ref-quote">
            What they said
          </label>
          <textarea className="textarea" id="ref-quote" name="quote" required style={{ minHeight: 70 }} />
        </div>
        <div className="row" style={{ gap: 10, alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: 1, minWidth: 180 }}>
            <label className="field__label" htmlFor="ref-client">
              Venue or client
            </label>
            <input className="input" id="ref-client" name="clientName" required />
          </div>
          <div className="field" style={{ width: 170 }}>
            <label className="field__label" htmlFor="ref-date">
              Date of the gig
            </label>
            <input className="input" id="ref-date" name="gigDate" type="date" />
          </div>
          <button className="btn" type="submit" disabled={pending}>
            {pending ? 'Adding…' : 'Add reference'}
          </button>
        </div>
        <p className="field__hint">Only add a quote you have the client’s consent to publish.</p>
        {state.error ? <div className="notice notice--error">{state.error}</div> : null}
        {state.ok ? <div className="notice notice--ok">{state.ok}</div> : null}
      </form>
    </section>
  );
}

export function GoLiveChecklist({
  entertainerId,
  status,
  requirements,
  reviewNote,
  slug,
}: {
  entertainerId: string;
  status: ProfileStatus;
  requirements: Requirement[];
  reviewNote: string | null;
  slug: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(submitForReviewAction, {});
  const unmet = requirements.filter((r) => !r.met);

  return (
    <div className="panel">
      <div className="panel__head spread">
        <span className="eyebrow">Going live</span>
        <span
          className={`pill pill--${status === 'live' ? 'positive' : status === 'suspended' ? 'negative' : 'neutral'}`}
        >
          {PROFILE_STATUS_LABEL[status]}
        </span>
      </div>
      <div className="panel__body stack" style={{ gap: 14 }}>
        {reviewNote ? <div className="notice">Encore’s note: “{reviewNote}”</div> : null}

        <ul className="stack" style={{ gap: 8, listStyle: 'none', padding: 0, margin: 0 }}>
          {requirements.map((r) => (
            <li key={r.key} className="row row--tight" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
              <span style={{ color: r.met ? 'var(--green)' : 'var(--ink-faint)', width: 16 }}>
                {r.met ? '✓' : '○'}
              </span>
              <span style={{ fontSize: 13, color: r.met ? 'var(--ink-muted)' : 'var(--ink)' }}>{r.label}</span>
            </li>
          ))}
        </ul>

        {state.error ? <div className="notice notice--error">{state.error}</div> : null}
        {state.ok ? <div className="notice notice--ok">{state.ok}</div> : null}

        {status === 'draft' ? (
          <form action={action}>
            <input type="hidden" name="entertainerId" value={entertainerId} />
            <button className="btn btn--primary btn--block" type="submit" disabled={pending || unmet.length > 0}>
              {pending ? 'Sending…' : 'Send for review'}
            </button>
          </form>
        ) : status === 'pending_review' ? (
          <p className="dim" style={{ fontSize: 12.5 }}>
            With Encore now. You will get a notification either way.
          </p>
        ) : status === 'live' ? (
          <Link className="btn btn--block" href={`/entertainers/${slug}`}>
            View your public profile
          </Link>
        ) : (
          <p className="dim" style={{ fontSize: 12.5 }}>
            Suspended — contact Encore to have this looked at again.
          </p>
        )}
      </div>
    </div>
  );
}
