/**
 * Admin: everything that has happened, newest first.
 *
 * One feed across sign-ups, profiles, inquiries, messages and reviews. The
 * point is to be able to answer "what changed today" without opening five
 * pages, so the filter is a link rather than a control that needs JavaScript.
 */
import Link from 'next/link';
import { getDb } from '@/db/client';
import * as repo from '@/db/repo';
import { requireRole } from '@/lib/auth';
import { pageContext } from '@/lib/page-data';
import { PROFILE_STATUS_LABEL } from '@/domain/profile';
import { STATUS_LABEL as INQUIRY_STATUS_LABEL } from '@/domain/inquiry';
import { Shell } from '@/components/shell';
import { Empty, SectionHead } from '@/components/ui';
import { timeAgo } from '@/lib/format';
import type { InquiryStatus, ProfileStatus } from '@/domain/types';

export const dynamic = 'force-dynamic';

const KINDS = [
  { key: 'all', label: 'Everything' },
  { key: 'signup', label: 'Sign-ups' },
  { key: 'profile', label: 'Profiles' },
  { key: 'inquiry', label: 'Inquiries' },
  { key: 'message', label: 'Messages' },
  { key: 'review', label: 'Reviews' },
] as const;

const ACCENT: Record<repo.ActivityKind, string> = {
  signup: 'var(--green)',
  profile: 'var(--violet)',
  inquiry: 'var(--pink)',
  message: 'var(--blue)',
  review: 'var(--amber)',
};

/** One line of plain English per row, since the shape is deliberately generic. */
function describe(row: repo.ActivityRow): { headline: string; note: string } {
  switch (row.kind) {
    case 'signup':
      return { headline: `${row.actor} signed up as a ${row.subject}`, note: row.detail };
    case 'profile':
      return {
        headline: `${row.actor} - profile ${PROFILE_STATUS_LABEL[row.subject as ProfileStatus] ?? row.subject}`,
        note: row.detail,
      };
    case 'inquiry':
      return {
        headline: `Inquiry ${INQUIRY_STATUS_LABEL[row.subject as InquiryStatus] ?? row.subject} by the ${row.actor}`,
        note: row.detail,
      };
    case 'message':
      return { headline: `${row.actor} (${row.subject}) sent a message`, note: row.detail };
    case 'review':
      return { headline: `${row.actor} left a ${row.subject}-star review`, note: row.detail };
  }
}

export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRole('admin');
  const { badges, money } = await pageContext();
  const sp = await searchParams;
  const kind = typeof sp.kind === 'string' ? sp.kind : 'all';

  const all = await repo.listActivity(getDb(), 200);
  const rows = kind === 'all' ? all : all.filter((r) => r.kind === kind);

  return (
    <Shell user={user} current="/admin/activity" badges={badges} money={money}>
      <div className="page">
        <h1 className="display" style={{ marginBottom: 6 }}>
          Activity
        </h1>
        <p className="lede" style={{ marginBottom: 20 }}>
          Sign-ups, profile changes, inquiries, messages and reviews across the whole platform, newest first.
        </p>

        <div className="row" style={{ marginBottom: 20, flexWrap: 'wrap' }}>
          {KINDS.map((k) => {
            const count = k.key === 'all' ? all.length : all.filter((r) => r.kind === k.key).length;
            return (
              <Link
                key={k.key}
                href={k.key === 'all' ? '/admin/activity' : `/admin/activity?kind=${k.key}`}
                className="btn btn--sm"
                aria-current={kind === k.key ? 'page' : undefined}
                style={kind === k.key ? { background: 'var(--wash-strong)', borderColor: 'var(--line)' } : undefined}
              >
                {k.label} <span className="dim mono">{count}</span>
              </Link>
            );
          })}
        </div>

        <SectionHead title="Feed" note={`${rows.length} of the last ${all.length} events`} />
        {rows.length ? (
          <div className="panel">
            <div className="listing">
              {rows.map((row, i) => {
                const { headline, note } = describe(row);
                const body = (
                  <>
                    <span
                      aria-hidden="true"
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        flex: 'none',
                        background: ACCENT[row.kind],
                      }}
                    />
                    <div className="listing__main">
                      <div className="listing__name">{headline}</div>
                      {note ? <div className="listing__meta">{note}</div> : null}
                    </div>
                    <span className="mono dim" style={{ fontSize: 11.5, minWidth: 96, textAlign: 'right' }}>
                      {timeAgo(row.at)}
                    </span>
                  </>
                );
                return row.href ? (
                  <Link key={`${row.kind}-${row.at}-${i}`} href={row.href} className="listing__item">
                    {body}
                  </Link>
                ) : (
                  <div key={`${row.kind}-${row.at}-${i}`} className="listing__item">
                    {body}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <Empty>Nothing of that kind yet.</Empty>
        )}
      </div>
    </Shell>
  );
}
