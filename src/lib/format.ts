/** Presentation helpers shared by server components and route handlers. */

/** Minor units in to a display string out: 420000 AED -> "AED 4,200". */
export function formatMoney(minor: number, currency = 'AED'): string {
  const major = minor / 100;
  const formatted = new Intl.NumberFormat('en-AE', {
    minimumFractionDigits: Number.isInteger(major) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(major);
  return `${currency} ${formatted}`;
}

/** Compact form for search cards, where space is tight: "AED 4.2k". */
export function formatMoneyShort(minor: number, currency = 'AED'): string {
  const major = minor / 100;
  if (major >= 1000) {
    const k = major / 1000;
    return `${currency} ${Number.isInteger(k) ? k : k.toFixed(1)}k`;
  }
  return `${currency} ${Math.round(major)}`;
}

export function parseMoney(input: string): number {
  const cleaned = input.replace(/[^0-9.]/g, '');
  if (!cleaned) return 0;
  return Math.round(Number.parseFloat(cleaned) * 100);
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatDateShort(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/**
 * Relative time for message and notification lists. Terse by design — these sit
 * at the end of a dense row. Use `timeSince` where the caller wants a phrase.
 */
export function timeAgo(isoTimestamp: string, now: Date = new Date()): string {
  const then = new Date(isoTimestamp).getTime();
  const seconds = Math.max(0, Math.round((now.getTime() - then) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(isoTimestamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function clockTime(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/** A full phrase: "just now", "14 minutes ago", "3 days ago". */
export function timeSince(isoTimestamp: string, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(isoTimestamp).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return plural(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (hours < 24) return plural(hours, 'hour');
  const days = Math.round(hours / 24);
  if (days < 30) return plural(days, 'day');
  return `on ${formatDate(isoTimestamp.slice(0, 10))}`;
}
