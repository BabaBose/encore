/**
 * Admin: who has signed up, and as what.
 *
 * Acts break down by category because that is the question the marketplace
 * actually asks — a hundred singers and no magicians is a supply problem, and
 * a roster count alone never shows it.
 */
import Link from 'next/link';
import { getDb } from '@/db/client';
import * as repo from '@/db/repo';
import { requireRole } from '@/lib/auth';
import { pageContext } from '@/lib/page-data';
import { PROFILE_STATUS_LABEL } from '@/domain/profile';
import { Shell } from '@/components/shell';
import { Empty, SectionHead } from '@/components/ui';
import { formatDate, timeAgo } from '@/lib/format';

export const dynamic = 'force-dynamic';

const ROLE_LABEL: Record<string, string> = {
  entertainer: 'Acts',
  venue: 'Venues',
  agency: 'Agencies and managers',
  admin: 'Staff',
};

/** Signed up within this many days counts as new. */
const NEW_DAYS = 30;

export default async function AdminSignupsPage() {
  const user = await requireRole('admin');
  const { badges } = await pageContext();
  const signups = await repo.listSignups(getDb());

  const cutoff = new Date(Date.now() - NEW_DAYS * 86_400_000).toISOString();
  const recent = signups.filter((s) => s.createdAt >= cutoff);

  const byRole = (rows: repo.SignupRow[]) => {
    const out = new Map<string, number>();
    for (const r of rows) out.set(r.role, (out.get(r.role) ?? 0) + 1);
    return out;
  };
  const rolesAll = byRole(signups);
  const rolesNew = byRole(recent);

  // Acts by category, including the categories nobody has signed up for — an
  // empty row is the useful one.
  const categories = await repo.topCategories(getDb());
  const acts = signups.filter((s) => s.role === 'entertainer');
  const actsNew = recent.filter((s) => s.role === 'entertainer');
  const perCategory = categories.map((c) => ({
    label: c.label,
    slug: c.slug,
    total: acts.filter((a) => a.categorySlug === c.slug).length,
    recent: actsNew.filter((a) => a.categorySlug === c.slug).length,
    live: acts.filter((a) => a.categorySlug === c.slug && a.actStatus === 'live').length,
  }));
  const uncategorised = acts.filter((a) => !a.categorySlug).length;

  return (
    <Shell user={user} current="/admin/signups" badges={badges}>
      <div className="page">
        <h1 className="display" style={{ marginBottom: 6 }}>
          Sign-ups
        </h1>
        <p className="lede" style={{ marginBottom: 26 }}>
          Every account on Book the Act, and what each one joined as. &ldquo;New&rdquo; means the last {NEW_DAYS} days.
        </p>

        <section style={{ marginBottom: 32 }}>
          <SectionHead title="By role" note={`${signups.length} accounts · ${recent.length} new`} />
          <div className="grid grid--cards">
            {(['entertainer', 'venue', 'agency', 'admin'] as const).map((role) => (
              <div key={role} className="card">
                <div className="eyebrow" style={{ marginBottom: 6 }}>
                  {ROLE_LABEL[role]}
                </div>
                <div style={{ font: '800 30px/1 var(--font-sans)', letterSpacing: '-0.03em' }}>
                  {rolesAll.get(role) ?? 0}
                </div>
                <div className="dim" style={{ fontSize: 12, marginTop: 6 }}>
                  {rolesNew.get(role) ?? 0} in the last {NEW_DAYS} days
                </div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ marginBottom: 32 }}>
          <SectionHead title="Acts by category" note="live is what a venue can actually find" />
          <div className="panel">
            <div className="listing">
              {perCategory.map((c) => (
                <div key={c.slug} className="listing__item">
                  <div className="listing__main">
                    <div className="listing__name">{c.label}</div>
                    <div className="listing__meta">
                      {c.live} live of {c.total}
                    </div>
                  </div>
                  <span className="mono dim" style={{ fontSize: 12 }}>
                    {c.recent ? `+${c.recent} new` : '—'}
                  </span>
                  <span style={{ font: '700 18px var(--font-sans)', minWidth: 32, textAlign: 'right' }}>
                    {c.total}
                  </span>
                </div>
              ))}
              {uncategorised ? (
                <div className="listing__item">
                  <div className="listing__main">
                    <div className="listing__name">No category set</div>
                    <div className="listing__meta">these cannot be found by a category search</div>
                  </div>
                  <span style={{ font: '700 18px var(--font-sans)', minWidth: 32, textAlign: 'right' }}>
                    {uncategorised}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section>
          <SectionHead title="Newest accounts" note={`${Math.min(signups.length, 60)} shown`} />
          {signups.length ? (
            <div className="panel">
              <div className="listing">
                {signups.slice(0, 60).map((s) => (
                  <div key={s.userId} className="listing__item">
                    <div className="listing__main">
                      <div className="listing__name">
                        {s.actSlug ? (
                          <Link href={`/entertainers/${s.actSlug}`}>{s.displayName}</Link>
                        ) : (
                          s.displayName
                        )}
                      </div>
                      <div className="listing__meta">
                        {s.email}
                        {s.cityName ? ` · ${s.cityName}` : ''}
                      </div>
                    </div>
                    <span className="pill pill--neutral">{ROLE_LABEL[s.role] ?? s.role}</span>
                    <span className="dim" style={{ fontSize: 12, minWidth: 130 }}>
                      {s.categoryLabel ?? s.venueType ?? '—'}
                      {s.actStatus ? ` · ${PROFILE_STATUS_LABEL[s.actStatus]}` : ''}
                    </span>
                    <span className="mono dim" style={{ fontSize: 11.5, minWidth: 110, textAlign: 'right' }}>
                      {timeAgo(s.createdAt)}
                      <span className="visually-hidden"> — {formatDate(s.createdAt.slice(0, 10))}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <Empty>Nobody has signed up yet.</Empty>
          )}
        </section>
      </div>
    </Shell>
  );
}
