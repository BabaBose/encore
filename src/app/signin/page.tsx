import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { SignInForm } from '@/components/auth-forms';

export const dynamic = 'force-dynamic';

export default async function SignInPage() {
  if (await currentUser()) redirect('/app');
  return (
    <Shell user={null} current="/signin">
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
            Demo accounts — password is <code>password</code>
          </div>
          <dl className="kv">
            <dt>Venue</dt>
            <dd>penthouse@booktheact.test</dd>
            <dt>Act</dt>
            <dd>nadia@booktheact.test</dd>
            <dt>Agency</dt>
            <dd>northline@booktheact.test</dd>
            <dt>Admin</dt>
            <dd>admin@booktheact.test</dd>
          </dl>
        </div>
      </div>
    </Shell>
  );
}
