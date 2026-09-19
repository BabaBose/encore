/**
 * The entertainer's profile panel. Everything a venue reads is authored here;
 * Encore only reviews it.
 */
import { getDb } from '@/db/client';
import * as repo from '@/db/repo';
import { requireRole } from '@/lib/auth';
import { pageContext } from '@/lib/page-data';
import { goLiveRequirements, PROFILE_STATUS_LABEL } from '@/domain/profile';
import { draftFor } from '@/services/profile';
import { Shell } from '@/components/shell';
import { Empty, accentStyle } from '@/components/ui';
import { GoLiveChecklist, MediaEditor, ProfileForm, ReferenceEditor } from '@/components/profile-editor';

export const dynamic = 'force-dynamic';

export default async function ProfileEditorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRole('entertainer', 'agency');
  const { badges } = await pageContext();
  const sp = await searchParams;
  const db = getDb();

  const actId = typeof sp.act === 'string' ? sp.act : undefined;
  const act = actId ? repo.getEntertainerById(db, actId) : repo.getEntertainerForUser(db, user.id);
  if (!act || (act.userId !== user.id && act.managedByUserId !== user.id)) {
    return (
      <Shell user={user} current="/app/profile" badges={badges}>
        <div className="page">
          <Empty>No profile on this account.</Empty>
        </div>
      </Shell>
    );
  }

  const categories = repo.topCategories(db);
  const genres = repo.listCategories(db).filter((c) => c.parentId !== null);
  const cities = repo.listCities(db);
  const requirements = goLiveRequirements(draftFor(db, act.id));
  const videos = repo.listMedia(db, act.id, 'video');
  const references = repo.listReferences(db, act.id, false);
  const awards = repo.listAwards(db, act.id);

  return (
    <Shell user={user} current="/app/profile" badges={badges}>
      <div className="page" style={accentStyle(act.heroAccent)}>
        <div className="spread" style={{ marginBottom: 6 }}>
          <h1 className="display">Profile</h1>
          <span
            className={`pill pill--${act.status === 'live' ? 'positive' : act.status === 'suspended' ? 'negative' : 'neutral'}`}
          >
            {PROFILE_STATUS_LABEL[act.status]}
          </span>
        </div>
        <p className="lede" style={{ marginBottom: 26 }}>
          You write all of this. Encore reviews it once before it goes live, then again only if something is
          reported.
        </p>

        <div className="split">
          <div className="stack" style={{ gap: 24 }}>
            <ProfileForm
              act={{
                id: act.id,
                stageName: act.stageName,
                realName: act.realName,
                shortBio: act.shortBio,
                fullBio: act.fullBio,
                categorySlug: act.category,
                genreSlugs: act.genres,
                homeCityId: act.homeCity.id,
                countryOfOrigin: act.countryOfOrigin,
                teamSize: act.teamSize,
                languages: act.languages,
                equipmentProvided: act.equipmentProvided,
                equipmentRequired: act.equipmentRequired,
                travelRadiusKm: act.travelRadiusKm,
                acceptsShortTerm: act.acceptsShortTerm,
                acceptsLongTerm: act.acceptsLongTerm,
                openToRelocate: act.openToRelocate,
                contractLengths: act.contractLengths,
                representationNote: act.representationNote,
                isManaged: !!act.managedByUserId,
              }}
              categories={categories}
              genres={genres}
              cities={cities}
            />
            <MediaEditor entertainerId={act.id} videos={videos} awards={awards} />
            <ReferenceEditor entertainerId={act.id} references={references} />
          </div>

          <aside className="sticky">
            <GoLiveChecklist
              entertainerId={act.id}
              status={act.status}
              requirements={requirements}
              reviewNote={act.reviewNote}
              slug={act.slug}
            />
          </aside>
        </div>
      </div>
    </Shell>
  );
}
