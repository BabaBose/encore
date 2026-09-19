/**
 * The rate panel: the grid, the minimum, special dates and the residency
 * package. This is where "published, rule-based rates" are actually authored —
 * nothing here is set by Book the Act.
 */
import { getDb } from '@/db/client';
import * as repo from '@/db/repo';
import { requireRole } from '@/lib/auth';
import { mayEditProfile } from '@/domain/profile';
import { pageContext } from '@/lib/page-data';
import { Shell } from '@/components/shell';
import { Empty, accentStyle } from '@/components/ui';
import { RateEditor, SpecialDateEditor } from '@/components/rate-editor';

export const dynamic = 'force-dynamic';

export default async function RatesPage({
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
      <Shell user={user} current="/app/rates" badges={badges}>
        <div className="page">
          <Empty>No profile on this account.</Empty>
        </div>
      </Shell>
    );
  }

  return (
    <Shell user={user} current="/app/rates" badges={badges}>
      <div className="page" style={accentStyle(act.heroAccent)}>
        <h1 className="display" style={{ marginBottom: 6 }}>
          Rates
        </h1>
        <p className="lede" style={{ marginBottom: 26 }}>
          A venue sees these before it messages you, and the inquiry form fills itself in from them. A special
          date always beats the grid; the grid always beats your base rate.
        </p>

        <div className="stack" style={{ gap: 24 }}>
          <RateEditor
            entertainerId={act.id}
            card={act.rateCard}
            published={act.rateCardPublished}
            acceptsLongTerm={act.acceptsLongTerm}
          />
          <SpecialDateEditor entertainerId={act.id} card={act.rateCard} />
        </div>
      </div>
    </Shell>
  );
}
