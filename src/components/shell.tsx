/**
 * The persistent left rail (a bottom tab bar on mobile, per the designs).
 * What it lists depends on who is signed in, since a venue and an entertainer
 * have almost nothing in common beyond messages.
 */
import Link from 'next/link';
import type { SessionUser } from '@/lib/auth';

export interface NavItem {
  href: string;
  label: string;
  badge?: number;
}

export function navFor(user: SessionUser | null): NavItem[] {
  if (!user) {
    return [
      { href: '/', label: 'Discover' },
      { href: '/search', label: 'Search' },
      { href: '/signin', label: 'Sign in' },
    ];
  }
  switch (user.role) {
    case 'venue':
      return [
        { href: '/', label: 'Discover' },
        { href: '/search', label: 'Search' },
        { href: '/app/shortlists', label: 'Shortlists' },
        { href: '/app/inquiries', label: 'Inquiries' },
        { href: '/app/notifications', label: 'Activity' },
      ];
    case 'entertainer':
      return [
        { href: '/app', label: 'Dashboard' },
        { href: '/app/calendar', label: 'Calendar' },
        { href: '/app/rates', label: 'Rates' },
        { href: '/app/inquiries', label: 'Inquiries' },
        { href: '/app/profile', label: 'Profile' },
        { href: '/app/notifications', label: 'Activity' },
      ];
    case 'agency':
      return [
        { href: '/app', label: 'Roster' },
        { href: '/app/inquiries', label: 'Inquiries' },
        { href: '/app/notifications', label: 'Activity' },
        { href: '/search', label: 'Discover' },
      ];
    case 'admin':
      return [
        { href: '/admin', label: 'Review queue' },
        { href: '/admin/bookings', label: 'Bookings' },
        { href: '/admin/moderation', label: 'Moderation' },
        { href: '/admin/taxonomy', label: 'Taxonomy' },
        { href: '/', label: 'Marketplace' },
      ];
  }
}

export function Shell({
  user,
  current,
  badges = {},
  children,
}: {
  user: SessionUser | null;
  current: string;
  badges?: Record<string, number>;
  children: React.ReactNode;
}) {
  const items = navFor(user);
  return (
    <div className="shell">
      <nav className="rail" aria-label="Main">
        <Link href="/" className="rail__brand">
          ENCORE
        </Link>
        <div className="rail__nav">
          {items.map((item) => {
            const active = current === item.href;
            const badge = badges[item.href];
            return (
              <Link
                key={item.href}
                href={item.href}
                className="rail__link"
                aria-current={active ? 'page' : undefined}
              >
                <span className="rail__dot" />
                {item.label}
                {badge ? <span className="rail__badge">{badge}</span> : null}
              </Link>
            );
          })}
        </div>
        <div className="rail__foot">
          {user ? (
            <>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{user.displayName}</div>
                <div className="eyebrow">{user.role}</div>
              </div>
              <form action="/api/signout" method="post">
                <button className="btn btn--sm btn--ghost" type="submit">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link href="/signup" className="btn btn--sm">
              Join Encore
            </Link>
          )}
        </div>
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}
