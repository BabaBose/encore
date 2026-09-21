/**
 * The header that sits above every page: the lockup on the left, the menu
 * beside it, the account actions on the right. What the menu lists depends on
 * who is signed in, since a venue and an entertainer have almost nothing in
 * common beyond messages.
 *
 * On a phone the menu leaves the header for a bottom tab bar — a row of six
 * destinations does not fit next to a logo at 390px, and a thumb reaches the
 * bottom of the screen more easily than the top. The header stays, so the
 * brand and the account action are on every screen at every width.
 */
import Link from "next/link";
import { Logo } from "@/components/logo";
import { Icon, type IconName } from "@/components/icons";
import { ThemeToggle } from "@/components/theme";
import {
  CurrencyPicker,
  MoneyProvider,
  type MoneyView,
} from "@/components/money";
import { BRAND_NAME } from "@/lib/brand";
import type { SessionUser } from "@/lib/auth";

/** What the phone's account chip says. "entertainer" is too long for 320px. */
const ROLE_CHIP: Record<string, string> = {
  entertainer: 'Act',
  venue: 'Venue',
  agency: 'Agency',
  admin: 'Staff',
};

export interface NavItem {
  href: string;
  label: string;
  /** Shown above the label in the phone tab bar, never instead of it. */
  icon: IconName;
  /** A shorter label for the tab bar, where seven of them share 390px. */
  short?: string;
  badge?: number;
}

export function navFor(user: SessionUser | null): NavItem[] {
  if (!user) {
    return [
      { href: "/", label: "Discover", icon: "discover" },
      { href: "/search", label: "Search", icon: "search" },
      { href: "/#how-it-works", label: "How it works", icon: "guide" },
      { href: "/signin", label: "Sign in", icon: "signin" },
    ];
  }
  switch (user.role) {
    case "venue":
      return [
        { href: "/", label: "Discover", icon: "discover" },
        { href: "/search", label: "Search", icon: "search" },
        { href: "/app/shortlists", label: "Shortlists", icon: "shortlists" },
        { href: "/app/inquiries", label: "Inquiries", icon: "inquiries" },
        { href: "/app/notifications", label: "Activity", icon: "activity" },
      ];
    case "entertainer":
      return [
        { href: "/app", label: "Dashboard", icon: "dashboard" },
        { href: "/app/calendar", label: "Calendar", icon: "calendar" },
        { href: "/app/rates", label: "Rates", icon: "rates" },
        { href: "/app/inquiries", label: "Inquiries", icon: "inquiries" },
        { href: "/app/profile", label: "Profile", icon: "profile" },
        { href: "/app/notifications", label: "Activity", icon: "activity" },
      ];
    case "agency":
      return [
        { href: "/app", label: "Roster", icon: "roster" },
        { href: "/app/inquiries", label: "Inquiries", icon: "inquiries" },
        { href: "/app/notifications", label: "Activity", icon: "activity" },
        { href: "/search", label: "Discover", icon: "search" },
      ];
    case "admin":
      return [
        { href: "/admin", label: "Review queue", icon: "queue", short: "Queue" },
        { href: "/admin/listings", label: "Listings", icon: "listings" },
        { href: "/admin/signups", label: "Sign-ups", icon: "signups" },
        { href: "/admin/activity", label: "Activity", icon: "activity" },
        { href: "/admin/bookings", label: "Bookings", icon: "bookings" },
        { href: "/admin/moderation", label: "Moderation", icon: "moderation" },
        { href: "/admin/taxonomy", label: "Taxonomy", icon: "taxonomy" },
      ];
  }
}

export function Shell({
  user,
  current,
  badges = {},
  money,
  children,
}: {
  user: SessionUser | null;
  current: string;
  badges?: Record<string, number>;
  /** Resolved once per request by `pageContext`; every price on the page reads it. */
  money: MoneyView;
  children: React.ReactNode;
}) {
  const items = navFor(user);

  /** The same destinations twice: once in the header, once in the tab bar. */
  function links(variant: "topbar" | "tabbar") {
    return items.map((item) => {
      const badge = badges[item.href];
      return (
        <Link
          key={item.href}
          href={item.href}
          className={`${variant}__link`}
          aria-current={current === item.href ? "page" : undefined}
        >
          {variant === "tabbar" ? <Icon name={item.icon} /> : null}
          {variant === "tabbar" ? (item.short ?? item.label) : item.label}
          {badge ? <span className={`${variant}__badge`}>{badge}</span> : null}
        </Link>
      );
    });
  }

  return (
    <MoneyProvider value={money}>
      <div className="shell">
        <header className="topbar">
          <div className="topbar__inner">
            <Link href="/" className="topbar__brand" aria-label={BRAND_NAME}>
              <Logo />
            </Link>
            <nav className="topbar__nav" aria-label="Main">
              {links("topbar")}
            </nav>
            <div className="topbar__actions">
              {user ? (
                <>
                  <Link href="/app/account" className="topbar__who">
                    <div style={{ fontWeight: 600, color: "var(--ink)" }}>
                      {user.displayName}
                    </div>
                    <div className="eyebrow">{user.role}</div>
                  </Link>
                  {/*
                    The phone header has room for the lockup, one account
                    control and the two display controls — not for a name, a
                    sign-out and all of that. Below 900px this collapses to a
                    single chip that goes to the account page, where sign-out
                    also lives.
                  */}
                  <Link href="/app/account" className="topbar__chip" aria-label="Your account">
                    {ROLE_CHIP[user.role] ?? user.role}
                  </Link>
                  <form action="/api/signout" method="post" className="topbar__signout">
                    <button className="btn btn--sm btn--ghost" type="submit">
                      Sign out
                    </button>
                  </form>
                </>
              ) : (
                <Link href="/signup" className="btn btn--sm">
                  {/* One flex item, so the words are separated by a word space and
                    not by the button's 8px gap. Shortens to "Join" on a phone. */}
                  <span>
                    Join<span className="hide-sm">&#32;Book the Act</span>
                  </span>
                </Link>
              )}
              <CurrencyPicker compact />
              <ThemeToggle />
            </div>
          </div>
        </header>

        <main className="main">{children}</main>

        {/* Phone only. Hidden from the accessibility tree at wider widths. */}
        <nav className="tabbar" aria-label="Main">
          {links("tabbar")}
        </nav>
      </div>
    </MoneyProvider>
  );
}
