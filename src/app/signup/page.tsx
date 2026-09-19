import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { getDb } from '@/db/client';
import * as repo from '@/db/repo';
import { Shell } from '@/components/shell';
import { SignUpForm } from '@/components/auth-forms';
import { Logo } from '@/components/logo';

export const dynamic = 'force-dynamic';

export default async function SignUpPage() {
  if (await currentUser()) redirect('/app');
  const cities = await repo.listCities(getDb());
  return (
    <Shell user={null} current="/signup">
      <div className="page" style={{ maxWidth: 480 }}>
        <Logo size={26} tagline style={{ marginBottom: 26 }} />
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
