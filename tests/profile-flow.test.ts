import { describe, expect, it } from 'vitest';
import { makeFixture } from './helpers';
import * as repo from '@/db/repo';
import { draftFor, moveProfile, setVerified } from '@/services/profile';
import { ProfileNotReadyError } from '@/domain/profile';
import { canRemoveBlock } from '@/domain/availability';
import { newId } from '@/db/ids';
import { sendInquiry, transitionInquiry } from '@/services/booking';

describe('the review queue', () => {
  it('sends a complete profile to review and shows it to admin', () => {
    const f = makeFixture();
    repo.updateEntertainerStatus(f.db, f.entertainerId, 'draft', null);

    moveProfile(f.db, { entertainerId: f.entertainerId, to: 'pending_review', role: 'entertainer' });
    expect(repo.entertainersAwaitingReview(f.db).map((e) => e.id)).toEqual([f.entertainerId]);
  });

  it('refuses to submit a profile with no video', () => {
    const f = makeFixture();
    repo.updateEntertainerStatus(f.db, f.entertainerId, 'draft', null);
    for (const m of repo.listMedia(f.db, f.entertainerId, 'video')) {
      repo.deleteMedia(f.db, f.entertainerId, m.id);
    }
    expect(draftFor(f.db, f.entertainerId).videoCount).toBe(0);
    expect(() =>
      moveProfile(f.db, { entertainerId: f.entertainerId, to: 'pending_review', role: 'entertainer' }),
    ).toThrow(ProfileNotReadyError);
  });

  it('publishes on approval and tells the act', () => {
    const f = makeFixture();
    repo.updateEntertainerStatus(f.db, f.entertainerId, 'pending_review', null);
    moveProfile(f.db, { entertainerId: f.entertainerId, to: 'live', role: 'admin' });

    expect(repo.getEntertainerById(f.db, f.entertainerId)!.status).toBe('live');
    expect(repo.listNotifications(f.db, f.entertainerUserId)[0]?.title).toMatch(/approved and live/);
  });

  it('sends a rejection back to draft with the reviewer’s note', () => {
    const f = makeFixture();
    repo.updateEntertainerStatus(f.db, f.entertainerId, 'pending_review', null);
    moveProfile(f.db, {
      entertainerId: f.entertainerId,
      to: 'draft',
      role: 'admin',
      note: 'The reel link is dead',
    });

    const act = repo.getEntertainerById(f.db, f.entertainerId)!;
    expect(act.status).toBe('draft');
    expect(act.reviewNote).toBe('The reel link is dead');
    expect(repo.listNotifications(f.db, f.entertainerUserId)[0]?.body).toBe('The reel link is dead');
  });

  it('takes a suspended profile out of the discoverable pool', () => {
    const f = makeFixture();
    moveProfile(f.db, {
      entertainerId: f.entertainerId,
      to: 'suspended',
      role: 'admin',
      note: 'Unlicensed media',
    });
    expect(repo.liveEntertainers(f.db)).toHaveLength(0);
  });

  it('tells the act when it is verified', () => {
    const f = makeFixture();
    setVerified(f.db, f.entertainerId, true);
    expect(repo.getEntertainerById(f.db, f.entertainerId)!.verified).toBe(true);
    expect(repo.listNotifications(f.db, f.entertainerUserId)[0]?.kind).toBe('verified');
  });
});

describe('manual calendar blocks', () => {
  it('can be lifted again, unlike a booking’s hold', () => {
    const f = makeFixture();
    const blockId = newId('blk');
    repo.insertBlock(f.db, f.entertainerId, {
      id: blockId,
      kind: 'range',
      source: 'manual',
      start: '2027-02-01',
      end: '2027-02-05',
      note: 'Away',
    });
    expect(repo.loadBlocks(f.db, f.entertainerId)).toHaveLength(1);

    repo.deleteBlock(f.db, f.entertainerId, blockId);
    expect(repo.loadBlocks(f.db, f.entertainerId)).toHaveLength(0);
  });

  it('will not delete a block placed by a confirmed booking', () => {
    const f = makeFixture();
    const id = sendInquiry(f.db, {
      venueId: f.venueId,
      entertainerId: f.entertainerId,
      gigType: 'one_time',
      startDate: '2026-12-31',
      hours: 4,
    });
    transitionInquiry(f.db, { inquiryId: id, to: 'accepted', actor: 'entertainer', actorUserId: f.entertainerUserId });
    transitionInquiry(f.db, { inquiryId: id, to: 'confirmed', actor: 'entertainer', actorUserId: f.entertainerUserId });

    const [block] = repo.loadBlocks(f.db, f.entertainerId);
    expect(canRemoveBlock(block)).toBe(false);

    // Even a direct call cannot drop it — the SQL is scoped to manual blocks.
    repo.deleteBlock(f.db, f.entertainerId, block.id);
    expect(repo.loadBlocks(f.db, f.entertainerId)).toHaveLength(1);
  });
});

describe('references and moderation', () => {
  it('holds a self-submitted reference back until it is checked', () => {
    const f = makeFixture();
    repo.addReference(f.db, f.entertainerId, { quote: 'Wonderful night.', clientName: 'A Hotel' });

    expect(repo.listReferences(f.db, f.entertainerId)).toHaveLength(0);
    const pending = repo.referencesAwaitingModeration(f.db);
    expect(pending).toHaveLength(1);

    repo.setReferenceModeration(f.db, pending[0].id, 'approved');
    expect(repo.listReferences(f.db, f.entertainerId)).toHaveLength(1);
  });
});
