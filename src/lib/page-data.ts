/**
 * Small helpers page components share: the signed-in user plus the counts the
 * rail badges need, fetched once per render.
 */
import { getDb } from '@/db/client';
import * as repo from '@/db/repo';
import { currentUser, type SessionUser } from '@/lib/auth';

export interface PageContext {
  user: SessionUser | null;
  badges: Record<string, number>;
}

export async function pageContext(): Promise<PageContext> {
  const user = await currentUser();
  if (!user) return { user: null, badges: {} };

  const db = getDb();
  const badges: Record<string, number> = {};
  const unread = await repo.unreadNotificationCount(db, user.id);
  if (unread) badges['/app/notifications'] = unread;

  if (user.role === 'entertainer') {
    const ent = await repo.getEntertainerForUser(db, user.id);
    if (ent) {
      const open = (await repo.listInquiriesForEntertainer(db, ent.id)).filter((i) => i.status === 'new').length;
      if (open) badges['/app/inquiries'] = open;
    }
  } else if (user.role === 'venue') {
    const venue = await repo.getVenueForUser(db, user.id);
    if (venue) {
      const live = (await repo.listInquiriesForVenue(db, venue.id)).filter(
        (i) => !['completed', 'cancelled', 'declined'].includes(i.status),
      ).length;
      if (live) badges['/app/inquiries'] = live;
    }
  } else if (user.role === 'admin') {
    const pending = (await repo.entertainersAwaitingReview(db)).length;
    if (pending) badges['/admin'] = pending;
  }

  return { user, badges };
}
