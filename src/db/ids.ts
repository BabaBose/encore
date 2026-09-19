import { randomUUID } from 'node:crypto';

/**
 * Prefixed ids. The prefix makes a stray id in a log or URL self-describing,
 * which matters once inquiries, blocks and messages all flow through the same
 * handlers.
 */
export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

/** URL-safe slug for an entertainer's public profile path. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
