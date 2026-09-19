import { describe, expect, it } from 'vitest';
import { makeFixture } from './helpers';
import * as repo from '@/db/repo';
import { mayEditProfile } from '@/domain/profile';
import { hashPassword, verifyPassword } from '@/lib/auth-core';
import { sendInquiry } from '@/services/booking';

describe('who may edit a listing', () => {
  const act = { userId: 'user_act', managedByUserId: 'user_agency' };

  it('lets the act edit its own', () => {
    expect(mayEditProfile({ id: 'user_act', role: 'entertainer' }, act)).toBe(true);
  });

  it('lets the agency it named edit it', () => {
    expect(mayEditProfile({ id: 'user_agency', role: 'agency' }, act)).toBe(true);
  });

  it('lets staff edit anyone', () => {
    expect(mayEditProfile({ id: 'user_admin', role: 'admin' }, act)).toBe(true);
    expect(mayEditProfile({ id: 'user_admin', role: 'admin' }, { userId: 'x', managedByUserId: null })).toBe(true);
  });

  it('refuses another act, another agency and a venue', () => {
    for (const viewer of [
      { id: 'user_other', role: 'entertainer' as const },
      { id: 'user_other', role: 'agency' as const },
      { id: 'user_other', role: 'venue' as const },
    ]) {
      expect(mayEditProfile(viewer, act)).toBe(false);
    }
  });
});

describe('sign-ups', () => {
  it('reports every account with what it joined as', async () => {
    const f = await makeFixture();
    const rows = await repo.listSignups(f.db);

    const byId = new Map(rows.map((r) => [r.userId, r]));
    const actRow = byId.get(f.entertainerUserId);
    expect(actRow?.role).toBe('entertainer');
    expect(actRow?.categoryLabel).toBe('Singer');
    expect(actRow?.actStatus).toBe('live');
    expect(actRow?.cityName).toBe('Dubai');

    const venueRow = byId.get(f.venueUserId);
    expect(venueRow?.role).toBe('venue');
    // A venue has no category — that column belongs to acts.
    expect(venueRow?.categoryLabel).toBeNull();
    expect(venueRow?.venueType).toBeTruthy();
  });

  it('comes back newest first', async () => {
    const f = await makeFixture();
    const dates = (await repo.listSignups(f.db)).map((r) => r.createdAt);
    expect([...dates].sort().reverse()).toEqual(dates);
  });
});

describe('the activity feed', () => {
  it('carries sign-ups, profiles and inquiry events in one list', async () => {
    const f = await makeFixture();
    await sendInquiry(f.db, {
      venueId: f.venueId,
      entertainerId: f.entertainerId,
      gigType: 'one_time',
      startDate: '2026-12-05',
      timeBlock: 'evening',
      hours: 3,
    });

    const feed = await repo.listActivity(f.db);
    const kinds = new Set(feed.map((r) => r.kind));
    expect(kinds.has('signup')).toBe(true);
    expect(kinds.has('profile')).toBe(true);
    expect(kinds.has('inquiry')).toBe(true);
  });

  it('is newest first and honours the limit', async () => {
    const f = await makeFixture();
    const feed = await repo.listActivity(f.db, 3);
    expect(feed.length).toBeLessThanOrEqual(3);
    const at = feed.map((r) => r.at);
    expect([...at].sort().reverse()).toEqual(at);
  });
});

describe('changing a password', () => {
  it('replaces the hash and leaves the old password useless', async () => {
    const f = await makeFixture();
    const before = await repo.findUserById(f.db, f.entertainerUserId);
    expect(verifyPassword('password', before!.passwordHash)).toBe(true);

    await repo.setPassword(f.db, f.entertainerUserId, hashPassword('a-much-longer-one'));

    const after = await repo.findUserById(f.db, f.entertainerUserId);
    expect(verifyPassword('a-much-longer-one', after!.passwordHash)).toBe(true);
    expect(verifyPassword('password', after!.passwordHash)).toBe(false);
  });

  it('drops every other session but the one asking', async () => {
    const f = await makeFixture();
    const soon = new Date(Date.now() + 86_400_000).toISOString();
    await repo.createSession(f.db, 'token-here', f.entertainerUserId, soon);
    await repo.createSession(f.db, 'token-elsewhere', f.entertainerUserId, soon);

    await repo.deleteSessionsForUser(f.db, f.entertainerUserId, 'token-here');

    expect(await repo.findSessionUser(f.db, 'token-here')).not.toBeNull();
    expect(await repo.findSessionUser(f.db, 'token-elsewhere')).toBeNull();
  });

  it('drops all of them when no session is kept', async () => {
    const f = await makeFixture();
    const soon = new Date(Date.now() + 86_400_000).toISOString();
    await repo.createSession(f.db, 'token-a', f.entertainerUserId, soon);
    await repo.deleteSessionsForUser(f.db, f.entertainerUserId);
    expect(await repo.findSessionUser(f.db, 'token-a')).toBeNull();
  });
});
