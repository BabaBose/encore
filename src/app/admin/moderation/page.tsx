/**
 * Moderation: self-submitted references and any media held back for a check.
 * Verified reviews are not moderated here — they come from completed bookings
 * and stand on their own.
 */
import { getDb } from '@/db/client';
import * as repo from '@/db/repo';
import { requireRole } from '@/lib/auth';
import { pageContext } from '@/lib/page-data';
import { Shell } from '@/components/shell';
import { Empty, SectionHead } from '@/components/ui';
import { ModerationDecision } from '@/components/admin-forms';
import { formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function ModerationPage() {
  const user = await requireRole('admin');
  const { badges } = await pageContext();
  const db = getDb();

  const references = repo.referencesAwaitingModeration(db);
  const pendingMedia = repo
    .allEntertainers(db)
    .flatMap((act) =>
      repo.listMedia(db, act.id).filter((m) => m.moderation === 'pending').map((m) => ({ ...m, act })),
    );

  return (
    <Shell user={user} current="/admin/moderation" badges={badges}>
      <div className="page" style={{ maxWidth: 860 }}>
        <h1 className="display" style={{ marginBottom: 6 }}>
          Moderation
        </h1>
        <p className="lede" style={{ marginBottom: 26 }}>
          References an act has added itself are checked before a venue sees them, so a quote on a profile has at
          least been looked at.
        </p>

        <section style={{ marginBottom: 30 }}>
          <SectionHead title="References" note={`${references.length} waiting`} />
          {references.length ? (
            <div className="stack" style={{ gap: 12 }}>
              {references.map((r) => (
                <div key={r.id} className="card stack" style={{ gap: 10 }}>
                  <div className="eyebrow">{r.entertainerName}</div>
                  <p style={{ fontStyle: 'italic' }}>“{r.quote}”</p>
                  <div className="dim" style={{ fontSize: 12.5 }}>
                    {r.clientName}
                    {r.gigDate ? ` · ${formatDate(r.gigDate)}` : ''}
                  </div>
                  <ModerationDecision target="reference" id={r.id} />
                </div>
              ))}
            </div>
          ) : (
            <Empty>Nothing waiting.</Empty>
          )}
        </section>

        <section>
          <SectionHead title="Media" note={`${pendingMedia.length} waiting`} />
          {pendingMedia.length ? (
            <div className="panel">
              <div className="listing">
                {pendingMedia.map((m) => (
                  <div key={m.id} className="listing__item">
                    <div className="listing__main">
                      <div className="listing__name">{m.act.stageName}</div>
                      <div className="listing__meta">{m.url}</div>
                    </div>
                    <ModerationDecision target="media" id={m.id} />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <Empty>Nothing waiting.</Empty>
          )}
        </section>
      </div>
    </Shell>
  );
}
