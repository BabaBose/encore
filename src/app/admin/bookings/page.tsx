/** Every booking on the platform, for oversight and disputes. */
import Link from 'next/link';
import { getDb } from '@/db/client';
import * as repo from '@/db/repo';
import { requireRole } from '@/lib/auth';
import { pageContext } from '@/lib/page-data';
import { Shell } from '@/components/shell';
import { Empty, SectionHead, StatusPill, accentStyle } from '@/components/ui';
import { formatDate, formatMoney, timeAgo } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function AdminBookingsPage() {
  const user = await requireRole('admin');
  const { badges, money } = await pageContext();
  const db = getDb();
  const inquiries = await repo.listAllInquiries(db);

  // Cancellations after a confirmation are what disputes are usually about.
  const disputes = inquiries.filter((i) => i.status === 'cancelled' && i.cancelReason);

  return (
    <Shell user={user} current="/admin/bookings" badges={badges} money={money}>
      <div className="page">
        <h1 className="display" style={{ marginBottom: 6 }}>
          Bookings
        </h1>
        <p className="lede" style={{ marginBottom: 26 }}>
          Every inquiry and booking on Book the Act, with the reason logged for anything that fell through.
        </p>

        {disputes.length ? (
          <section style={{ marginBottom: 30 }}>
            <SectionHead title="Cancelled" note="reasons are logged at the moment of cancellation" />
            <div className="panel">
              <div className="listing">
                {disputes.map((i) => (
                  <Link key={i.id} href={`/app/inquiries/${i.id}`} className="listing__item">
                    <div className="listing__main">
                      <div className="listing__name">
                        {i.venueName} → {i.entertainerName}
                      </div>
                      <div className="listing__meta">“{i.cancelReason}”</div>
                    </div>
                    <span className="mono dim" style={{ fontSize: 11 }}>
                      {timeAgo(i.updatedAt)}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <section>
          <SectionHead title="All bookings" note={`${inquiries.length} total`} />
          {inquiries.length ? (
            <div className="panel">
              <div className="listing">
                {inquiries.map((i) => (
                  <Link key={i.id} href={`/app/inquiries/${i.id}`} className="listing__item">
                    <div className="avatar art" style={accentStyle(i.entertainerAccent)} />
                    <div className="listing__main">
                      <div className="listing__name">
                        {i.venueName} → {i.entertainerName}
                      </div>
                      <div className="listing__meta">
                        {i.gigType === 'long_term'
                          ? `${i.months}-month residency`
                          : i.startDate
                            ? formatDate(i.startDate)
                            : '—'}{' '}
                        · {formatMoney(i.offerAmount, i.currency)}
                        {i.cityName ? ` · ${i.cityName}` : ''}
                      </div>
                    </div>
                    <StatusPill status={i.status} />
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <Empty>No bookings yet.</Empty>
          )}
        </section>
      </div>
    </Shell>
  );
}
