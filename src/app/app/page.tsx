/**
 * The signed-in landing page. Each role gets the workspace the designs give
 * it: an entertainer sees their calendar, rate grid and incoming queue; an
 * agency sees its roster; a venue belongs on the discovery side, so it is sent
 * to its shortlists.
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import * as repo from '@/db/repo';
import { goLiveRequirements } from '@/domain/profile';
import { draftFor } from '@/services/profile';
import { today } from '@/domain/dates';
import { pageContext } from '@/lib/page-data';
import type { MoneyView } from '@/components/money';
import { requireUser } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { Empty, SectionHead, StatusPill, Stars, accentStyle } from '@/components/ui';
import { AvailabilityGrid, CalendarLegend } from '@/components/calendar';
import { RateGrid } from '@/components/rate-table';
import { formatDate, formatMoney } from '@/lib/format';
import { PROFILE_STATUS_LABEL } from '@/domain/profile';

export const dynamic = 'force-dynamic';

export default async function AppHome() {
  const user = await requireUser();
  if (user.role === 'venue') redirect('/app/shortlists');
  if (user.role === 'admin') redirect('/admin');

  const { badges, money } = await pageContext();
  const db = getDb();

  if (user.role === 'agency') return <AgencyRoster userId={user.id} badges={badges} money={money} user={user} />;

  const act = await repo.getEntertainerForUser(db, user.id);
  if (!act) {
    return (
      <Shell user={user} current="/app" badges={badges} money={money}>
        <div className="page">
          <Empty>No entertainer profile on this account yet.</Empty>
        </div>
      </Shell>
    );
  }

  const inquiries = await repo.listInquiriesForEntertainer(db, act.id);
  const incoming = inquiries.filter((i) => ['new', 'viewed', 'countered'].includes(i.status));
  const upcoming = inquiries
    .filter((i) => i.status === 'confirmed' && i.startDate && i.startDate >= today())
    .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''));
  const requirements = goLiveRequirements(await draftFor(db, act.id));
  const unmet = requirements.filter((r) => !r.met);

  const now = today();
  const [y, m] = now.split('-').map(Number);
  const subscription = await repo.getSubscription(db, user.id);

  return (
    <Shell user={user} current="/app" badges={badges} money={money}>
      <div className="page" style={accentStyle(act.heroAccent)}>
        <div className="spread" style={{ marginBottom: 24 }}>
          <div>
            <div className="eyebrow">Entertainer workspace</div>
            <h1 className="display" style={{ marginTop: 4 }}>
              {act.stageName}
            </h1>
          </div>
          <div className="row row--tight">
            <span className={`pill pill--${act.status === 'live' ? 'positive' : act.status === 'suspended' ? 'negative' : 'neutral'}`}>
              {PROFILE_STATUS_LABEL[act.status]}
            </span>
            {act.verified ? <span className="pill pill--positive">Verified</span> : null}
            <Stars rating={act.rating} count={act.reviewCount} />
          </div>
        </div>

        {act.status !== 'live' ? (
          <div className="notice" style={{ marginBottom: 22 }}>
            {act.status === 'draft' ? (
              unmet.length ? (
                <>
                  <strong>{unmet.length} thing{unmet.length === 1 ? '' : 's'} left</strong> before you can go to
                  review: {unmet.map((r) => r.label).join(', ')}.{' '}
                  <Link href="/app/profile" style={{ textDecoration: 'underline' }}>
                    Finish your profile
                  </Link>
                </>
              ) : (
                <>
                  Your profile is ready.{' '}
                  <Link href="/app/profile" style={{ textDecoration: 'underline' }}>
                    Send it to Book the Act for review
                  </Link>
                </>
              )
            ) : act.status === 'pending_review' ? (
              <>We are reviewing your profile. You will get a notification either way.</>
            ) : (
              <>
                Your profile is suspended.{act.reviewNote ? ` Our note: “${act.reviewNote}”` : ''}
              </>
            )}
          </div>
        ) : null}

        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', marginBottom: 28 }}>
          <section className="panel">
            <div className="panel__head spread">
              <span className="eyebrow">Incoming</span>
              <Link className="btn btn--sm btn--ghost" href="/app/inquiries">
                All inquiries
              </Link>
            </div>
            {incoming.length ? (
              <div className="listing">
                {incoming.slice(0, 5).map((i) => (
                  <Link key={i.id} href={`/app/inquiries/${i.id}`} className="listing__item">
                    <div className="listing__main">
                      <div className="listing__name">{i.venueName}</div>
                      <div className="listing__meta">
                        {i.gigType === 'long_term'
                          ? `${i.months}-month residency`
                          : i.startDate
                            ? formatDate(i.startDate)
                            : ''}{' '}
                        · {formatMoney(i.offerAmount, i.currency)}
                      </div>
                    </div>
                    <StatusPill status={i.status} />
                  </Link>
                ))}
              </div>
            ) : (
              <Empty>Nothing waiting on you.</Empty>
            )}
          </section>

          <section className="panel">
            <div className="panel__head">
              <span className="eyebrow">Confirmed and coming up</span>
            </div>
            {upcoming.length ? (
              <div className="listing">
                {upcoming.slice(0, 5).map((i) => (
                  <Link key={i.id} href={`/app/inquiries/${i.id}`} className="listing__item">
                    <div className="listing__main">
                      <div className="listing__name">{i.venueName}</div>
                      <div className="listing__meta">
                        {i.startDate ? formatDate(i.startDate) : ''} · {i.eventType ?? 'Booking'}
                      </div>
                    </div>
                    <span className="mono dim" style={{ fontSize: 11.5 }}>
                      {formatMoney(i.offerAmount, i.currency)}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <Empty>No confirmed dates ahead.</Empty>
            )}
          </section>
        </div>

        <section style={{ marginBottom: 28 }}>
          <SectionHead
            title="Your calendar"
            note="A confirmed booking blocks itself — you never re-enter a date"
            action={
              <Link className="btn btn--sm" href="/app/calendar">
                Manage
              </Link>
            }
          />
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))' }}>
            {[0, 1, 2].map((offset) => {
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

        <section style={{ marginBottom: 28 }}>
          <SectionHead
            title="Rate rules"
            note="Day of week × time of day"
            action={
              <Link className="btn btn--sm" href="/app/rates">
                Edit rates
              </Link>
            }
          />
          <div className="card scroll-x">
            <RateGrid card={act.rateCard} />
          </div>
        </section>

        {subscription ? (
          <section>
            <SectionHead title="Subscription" note="Book the Act takes no commission on your bookings" />
            <div className="card spread">
              <div>
                <div className="subtitle" style={{ textTransform: 'capitalize' }}>
                  {subscription.plan} plan
                </div>
                <div className="dim" style={{ fontSize: 12.5 }}>
                  {subscription.renewsAt ? `Renews ${formatDate(subscription.renewsAt)}` : 'Free trial'}
                </div>
              </div>
              <span
                className={`pill pill--${subscription.status === 'active' ? 'positive' : subscription.status === 'past_due' ? 'negative' : 'neutral'}`}
              >
                {subscription.status.replace('_', ' ')}
              </span>
            </div>
          </section>
        ) : null}
      </div>
    </Shell>
  );
}

/** An agency sees every act it represents, with each one's state at a glance. */
async function AgencyRoster({
  userId,
  badges,
  money,
  user,
}: {
  userId: string;
  badges: Record<string, number>;
  money: MoneyView;
  user: Awaited<ReturnType<typeof requireUser>>;
}) {
  const db = getDb();
  const roster = await repo.getEntertainersManagedBy(db, userId);
  // How many of each act's inquiries are still waiting on a reply, gathered
  // before render rather than per row inside it.
  const openByAct = new Map(
    await Promise.all(
      roster.map(async (act) => {
        const inquiries = await repo.listInquiriesForEntertainer(db, act.id);
        return [act.id, inquiries.filter((i) => ['new', 'viewed', 'countered'].includes(i.status)).length] as const;
      }),
    ),
  );

  return (
    <Shell user={user} current="/app" badges={badges} money={money}>
      <div className="page">
        <div className="eyebrow">Agency workspace</div>
        <h1 className="display" style={{ margin: '4px 0 6px' }}>
          Your roster
        </h1>
        <p className="lede" style={{ marginBottom: 24 }}>
          Every act you represent carries a visible “represented act” note on its profile, so venues always know
          who they are dealing with.
        </p>

        {roster.length ? (
          <div className="panel">
            <div className="listing">
              {roster.map((act) => {
                const open = openByAct.get(act.id) ?? 0;
                return (
                  <div key={act.id} className="listing__item" style={accentStyle(act.heroAccent)}>
                    <div className="avatar art" style={accentStyle(act.heroAccent)} />
                    <div className="listing__main">
                      <div className="listing__name">{act.stageName}</div>
                      <div className="listing__meta">
                        {act.categoryLabel} · {act.homeCity.name} ·{' '}
                        {open ? `${open} waiting on a reply` : 'nothing outstanding'}
                      </div>
                    </div>
                    <span className={`pill pill--${act.status === 'live' ? 'positive' : 'neutral'}`}>
                      {PROFILE_STATUS_LABEL[act.status]}
                    </span>
                    <Link className="btn btn--sm" href={`/app/profile?act=${act.id}`}>
                      Manage
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <Empty>
            No acts on your roster yet. We link an act to your agency when it is set up — get in touch and we
            will attach them.
          </Empty>
        )}
      </div>
    </Shell>
  );
}
