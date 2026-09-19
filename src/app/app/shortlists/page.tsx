/**
 * A venue's shortlists — named collections, so several acts considered for the
 * same gig stay together rather than becoming one undifferentiated favourites
 * list.
 */
import Link from 'next/link';
import { getDb } from '@/db/client';
import * as repo from '@/db/repo';
import { requireRole } from '@/lib/auth';
import { pageContext } from '@/lib/page-data';
import { startingFromHourly } from '@/domain/rates';
import { Shell } from '@/components/shell';
import { ActCard, Empty, SectionHead } from '@/components/ui';
import { NewShortlistForm } from '@/components/shortlist-forms';

export const dynamic = 'force-dynamic';

export default async function ShortlistsPage() {
  const user = await requireRole('venue');
  const { badges } = await pageContext();
  const db = getDb();
  const venue = repo.getVenueForUser(db, user.id);
  const lists = venue ? repo.listShortlists(db, venue.id) : [];

  return (
    <Shell user={user} current="/app/shortlists" badges={badges}>
      <div className="page">
        <div className="spread" style={{ marginBottom: 6 }}>
          <h1 className="display">Shortlists</h1>
          <Link className="btn btn--sm" href="/search">
            Find more acts
          </Link>
        </div>
        <p className="lede" style={{ marginBottom: 26 }}>
          Group the acts you are weighing up for the same night, so comparing three rooftop singers does not mean
          scrolling one long list of favourites.
        </p>

        <div className="split">
          <div className="stack" style={{ gap: 30 }}>
            {lists.length === 0 ? (
              <Empty>
                No collections yet. Save an act from its profile, or start one on the right.
              </Empty>
            ) : (
              lists.map((list) => {
                const acts = list.entertainerIds
                  .map((id) => repo.getEntertainerById(db, id))
                  .filter((a): a is NonNullable<typeof a> => !!a);
                return (
                  <section key={list.id}>
                    <SectionHead
                      title={list.name}
                      note={`${list.itemCount} saved${list.note ? ` · ${list.note}` : ''}`}
                    />
                    {acts.length ? (
                      <div className="grid grid--cards">
                        {acts.map((a) => (
                          <ActCard
                            key={a.id}
                            slug={a.slug}
                            name={a.stageName}
                            accent={a.heroAccent}
                            categoryLabel={a.categoryLabel}
                            genreLabels={a.genreLabels}
                            cityName={a.homeCity.name}
                            priceFrom={startingFromHourly(a.rateCard)}
                            priceUnit="hour"
                            currency={a.rateCard.currency}
                            rating={a.rating}
                            reviewCount={a.reviewCount}
                            verified={a.verified}
                          />
                        ))}
                      </div>
                    ) : (
                      <Empty>Nothing in this collection yet.</Empty>
                    )}
                  </section>
                );
              })
            )}
          </div>

          <aside className="sticky">
            <div className="panel">
              <div className="panel__head">
                <span className="eyebrow">New collection</span>
              </div>
              <div className="panel__body">
                <NewShortlistForm />
              </div>
            </div>
          </aside>
        </div>
      </div>
    </Shell>
  );
}
