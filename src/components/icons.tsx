/**
 * The navigation icon set.
 *
 * Drawn here rather than pulled from a package: there are eighteen of them,
 * they are all one stroke weight on one 24-unit grid, and a dependency for
 * that is a dependency to keep up to date forever.
 *
 * Every icon inherits `currentColor`, so a link's own colour carries the icon
 * with it, and none of them is ever the only label - each sits above its word
 * in the tab bar, because an icon alone is a guessing game.
 */
export type IconName =
  | 'discover'
  | 'search'
  | 'guide'
  | 'signin'
  | 'shortlists'
  | 'inquiries'
  | 'activity'
  | 'dashboard'
  | 'calendar'
  | 'rates'
  | 'profile'
  | 'roster'
  | 'queue'
  | 'listings'
  | 'signups'
  | 'bookings'
  | 'moderation'
  | 'taxonomy';

/** Paths on a 24x24 grid, stroked. Keep them simple: these render at 19px. */
const PATHS: Record<IconName, React.ReactNode> = {
  discover: (
    <>
      <path d="M3.5 10.5 12 4l8.5 6.5V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19z" />
      <path d="M9.5 20.5v-6h5v6" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  guide: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.6 9.3a2.5 2.5 0 1 1 3.4 2.5c-.7.3-1 .9-1 1.6v.4" />
      <path d="M12 17.2h.01" />
    </>
  ),
  signin: (
    <>
      <path d="M14 3.5h4A1.5 1.5 0 0 1 19.5 5v14a1.5 1.5 0 0 1-1.5 1.5h-4" />
      <path d="M10 8.5 13.5 12 10 15.5" />
      <path d="M13.5 12h-9" />
    </>
  ),
  shortlists: (
    <>
      <path d="M6.5 3.5h11a1 1 0 0 1 1 1v15.2a.6.6 0 0 1-.94.5L12 16.4l-5.56 3.8a.6.6 0 0 1-.94-.5V4.5a1 1 0 0 1 1-1z" />
    </>
  ),
  inquiries: (
    <>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-5 4z" />
    </>
  ),
  activity: (
    <>
      <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16S18 14 18 9" />
      <path d="M10.3 19a2 2 0 0 0 3.4 0" />
    </>
  ),
  dashboard: (
    <>
      <rect x="3.5" y="3.5" width="7" height="8.5" rx="1.2" />
      <rect x="13.5" y="3.5" width="7" height="5" rx="1.2" />
      <rect x="3.5" y="15.5" width="7" height="5" rx="1.2" />
      <rect x="13.5" y="12" width="7" height="8.5" rx="1.2" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5.5" width="17" height="15" rx="1.8" />
      <path d="M3.5 10h17" />
      <path d="M8 3.5v4M16 3.5v4" />
    </>
  ),
  rates: (
    <>
      <path d="M12 4.2v15.6" />
      <path d="M15.8 7.8c-.6-1.4-2-2.1-3.8-2.1-2.2 0-3.6 1.1-3.6 2.8 0 4 7.6 2.2 7.6 6.4 0 1.9-1.6 3-4 3-2 0-3.5-.8-4.1-2.3" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8.5" r="3.8" />
      <path d="M4.8 20.2a7.4 7.4 0 0 1 14.4 0" />
    </>
  ),
  roster: (
    <>
      <circle cx="9" cy="8.5" r="3.4" />
      <path d="M3 19.8a6.2 6.2 0 0 1 12 0" />
      <path d="M16 5.6a3.4 3.4 0 0 1 0 6.6" />
      <path d="M17.4 14.6a6.2 6.2 0 0 1 3.6 5.2" />
    </>
  ),
  queue: (
    <>
      <rect x="5" y="4" width="14" height="16.5" rx="1.6" />
      <path d="M9 3v2.4h6V3" />
      <path d="m8.8 12.4 2 2 4.2-4.2" />
    </>
  ),
  listings: (
    <>
      <path d="M4 6.5h16M4 12h16M4 17.5h10" />
    </>
  ),
  signups: (
    <>
      <circle cx="10" cy="8.5" r="3.6" />
      <path d="M3.6 20a6.6 6.6 0 0 1 12.8 0" />
      <path d="M18.5 7v6M21.5 10h-6" />
    </>
  ),
  bookings: (
    <>
      <rect x="3.5" y="5.5" width="17" height="15" rx="1.8" />
      <path d="M3.5 10h17" />
      <path d="m8.8 15.2 2 2 4.4-4.4" />
    </>
  ),
  moderation: (
    <>
      <path d="M12 3.4 19.5 6v6.1c0 4.2-3 7-7.5 8.5-4.5-1.5-7.5-4.3-7.5-8.5V6z" />
      <path d="m9.2 12.2 2 2 3.6-3.8" />
    </>
  ),
  taxonomy: (
    <>
      <path d="M4.5 6.5h5M4.5 12h5M4.5 17.5h5" />
      <path d="M13 6.5h6.5M13 12h6.5M13 17.5h6.5" />
    </>
  ),
};

export function Icon({ name, size = 19 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ flex: 'none', display: 'block' }}
    >
      {PATHS[name]}
    </svg>
  );
}
