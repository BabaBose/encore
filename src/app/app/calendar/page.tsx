/**
 * The entertainer's own calendar.
 *
 * Every date starts available; this is where dates get blocked by hand. Dates
 * held by a confirmed booking appear here too, but cannot be lifted — the
 * booking has to be cancelled to free them, which is what keeps the calendar
 * and the bookings from disagreeing.
 */
import { getDb } from '@/db/client';
import * as repo from '@/db/repo';
import { requireRole } from '@/lib/auth';
import { mayEditProfile } from '@/domain/profile';
import { pageContext } from '@/lib/page-data';
import { Shell } from '@/components/shell';
import { Empty, SectionHead, accentStyle } from '@/components/ui';
import { AvailabilityGrid, CalendarLegend } from '@/components/calendar';
import { BlockForm, BlockList } from '@/components/calendar-editor';
import { today } from '@/domain/dates';

export const dynamic = 'force-dynamic';

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRole('entertainer', 'agency', 'admin');
  const { badges } = await pageContext();
  const sp = await searchParams;
  const db = getDb();

  const actId = typeof sp.act === 'string' ? sp.act : undefined;
  const act = actId ? await repo.getEntertainerById(db, actId) : await repo.getEntertainerForUser(db, user.id);
  // One rule, shared with the actions behind these editors.
  if (!act || !mayEditProfile(user, act)) {
    return (
      <Shell user={user} current="/app/calendar" badges={badges}>
        <div className="page">
          <Empty>No profile on this account.</Empty>
        </div>
      </Shell>
    );
  }

  const now = today();
  const [y, m] = now.split('-').map(Number);
  const bookings = (await repo.listInquiriesForEntertainer(db, act.id)).filter(
    (i) => i.status === 'confirmed' || i.status === 'completed',
  );

  return (
    <Shell user={user} current="/app/calendar" badges={badges}>
      <div className="page" style={accentStyle(act.heroAccent)}>
        <h1 className="display" style={{ marginBottom: 6 }}>
          Calendar
        </h1>
        <p className="lede" style={{ marginBottom: 26 }}>
          Venues see this live. Block what you cannot play — confirmed bookings block themselves.
        </p>

        <div className="split">
          <div className="stack" style={{ gap: 24 }}>
            <section>
              <SectionHead title="Next six months" />
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
                {[0, 1, 2, 3, 4, 5].map((offset) => {
                  const total = m - 1 + offset;
                  const year = y + Math.floor(total / 12);
                  const month = (total % 12) + 1;
                  return (
                    <div key={`${year}-${month}`} className="card">
                      <div className="eyebrow" style={{ marginBottom: 10 }}>
                        {new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-GB', {
                          month: 'long',
                          year: 'numeric',
                          timeZone: 'UTC',
                        })}
                      </div>
                      <AvailabilityGrid
                        blocks={act.blocks}
                        year={year}
                        month={month}
                        specialDates={act.rateCard.specialDates.map((s) => s.date)}
                      />
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 12 }}>
                <CalendarLegend />
              </div>
            </section>

            <section>
              <SectionHead title="What is on the calendar" />
              <BlockList entertainerId={act.id} blocks={act.blocks} bookings={bookings} />
            </section>
          </div>

          <aside className="sticky">
            <div className="panel">
              <div className="panel__head">
                <span className="eyebrow">Block dates</span>
              </div>
              <div className="panel__body">
                <BlockForm entertainerId={act.id} />
              </div>
            </div>
          </aside>
        </div>
      </div>
    </Shell>
  );
}
