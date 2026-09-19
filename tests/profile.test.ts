import { describe, expect, it } from 'vitest';
import {
  InvalidProfileTransitionError,
  ProfileNotReadyError,
  applyProfileTransition,
  canSubmitForReview,
  isDiscoverable,
  unmetRequirements,
  type ProfileDraft,
} from '@/domain/profile';

const ready: ProfileDraft = {
  stageName: 'Nadia Rahim',
  shortBio: 'Neo-soul vocalist for rooftop and lounge sets.',
  fullBio: 'Nadia has fronted rooftop residencies across the Gulf for six years, ranging from stripped-back duo sets to a full six-piece band.',
  categoryId: 'singer',
  genres: ['soul'],
  homeCityId: 'dubai',
  videoCount: 2,
  rateCardPublished: true,
  representationDisclosed: false,
  isAgencyManaged: false,
};

describe('go-live requirements', () => {
  it('accepts a complete draft', () => {
    expect(canSubmitForReview(ready)).toBe(true);
  });

  it('requires at least one showcase video', () => {
    const missing = unmetRequirements({ ...ready, videoCount: 0 });
    expect(missing.map((m) => m.key)).toContain('video');
  });

  it('requires published rates', () => {
    expect(unmetRequirements({ ...ready, rateCardPublished: false }).map((m) => m.key)).toContain('rates');
  });

  it('requires an agency-managed act to declare its representation', () => {
    const undeclared = { ...ready, isAgencyManaged: true, representationDisclosed: false };
    expect(unmetRequirements(undeclared).map((m) => m.key)).toContain('representation');
    expect(canSubmitForReview({ ...undeclared, representationDisclosed: true })).toBe(true);
  });

  it('lists every gap at once rather than one at a time', () => {
    const empty = { ...ready, videoCount: 0, genres: [], rateCardPublished: false };
    expect(unmetRequirements(empty).length).toBe(3);
  });
});

describe('profile lifecycle', () => {
  it('sends a complete draft to admin review', () => {
    const out = applyProfileTransition({ from: 'draft', to: 'pending_review', role: 'entertainer', draft: ready });
    expect(out.status).toBe('pending_review');
  });

  it('refuses to submit an incomplete draft', () => {
    expect(() =>
      applyProfileTransition({ from: 'draft', to: 'pending_review', role: 'entertainer', draft: { ...ready, videoCount: 0 } }),
    ).toThrow(ProfileNotReadyError);
  });

  it('lets only an admin approve', () => {
    expect(applyProfileTransition({ from: 'pending_review', to: 'live', role: 'admin' }).status).toBe('live');
    expect(() => applyProfileTransition({ from: 'pending_review', to: 'live', role: 'entertainer' })).toThrow(
      InvalidProfileTransitionError,
    );
  });

  it('requires a note when requesting changes or suspending', () => {
    expect(() => applyProfileTransition({ from: 'pending_review', to: 'draft', role: 'admin' })).toThrow(/note/);
    expect(() => applyProfileTransition({ from: 'live', to: 'suspended', role: 'admin' })).toThrow(/note/);
    const out = applyProfileTransition({ from: 'live', to: 'suspended', role: 'admin', note: 'Unlicensed media' });
    expect(out.note).toBe('Unlicensed media');
  });

  it('lets an entertainer withdraw from review or unpublish without a note', () => {
    expect(applyProfileTransition({ from: 'pending_review', to: 'draft', role: 'entertainer' }).status).toBe('draft');
    expect(applyProfileTransition({ from: 'live', to: 'draft', role: 'entertainer' }).status).toBe('draft');
  });

  it('makes only live profiles discoverable', () => {
    expect(isDiscoverable('live')).toBe(true);
    for (const s of ['draft', 'pending_review', 'suspended'] as const) expect(isDiscoverable(s)).toBe(false);
  });
});
