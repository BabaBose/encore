/**
 * Profile lifecycle and go-live requirements.
 *
 *   draft -> pending_review -> live -> suspended
 *
 * The entertainer authors everything; admin only reviews, approves and can
 * suspend. A profile cannot even be submitted without the minimum the spec
 * requires to be useful to a venue — chiefly at least one video.
 */
import type { ProfileStatus, UserRole } from './types';

export const MIN_VIDEOS_TO_GO_LIVE = 1;
export const MAX_VIDEOS = 10;

export interface ProfileDraft {
  stageName: string;
  shortBio: string;
  fullBio: string;
  categoryId: string | null;
  genres: string[];
  homeCityId: string | null;
  videoCount: number;
  rateCardPublished: boolean;
  /** Agencies and managers must say so on the profile — an answered open question. */
  representationDisclosed: boolean;
  isAgencyManaged: boolean;
}

export interface Requirement {
  key: string;
  label: string;
  met: boolean;
}

/**
 * What still stands between a draft and admin review. Returned as a checklist
 * rather than a single boolean so the entertainer's panel can show exactly
 * what is missing.
 */
export function goLiveRequirements(draft: ProfileDraft): Requirement[] {
  return [
    { key: 'stage_name', label: 'Stage or act name', met: draft.stageName.trim().length > 1 },
    { key: 'short_bio', label: 'Short bio for search cards', met: draft.shortBio.trim().length >= 10 },
    { key: 'full_bio', label: 'Full bio for the profile page', met: draft.fullBio.trim().length >= 40 },
    { key: 'category', label: 'A category', met: !!draft.categoryId },
    { key: 'genres', label: 'At least one genre tag', met: draft.genres.length > 0 },
    { key: 'city', label: 'A base location', met: !!draft.homeCityId },
    {
      key: 'video',
      label: `At least ${MIN_VIDEOS_TO_GO_LIVE} showcase video`,
      met: draft.videoCount >= MIN_VIDEOS_TO_GO_LIVE,
    },
    { key: 'rates', label: 'Published rates', met: draft.rateCardPublished },
    {
      key: 'representation',
      label: 'Agency or manager status declared',
      met: !draft.isAgencyManaged || draft.representationDisclosed,
    },
  ];
}

export function unmetRequirements(draft: ProfileDraft): Requirement[] {
  return goLiveRequirements(draft).filter((r) => !r.met);
}

export function canSubmitForReview(draft: ProfileDraft): boolean {
  return unmetRequirements(draft).length === 0;
}

export class ProfileNotReadyError extends Error {
  constructor(public readonly missing: Requirement[]) {
    super(`Profile is not ready for review: ${missing.map((m) => m.label).join(', ')}`);
    this.name = 'ProfileNotReadyError';
  }
}

export class InvalidProfileTransitionError extends Error {
  constructor(from: ProfileStatus, to: ProfileStatus, role: UserRole) {
    super(`A ${role} cannot move a profile from ${from} to ${to}`);
    this.name = 'InvalidProfileTransitionError';
  }
}

interface ProfileTransition {
  to: ProfileStatus;
  by: UserRole[];
  label: string;
  requiresReadiness?: boolean;
  requiresNote?: boolean;
}

export const PROFILE_TRANSITIONS: Record<ProfileStatus, ProfileTransition[]> = {
  draft: [
    { to: 'pending_review', by: ['entertainer', 'agency'], label: 'Submit for review', requiresReadiness: true },
  ],
  pending_review: [
    { to: 'live', by: ['admin'], label: 'Approve' },
    // A rejection sends it back to draft with a note saying what needs changing.
    { to: 'draft', by: ['admin'], label: 'Request changes', requiresNote: true },
    { to: 'draft', by: ['entertainer', 'agency'], label: 'Withdraw from review' },
  ],
  live: [
    { to: 'suspended', by: ['admin'], label: 'Suspend', requiresNote: true },
    { to: 'draft', by: ['entertainer', 'agency'], label: 'Unpublish' },
  ],
  suspended: [
    { to: 'live', by: ['admin'], label: 'Reinstate' },
    { to: 'draft', by: ['admin'], label: 'Send back to draft', requiresNote: true },
  ],
};

export function allowedProfileTransitions(from: ProfileStatus, role: UserRole): ProfileTransition[] {
  return PROFILE_TRANSITIONS[from].filter((t) => t.by.includes(role));
}

export function applyProfileTransition(args: {
  from: ProfileStatus;
  to: ProfileStatus;
  role: UserRole;
  draft?: ProfileDraft;
  note?: string | null;
}): { status: ProfileStatus; note: string | null } {
  const rule = allowedProfileTransitions(args.from, args.role).find((t) => t.to === args.to);
  if (!rule) throw new InvalidProfileTransitionError(args.from, args.to, args.role);

  if (rule.requiresReadiness) {
    if (!args.draft) throw new Error('Submitting for review needs the draft to check it against');
    const missing = unmetRequirements(args.draft);
    if (missing.length) throw new ProfileNotReadyError(missing);
  }

  const note = args.note?.trim() || null;
  if (rule.requiresNote && !note) {
    throw new Error(`Moving a profile to ${args.to} requires a note explaining why`);
  }

  return { status: args.to, note };
}

/** Only live profiles appear in search or can receive an inquiry. */
export function isDiscoverable(status: ProfileStatus): boolean {
  return status === 'live';
}

export const PROFILE_STATUS_LABEL: Record<ProfileStatus, string> = {
  draft: 'Draft',
  pending_review: 'Pending review',
  live: 'Live',
  suspended: 'Suspended',
};
