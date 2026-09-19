/**
 * The account panel: who you are signed in as, and your password.
 *
 * Every role reaches this, including staff — an admin whose password arrived
 * over some channel they do not trust needs somewhere to change it.
 */
import { requireUser } from '@/lib/auth';
import { pageContext } from '@/lib/page-data';
import { getDb } from '@/db/client';
import * as repo from '@/db/repo';
import { Shell } from '@/components/shell';
import { SectionHead } from '@/components/ui';
import { ChangePasswordForm } from '@/components/auth-forms';
import { formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

const ROLE_LABEL: Record<string, string> = {
  entertainer: 'Act',
  venue: 'Venue',
  agency: 'Agency or manager',
  admin: 'Book the Act staff',
};

export default async function AccountPage() {
  const user = await requireUser();
  const { badges } = await pageContext();
  const row = await repo.findUserById(getDb(), user.id);

  return (
    <Shell user={user} current="/app/account" badges={badges}>
      <div className="page" style={{ maxWidth: 720 }}>
        <h1 className="display" style={{ marginBottom: 6 }}>
          Account
        </h1>
        <p className="lede" style={{ marginBottom: 26 }}>
          Your sign-in details. Changing your password signs out every other device.
        </p>

        <section style={{ marginBottom: 32 }}>
          <SectionHead title="Signed in as" />
          <div className="card">
            <dl className="kv">
              <dt>Name</dt>
              <dd>{user.displayName}</dd>
              <dt>Email</dt>
              <dd>{user.email}</dd>
              <dt>Role</dt>
              <dd>{ROLE_LABEL[user.role] ?? user.role}</dd>
              {row ? (
                <>
                  <dt>Joined</dt>
                  <dd>{formatDate(row.createdAt.slice(0, 10))}</dd>
                </>
              ) : null}
            </dl>
          </div>
        </section>

        <section>
          <SectionHead title="Change password" />
          <ChangePasswordForm />
        </section>
      </div>
    </Shell>
  );
}
