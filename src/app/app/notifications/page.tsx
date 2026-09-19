/**
 * In-app notifications. The spec also calls for email and, later, push; those
 * would be additional deliveries of the same rows, which is why every
 * notification is persisted here rather than being fired and forgotten.
 */
import Link from 'next/link';
import { getDb } from '@/db/client';
import * as repo from '@/db/repo';
import { requireUser } from '@/lib/auth';
import { pageContext } from '@/lib/page-data';
import { markNotificationsReadAction } from '@/app/actions';
import { Shell } from '@/components/shell';
import { Empty } from '@/components/ui';
import { timeAgo } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const user = await requireUser();
  const { badges } = await pageContext();
  const db = getDb();
  const notifications = repo.listNotifications(db, user.id);
  const unread = notifications.filter((n) => !n.readAt).length;

  return (
    <Shell user={user} current="/app/notifications" badges={badges}>
      <div className="page" style={{ maxWidth: 720 }}>
        <div className="spread" style={{ marginBottom: 6 }}>
          <h1 className="display">Activity</h1>
          {unread ? (
            <form action={markNotificationsReadAction}>
              <button className="btn btn--sm" type="submit">
                Mark all read
              </button>
            </form>
          ) : null}
        </div>
        <p className="lede" style={{ marginBottom: 24 }}>
          Inquiries, replies, confirmations and reviews — everything Encore would also email you about.
        </p>

        {notifications.length === 0 ? (
          <Empty>Nothing yet.</Empty>
        ) : (
          <div className="panel">
            <div className="listing">
              {notifications.map((n) => {
                const body = (
                  <>
                    <div className="listing__main">
                      <div className="listing__name">{n.title}</div>
                      {n.body ? <div className="listing__meta">{n.body}</div> : null}
                    </div>
                    {!n.readAt ? <span className="pill pill--accent">New</span> : null}
                    <span className="mono dim" style={{ fontSize: 11 }}>
                      {timeAgo(n.createdAt)}
                    </span>
                  </>
                );
                return n.link ? (
                  <Link key={n.id} href={n.link} className="listing__item">
                    {body}
                  </Link>
                ) : (
                  <div key={n.id} className="listing__item">
                    {body}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
