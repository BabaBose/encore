import { describe, expect, it } from 'vitest';
import { formatMoney, formatMoneyShort, parseMoney, timeAgo, timeSince } from '@/lib/format';

describe('money', () => {
  it('renders minor units as a readable amount', () => {
    expect(formatMoney(340000, 'AED')).toBe('AED 3,400');
    expect(formatMoney(150, 'AED')).toBe('AED 1.50');
  });

  it('shortens large amounts for cards', () => {
    expect(formatMoneyShort(1400000, 'AED')).toBe('AED 14k');
    expect(formatMoneyShort(40000, 'AED')).toBe('AED 400');
  });

  it('round-trips a typed amount back to minor units', () => {
    expect(parseMoney('4,200')).toBe(420000);
    expect(parseMoney('AED 3400')).toBe(340000);
    expect(parseMoney('')).toBe(0);
  });
});

describe('relative time', () => {
  const now = new Date('2026-12-31T12:00:00Z');

  it('stays terse in dense rows', () => {
    expect(timeAgo('2026-12-31T11:58:00Z', now)).toBe('2m');
    expect(timeAgo('2026-12-30T12:00:00Z', now)).toBe('1d');
  });

  it('reads as a phrase where a sentence needs one', () => {
    // The dashboard used to render "opened just now ago".
    expect(timeSince('2026-12-31T11:59:40Z', now)).toBe('just now');
    expect(timeSince('2026-12-31T11:00:00Z', now)).toBe('1 hour ago');
    expect(timeSince('2026-12-29T12:00:00Z', now)).toBe('2 days ago');
  });
});
