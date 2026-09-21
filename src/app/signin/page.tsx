import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { moneyContext } from '@/lib/visitor';
import { Shell } from '@/components/shell';
import { SignInForm } from '@/components/auth-forms';

export const dynamic = 'force-dynamic';

export default async function SignInPage() {
  if (await currentUser()) redirect('/app');
  const money = await moneyContext();
  return (
    <Shell user={null} current="/signin" money={money}>
      <div className="page" style={{ maxWidth: 460 }}>
        <h1 className="display" style={{ marginBottom: 6 }}>
          Sign in
        </h1>
        <p className="lede" style={{ marginBottom: 24 }}>
          Venues, entertainers, agencies and our staff all sign in here.
        </p>
        <SignInForm />
        <div className="card" style={{ marginTop: 24 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            Demo accounts - password is <code>password</code>
          </div>
          <p className="field__hint" style={{ marginBottom: 10 }}>
            These three walk through the marketplace. Staff accounts are not demo accounts and are not listed.
          </p>
          <dl className="kv">
            <dt>Venue</dt>
            <dd>penthouse@booktheact.test</dd>
            <dt>Act</dt>
            <dd>nadia@booktheact.test</dd>
            <dt>Agency</dt>
            <dd>northline@booktheact.test</dd>
          </dl>
        </div>
      </div>
    </Shell>
  );
}
