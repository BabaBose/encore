/**
 * The inquiry pipeline. The same list serves both sides — a venue sees who it
 * has approached, an entertainer sees who has approached them — because the
 * states, and therefore the columns, are identical.
 */
import Link from 'next/link';
import { getDb } from '@/db/client';
import * as repo from '@/db/repo';
import { requireUser } from '@/lib/auth';
import { pageContext } from '@/lib/page-data';
import { Shell } from '@/components/shell';
import { Empty, StatusPill, accentStyle } from '@/components/ui';
import { formatDate, formatMoney, timeAgo } from '@/lib/format';
import type { InquiryRow } from '@/db/repo';
import type { InquiryStatus } from '@/domain/types';

export const dynamic = 'force-dynamic';

const GROUPS: Array<{ title: string; note: string; statuses: InquiryStatus[] }> = [
  { title: 'Waiting on a reply', note: 'sent, seen, or countered', statuses: ['new', 'viewed', 'countered', 'accepted'] },
  { title: 'Confirmed', note: 'dates are held', statuses: ['confirmed'] },
  { title: 'Done', note: 'completed, declined or cancelled', statuses: ['completed', 'declined', 'cancelled'] },
];

function when(i: InquiryRow): string {
  if (i.gigType === 'long_term') {
    return `${i.months}-month residency${i.startDate ? ` from ${formatDate(i.startDate)}` : ''}`;
  }
  if (!i.startDate) return '—';
  return i.endDate && i.endDate !== i.startDate
    ? `${formatDate(i.startDate)} – ${formatDate(i.endDate)}`
    : formatDate(i.startDate);
}

export default async function InquiriesPage() {
  const user = await requireUser();
  const { badges } = await pageContext();
  const db = getDb();

  let inquiries: InquiryRow[] = [];
  if (user.role === 'venue') {
    const venue = await repo.getVenueForUser(db, user.id);
    inquiries = venue ? await repo.listInquiriesForVenue(db, venue.id) : [];
  } else if (user.role === 'entertainer') {
    const act = await repo.getEntertainerForUser(db, user.id);
    inquiries = act ? await repo.listInquiriesForEntertainer(db, act.id) : [];
  } else if (user.role === 'agency') {
    const roster = await repo.getEntertainersManagedBy(db, user.id);
    const perAct = await Promise.all(roster.map((act) => repo.listInquiriesForEntertainer(db, act.id)));
    inquiries = perAct.flat();
  } else {
    inquiries = await repo.listAllInquiries(db);
  }

  const counterpart = (i: InquiryRow) => (user.role === 'venue' ? i.entertainerName : i.venueName);

  // Unread counts for the whole page in one pass, so the markup does no I/O.
  const unreadByInquiry = new Map(
    await Promise.all(
      inquiries.map(async (i) => [i.id, await repo.unreadCount(db, i.id, user.id)] as const),
    ),
  );

  return (
    <Shell user={user} current="/app/inquiries" badges={badges}>
      <div className="page">
        <h1 className="display" style={{ marginBottom: 6 }}>
          Inquiries
        </h1>
        <p className="lede" style={{ marginBottom: 26 }}>
          Every negotiation stays here — date, price and thread in one place, so nothing moves to email and gets
          lost.
        </p>

        {inquiries.length === 0 ? (
          <Empty>
            Nothing yet.{' '}
            {user.role === 'venue' ? (
              <Link href="/search" style={{ textDecoration: 'underline' }}>
                Find an act
              </Link>
            ) : (
              'Inquiries from venues will land here.'
            )}
          </Empty>
        ) : (
          <div className="stack" style={{ gap: 26 }}>
            {GROUPS.map((group) => {
              const rows = inquiries.filter((i) => group.statuses.includes(i.status));
              if (!rows.length) return null;
              return (
                <section key={group.title} className="panel">
                  <div className="panel__head">
                    <span className="eyebrow">{group.title}</span>
                    <span className="dim" style={{ fontSize: 12 }}>
                      {group.note}
                    </span>
                    <span className="mono dim" style={{ marginLeft: 'auto', fontSize: 11.5 }}>
                      {rows.length}
                    </span>
                  </div>
                  <div className="listing">
                    {rows.map((i) => {
                      const unread = unreadByInquiry.get(i.id) ?? 0;
                      return (
                        <Link
                          key={i.id}
                          href={`/app/inquiries/${i.id}`}
                          className="listing__item"
                          style={accentStyle(i.entertainerAccent)}
                        >
                          <div className="avatar art" style={accentStyle(i.entertainerAccent)} />
                          <div className="listing__main">
                            <div className="listing__name">
                              {counterpart(i)}
                              {unread ? (
                                <span className="pill pill--accent" style={{ marginLeft: 8 }}>
                                  {unread} new
                                </span>
                              ) : null}
                            </div>
                            <div className="listing__meta">
                              {when(i)} · {formatMoney(i.offerAmount, i.currency)}
                              {i.eventType ? ` · ${i.eventType}` : ''}
                            </div>
                          </div>
                          <span className="mono dim" style={{ fontSize: 11 }}>
                            {timeAgo(i.updatedAt)}
                          </span>
                          <StatusPill status={i.status} />
                        </Link>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </Shell>
  );
}
