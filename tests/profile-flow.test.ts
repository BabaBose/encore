import { describe, expect, it } from 'vitest';
import { makeFixture, type Fixture } from './helpers';
import * as repo from '@/db/repo';
import { draftFor, moveProfile, setVerified } from '@/services/profile';
import { ProfileNotReadyError } from '@/domain/profile';
import { canRemoveBlock } from '@/domain/availability';
import { newId } from '@/db/ids';
import { sendInquiry, transitionInquiry } from '@/services/booking';

describe('the review queue', () => {
  it('sends a complete profile to review and shows it to admin', async () => {
    const f = await makeFixture();
    await repo.updateEntertainerStatus(f.db, f.entertainerId, 'draft', null);

    await moveProfile(f.db, { entertainerId: f.entertainerId, to: 'pending_review', role: 'entertainer' });
    expect((await repo.entertainersAwaitingReview(f.db)).map((e) => e.id)).toEqual([f.entertainerId]);
  });

  it('refuses to submit a profile with no video', async () => {
    const f = await makeFixture();
    await repo.updateEntertainerStatus(f.db, f.entertainerId, 'draft', null);
    for (const m of await repo.listMedia(f.db, f.entertainerId, 'video')) {
      await repo.deleteMedia(f.db, f.entertainerId, m.id);
    }
    expect((await draftFor(f.db, f.entertainerId)).videoCount).toBe(0);
    await expect(moveProfile(f.db, { entertainerId: f.entertainerId, to: 'pending_review', role: 'entertainer' })).rejects.toThrow(ProfileNotReadyError);
  });

  it('publishes on approval and tells the act', async () => {
    const f = await makeFixture();
    await repo.updateEntertainerStatus(f.db, f.entertainerId, 'pending_review', null);
    await moveProfile(f.db, { entertainerId: f.entertainerId, to: 'live', role: 'admin' });

    expect((await repo.getEntertainerById(f.db, f.entertainerId))!.status).toBe('live');
    expect((await repo.listNotifications(f.db, f.entertainerUserId))[0]?.title).toMatch(/approved and live/);
  });

  it('sends a rejection back to draft with the reviewer’s note', async () => {
    const f = await makeFixture();
    await repo.updateEntertainerStatus(f.db, f.entertainerId, 'pending_review', null);
    await moveProfile(f.db, {
      entertainerId: f.entertainerId,
      to: 'draft',
      role: 'admin',
      note: 'The reel link is dead',
    });

    const act = (await repo.getEntertainerById(f.db, f.entertainerId))!;
    expect(act.status).toBe('draft');
    expect(act.reviewNote).toBe('The reel link is dead');
    expect((await repo.listNotifications(f.db, f.entertainerUserId))[0]?.body).toBe('The reel link is dead');
  });

  it('takes a suspended profile out of the discoverable pool', async () => {
    const f = await makeFixture();
    await moveProfile(f.db, {
      entertainerId: f.entertainerId,
      to: 'suspended',
      role: 'admin',
      note: 'Unlicensed media',
    });
    expect(await repo.liveEntertainers(f.db)).toHaveLength(0);
  });

  it('tells the act when it is verified', async () => {
    const f = await makeFixture();
    await setVerified(f.db, f.entertainerId, true);
    expect((await repo.getEntertainerById(f.db, f.entertainerId))!.verified).toBe(true);
    expect((await repo.listNotifications(f.db, f.entertainerUserId))[0]?.kind).toBe('verified');
  });
});

describe('manual calendar blocks', () => {
  it('can be lifted again, unlike a booking’s hold', async () => {
    const f = await makeFixture();
    const blockId = newId('blk');
    await repo.insertBlock(f.db, f.entertainerId, {
      id: blockId,
      kind: 'range',
      source: 'manual',
      start: '2027-02-01',
      end: '2027-02-05',
      note: 'Away',
    });
    expect(await repo.loadBlocks(f.db, f.entertainerId)).toHaveLength(1);

    await repo.deleteBlock(f.db, f.entertainerId, blockId);
    expect(await repo.loadBlocks(f.db, f.entertainerId)).toHaveLength(0);
  });

  it('will not delete a block placed by a confirmed booking', async () => {
    const f = await makeFixture();
    const id = await sendInquiry(f.db, {
      venueId: f.venueId,
      entertainerId: f.entertainerId,
      gigType: 'one_time',
      startDate: '2026-12-31',
      hours: 4,
    });
    await transitionInquiry(f.db, { inquiryId: id, to: 'accepted', actor: 'entertainer', actorUserId: f.entertainerUserId });
    await transitionInquiry(f.db, { inquiryId: id, to: 'confirmed', actor: 'entertainer', actorUserId: f.entertainerUserId });

    const [block] = await repo.loadBlocks(f.db, f.entertainerId);
    expect(canRemoveBlock(block)).toBe(false);

    // Even a direct call cannot drop it — the SQL is scoped to manual blocks.
    await repo.deleteBlock(f.db, f.entertainerId, block.id);
    expect(await repo.loadBlocks(f.db, f.entertainerId)).toHaveLength(1);
  });
});

describe('references and moderation', () => {
  it('holds a self-submitted reference back until it is checked', async () => {
    const f = await makeFixture();
    await repo.addReference(f.db, f.entertainerId, { quote: 'Wonderful night.', clientName: 'A Hotel' });

    expect(await repo.listReferences(f.db, f.entertainerId)).toHaveLength(0);
    const pending = await repo.referencesAwaitingModeration(f.db);
    expect(pending).toHaveLength(1);

    await repo.setReferenceModeration(f.db, pending[0].id, 'approved');
    expect(await repo.listReferences(f.db, f.entertainerId)).toHaveLength(1);
  });
});
