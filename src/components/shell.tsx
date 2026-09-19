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
import { ThemeToggle } from "@/components/theme";
import {
  CurrencyPicker,
  MoneyProvider,
  type MoneyView,
} from "@/components/money";
import { BRAND_NAME } from "@/lib/brand";
import type { SessionUser } from "@/lib/auth";

export interface NavItem {
  href: string;
  label: string;
  badge?: number;
}

export function navFor(user: SessionUser | null): NavItem[] {
  if (!user) {
    return [
      { href: "/", label: "Discover" },
      { href: "/search", label: "Search" },
      { href: "/#how-it-works", label: "How it works" },
      { href: "/signin", label: "Sign in" },
    ];
  }
  switch (user.role) {
    case "venue":
      return [
        { href: "/", label: "Discover" },
        { href: "/search", label: "Search" },
        { href: "/app/shortlists", label: "Shortlists" },
        { href: "/app/inquiries", label: "Inquiries" },
        { href: "/app/notifications", label: "Activity" },
      ];
    case "entertainer":
      return [
        { href: "/app", label: "Dashboard" },
        { href: "/app/calendar", label: "Calendar" },
        { href: "/app/rates", label: "Rates" },
        { href: "/app/inquiries", label: "Inquiries" },
        { href: "/app/profile", label: "Profile" },
        { href: "/app/notifications", label: "Activity" },
      ];
    case "agency":
      return [
        { href: "/app", label: "Roster" },
        { href: "/app/inquiries", label: "Inquiries" },
        { href: "/app/notifications", label: "Activity" },
        { href: "/search", label: "Discover" },
      ];
    case "admin":
      return [
        { href: "/admin", label: "Review queue" },
        { href: "/admin/listings", label: "Listings" },
        { href: "/admin/signups", label: "Sign-ups" },
        { href: "/admin/activity", label: "Activity" },
        { href: "/admin/bookings", label: "Bookings" },
        { href: "/admin/moderation", label: "Moderation" },
        { href: "/admin/taxonomy", label: "Taxonomy" },
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
          {variant === "tabbar" ? <span className="tabbar__dot" /> : null}
          {item.label}
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
                  <form action="/api/signout" method="post">
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
