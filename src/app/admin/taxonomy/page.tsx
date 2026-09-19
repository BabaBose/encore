/**
 * The category and genre taxonomy used across search and profiles, plus the
 * cities searches are matched against.
 */
import { getDb } from '@/db/client';
import * as repo from '@/db/repo';
import { requireRole } from '@/lib/auth';
import { pageContext } from '@/lib/page-data';
import { Shell } from '@/components/shell';
import { Chip, SectionHead, accentStyle } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function TaxonomyPage() {
  const user = await requireRole('admin');
  const { badges } = await pageContext();
  const db = getDb();
  const categories = repo.topCategories(db);
  const cities = repo.listCities(db);
  const acts = repo.allEntertainers(db);

  return (
    <Shell user={user} current="/admin/taxonomy" badges={badges}>
      <div className="page" style={{ maxWidth: 900 }}>
        <h1 className="display" style={{ marginBottom: 6 }}>
          Taxonomy
        </h1>
        <p className="lede" style={{ marginBottom: 26 }}>
          Categories, genre tags and cities. Every act picks one category and any number of genres within it;
          search filters on both.
        </p>

        <section style={{ marginBottom: 30 }}>
          <SectionHead title="Categories and genres" />
          <div className="stack" style={{ gap: 12 }}>
            {categories.map((cat) => {
              const genres = repo.genresFor(db, cat.id);
              const count = acts.filter((a) => a.category === cat.slug).length;
              return (
                <div key={cat.id} className="card" style={accentStyle(cat.accent ?? 'var(--pink)')}>
                  <div className="spread" style={{ marginBottom: 10 }}>
                    <span className="subtitle">{cat.label}</span>
                    <span className="mono dim" style={{ fontSize: 11.5 }}>
                      {count} act{count === 1 ? '' : 's'} · {genres.length} genres
                    </span>
                  </div>
                  <div className="row row--tight">
                    {genres.map((g) => (
                      <Chip key={g.id}>{g.label}</Chip>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <SectionHead title="Cities" note="distances drive the travel-radius match" />
          <div className="panel">
            <div className="listing">
              {cities.map((c) => (
                <div key={c.id} className="listing__item">
                  <div className="listing__main">
                    <div className="listing__name">{c.name}</div>
                    <div className="listing__meta">
                      {c.country} · {c.lat.toFixed(3)}, {c.lng.toFixed(3)}
                    </div>
                  </div>
                  <span className="mono dim" style={{ fontSize: 11.5 }}>
                    {acts.filter((a) => a.homeCity.id === c.id).length} based here
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </Shell>
  );
}
