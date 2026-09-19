/**
 * Admin: the review queue.
 *
 * Book the Act approves, rejects, suspends, verifies and promotes. It does not author
 * a profile — everything on one belongs to the act.
 */
import Link from 'next/link';
import { getDb } from '@/db/client';
import * as repo from '@/db/repo';
import { requireRole } from '@/lib/auth';
import { pageContext } from '@/lib/page-data';
import { goLiveRequirements, PROFILE_STATUS_LABEL } from '@/domain/profile';
import { draftFor } from '@/services/profile';
import { Shell } from '@/components/shell';
import { Empty, SectionHead, Stars, accentStyle } from '@/components/ui';
import { FlagToggle, ReviewDecision } from '@/components/admin-forms';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const user = await requireRole('admin');
  const { badges, money } = await pageContext();
  const db = getDb();

  const pending = await repo.entertainersAwaitingReview(db);
  const all = await repo.allEntertainers(db);
  const live = all.filter((a) => a.status === 'live');

  // Everything the queue needs about each waiting profile, gathered up front.
  const queue = await Promise.all(
    pending.map(async (act) => ({
      act,
      requirements: goLiveRequirements(await draftFor(db, act.id)),
      videos: await repo.listMedia(db, act.id, 'video'),
    })),
  );

  return (
    <Shell user={user} current="/admin" badges={badges} money={money}>
      <div className="page">
        <h1 className="display" style={{ marginBottom: 6 }}>
          Review queue
        </h1>
        <p className="lede" style={{ marginBottom: 26 }}>
          New profiles wait here before a venue can find them. Approving publishes; requesting changes sends it
          back to draft with your note attached.
        </p>

        <section style={{ marginBottom: 32 }}>
          <SectionHead title="Waiting on review" note={`${pending.length} profile${pending.length === 1 ? '' : 's'}`} />
          {pending.length ? (
            <div className="stack" style={{ gap: 14 }}>
              {queue.map(({ act, requirements, videos }) => {
                const unmet = requirements.filter((r) => !r.met);
                return (
                  <div key={act.id} className="card stack" style={{ gap: 14, ...accentStyle(act.heroAccent) }}>
                    <div className="spread">
                      <div className="row">
                        <div className="avatar art" style={accentStyle(act.heroAccent)} />
                        <div>
                          <Link href={`/entertainers/${act.slug}`} className="subtitle">
                            {act.stageName}
                          </Link>
                          <div className="dim" style={{ fontSize: 12.5 }}>
                            {act.categoryLabel} · {act.homeCity.name} · {act.genreLabels.join(', ')}
                          </div>
                        </div>
                      </div>
                      <span className="pill pill--neutral">{PROFILE_STATUS_LABEL[act.status]}</span>
                    </div>

                    <p className="muted" style={{ fontSize: 13 }}>
                      {act.shortBio}
                    </p>

                    <div className="row row--tight">
                      <span className="chip chip--mono">{videos.length} video</span>
                      <span className="chip chip--mono">
                        {act.rateCardPublished ? 'rates published' : 'no rates'}
                      </span>
                      {act.managedByUserId ? <span className="chip chip--accent">agency managed</span> : null}
                      {unmet.length ? (
                        <span className="chip" style={{ color: 'var(--red)' }}>
                          {unmet.length} requirement{unmet.length === 1 ? '' : 's'} unmet
                        </span>
                      ) : null}
                    </div>

                    <ReviewDecision entertainerId={act.id} status={act.status} />
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty>Queue is clear.</Empty>
          )}
        </section>

        <section>
          <SectionHead title="Live profiles" note="verify identity, or promote to the homepage" />
          <div className="panel">
            <div className="listing">
              {live.map((act) => (
                <div key={act.id} className="listing__item" style={accentStyle(act.heroAccent)}>
                  <div className="avatar art" style={accentStyle(act.heroAccent)} />
                  <div className="listing__main">
                    <Link href={`/entertainers/${act.slug}`} className="listing__name">
                      {act.stageName}
                    </Link>
                    <div className="listing__meta">
                      {act.categoryLabel} · {act.homeCity.name}
                    </div>
                  </div>
                  <Stars rating={act.rating} count={act.reviewCount} />
                  <FlagToggle entertainerId={act.id} flag="verified" value={act.verified} label="Verified" />
                  <FlagToggle entertainerId={act.id} flag="featured" value={act.featured} label="Featured" />
                  <ReviewDecision entertainerId={act.id} status={act.status} />
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </Shell>
  );
}
