/**
 * Admin: every listing, in any state, with a way into each one.
 *
 * The review queue only shows what is waiting and what is already live. This
 * is the whole table — including drafts and suspended acts, which is where a
 * support question usually starts.
 */
import Link from 'next/link';
import { getDb } from '@/db/client';
import * as repo from '@/db/repo';
import { requireRole } from '@/lib/auth';
import { pageContext } from '@/lib/page-data';
import { PROFILE_STATUS_LABEL } from '@/domain/profile';
import { Shell } from '@/components/shell';
import { Empty, SectionHead, Stars, accentStyle } from '@/components/ui';
import { FlagToggle, ReviewDecision } from '@/components/admin-forms';
import { formatMoneyShort, timeAgo } from '@/lib/format';
import { startingFromHourly } from '@/domain/rates';
import type { ProfileStatus } from '@/domain/types';

export const dynamic = 'force-dynamic';

const ORDER: ProfileStatus[] = ['pending_review', 'live', 'draft', 'suspended'];

export default async function AdminListingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRole('admin');
  const { badges } = await pageContext();
  const sp = await searchParams;
  const filter = typeof sp.status === 'string' ? sp.status : 'all';

  const all = await repo.allEntertainers(getDb());
  const shown = filter === 'all' ? all : all.filter((a) => a.status === filter);

  return (
    <Shell user={user} current="/admin/listings" badges={badges}>
      <div className="page">
        <h1 className="display" style={{ marginBottom: 6 }}>
          All listings
        </h1>
        <p className="lede" style={{ marginBottom: 20 }}>
          Every act on the platform, whatever state it is in. Edit opens the act&rsquo;s own profile and rate
          editors, so a correction here is the same change they would make themselves.
        </p>

        <div className="row" style={{ marginBottom: 20, flexWrap: 'wrap' }}>
          {(['all', ...ORDER] as const).map((key) => {
            const count = key === 'all' ? all.length : all.filter((a) => a.status === key).length;
            return (
              <Link
                key={key}
                href={key === 'all' ? '/admin/listings' : `/admin/listings?status=${key}`}
                className="btn btn--sm"
                aria-current={filter === key ? 'page' : undefined}
                style={filter === key ? { background: 'var(--wash-strong)', borderColor: 'var(--line)' } : undefined}
              >
                {key === 'all' ? 'All' : PROFILE_STATUS_LABEL[key]} <span className="dim mono">{count}</span>
              </Link>
            );
          })}
        </div>

        <SectionHead title="Listings" note={`${shown.length} shown`} />
        {shown.length ? (
          <div className="stack" style={{ gap: 12 }}>
            {shown.map((act) => (
              <div key={act.id} className="card stack" style={{ gap: 12, ...accentStyle(act.heroAccent) }}>
                <div className="spread" style={{ flexWrap: 'wrap', gap: 12 }}>
                  <div className="row">
                    <div className="avatar art" style={accentStyle(act.heroAccent)} />
                    <div>
                      <Link href={`/entertainers/${act.slug}`} className="listing__name">
                        {act.stageName}
                      </Link>
                      <div className="listing__meta">
                        {act.categoryLabel} · {act.homeCity.name} ·{' '}
                        {act.rateCardPublished
                          ? `from ${formatMoneyShort(startingFromHourly(act.rateCard), act.rateCard.currency)}/hr`
                          : 'no published rates'}
                      </div>
                    </div>
                  </div>
                  <div className="row" style={{ flexWrap: 'wrap' }}>
                    <span className="pill pill--neutral">{PROFILE_STATUS_LABEL[act.status]}</span>
                    <Stars rating={act.rating} count={act.reviewCount} />
                    <span className="mono dim" style={{ fontSize: 11.5 }}>
                      {timeAgo(act.updatedAt)}
                    </span>
                  </div>
                </div>

                <div className="row" style={{ flexWrap: 'wrap' }}>
                  <Link className="btn btn--sm" href={`/app/profile?act=${act.id}`}>
                    Edit profile
                  </Link>
                  <Link className="btn btn--sm" href={`/app/rates?act=${act.id}`}>
                    Edit rates
                  </Link>
                  <Link className="btn btn--sm" href={`/app/calendar?act=${act.id}`}>
                    Calendar
                  </Link>
                  <FlagToggle entertainerId={act.id} flag="verified" value={act.verified} label="Verified" />
                  <FlagToggle entertainerId={act.id} flag="featured" value={act.featured} label="Featured" />
                  <ReviewDecision entertainerId={act.id} status={act.status} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty>No listings in that state.</Empty>
        )}
      </div>
    </Shell>
  );
}
