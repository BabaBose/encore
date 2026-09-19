/**
 * Profile service: authoring, submission and the admin review queue.
 *
 * The entertainer authors everything here; admin only approves, rejects,
 * suspends, verifies and features. That split is enforced by the role checks on
 * each function rather than by which screen calls it.
 */
import type { Db } from '@/db/client';
import * as repo from '@/db/repo';
import { applyProfileTransition, type ProfileDraft } from '@/domain/profile';
import type { ProfileStatus, UserRole } from '@/domain/types';

/** Assemble the draft the go-live checklist is evaluated against. */
export async function draftFor(db: Db, entertainerId: string): Promise<ProfileDraft> {
  const e = await repo.getEntertainerById(db, entertainerId);
  if (!e) throw new Error('No such entertainer');
  return {
    stageName: e.stageName,
    shortBio: e.shortBio,
    fullBio: e.fullBio,
    categoryId: e.category ? e.category : null,
    genres: e.genres,
    homeCityId: e.homeCity.id || null,
    videoCount: await repo.countVideos(db, entertainerId),
    rateCardPublished: e.rateCardPublished,
    representationDisclosed: !!e.representationNote,
    isAgencyManaged: !!e.managedByUserId,
  };
}

export async function moveProfile(
  db: Db,
  args: { entertainerId: string; to: ProfileStatus; role: UserRole; note?: string | null },
): Promise<ProfileStatus> {
  const e = await repo.getEntertainerById(db, args.entertainerId);
  if (!e) throw new Error('No such entertainer');

  const outcome = applyProfileTransition({
    from: e.status,
    to: args.to,
    role: args.role,
    draft: await draftFor(db, args.entertainerId),
    note: args.note,
  });

  await db.transaction(async (tx) => {
    await repo.updateEntertainerStatus(tx, args.entertainerId, outcome.status, outcome.note);

    // The entertainer is told the outcome of every admin decision, per the
    // spec's "Profile approved / needs changes" notification.
    if (args.role === 'admin') {
      const titles: Partial<Record<ProfileStatus, string>> = {
        live: 'Your profile is approved and live',
        draft: 'Your profile needs changes before it can go live',
        suspended: 'Your profile has been suspended',
      };
      const title = titles[outcome.status];
      if (title) {
        await repo.notify(tx, {
          userId: e.userId,
          kind: 'profile_review',
          title,
          body: outcome.note ?? '',
          link: '/app/profile',
        });
      }
    }
  });

  return outcome.status;
}

export async function setVerified(db: Db, entertainerId: string, verified: boolean): Promise<void> {
  const e = await repo.getEntertainerById(db, entertainerId);
  if (!e) throw new Error('No such entertainer');
  await db.transaction(async (tx) => {
    await repo.setEntertainerFlags(tx, entertainerId, { verified });
    if (verified) {
      await repo.notify(tx, {
        userId: e.userId,
        kind: 'verified',
        title: 'You are now a verified act on Book the Act',
        body: 'Your identity and business documents checked out.',
        link: '/app/profile',
      });
    }
  });
}

export async function setFeatured(db: Db, entertainerId: string, featured: boolean): Promise<void> {
  await repo.setEntertainerFlags(db, entertainerId, { featured });
}
