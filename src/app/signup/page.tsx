import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { moneyContext } from '@/lib/visitor';
import { getDb } from '@/db/client';
import * as repo from '@/db/repo';
import { Shell } from '@/components/shell';
import { SignUpForm } from '@/components/auth-forms';

export const dynamic = 'force-dynamic';

export default async function SignUpPage() {
  if (await currentUser()) redirect('/app');
  const money = await moneyContext();
  const cities = await repo.listCities(getDb());
  return (
    <Shell user={null} current="/signup" money={money}>
      <div className="page" style={{ maxWidth: 480 }}>
        <h1 className="display" style={{ marginBottom: 6 }}>
          Join Book the Act
        </h1>
        <p className="lede" style={{ marginBottom: 24 }}>
          One account is one role. An act that also books others for its own events signs up a second time.
        </p>
        <SignUpForm cities={cities} />
      </div>
    </Shell>
  );
}
