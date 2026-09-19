'use server';

/**
 * Server actions.
 *
 * Each one authenticates, authorises, then delegates to a service — no domain
 * rule is decided here. Failures come back as a string the form renders, since
 * "that date is already committed" is information the venue needs, not a crash.
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import * as repo from '@/db/repo';
import { newId, slugify } from '@/db/ids';
import { AuthError, currentUser, endSession, hashPassword, requireRole, requireUser, startSession, verifyPassword } from '@/lib/auth';
import { accessRoleFor, leaveReview, postMessage, sendInquiry, transitionInquiry } from '@/services/booking';
import { moveProfile, setFeatured, setVerified } from '@/services/profile';
import { canRemoveBlock, normaliseManualBlock } from '@/domain/availability';
import { isIsoDate } from '@/domain/dates';
import { CONTRACT_LENGTHS, TIME_BLOCKS, type ContractLength, type InquiryStatus, type TimeBlock, type Weekday } from '@/domain/types';
import { parseMoney } from '@/lib/format';

export interface ActionState {
  error?: string;
  ok?: string;
}

/** Turns any thrown error into a message the form can render. */
async function guard(fn: () => Promise<ActionState> | ActionState): Promise<ActionState> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Error && err.message === 'NEXT_REDIRECT') throw err;
    // Next signals redirects and notFound by throwing; let those through.
    if (typeof err === 'object' && err && 'digest' in err && String((err as { digest: unknown }).digest).startsWith('NEXT_')) {
      throw err;
    }
    return { error: err instanceof Error ? err.message : 'Something went wrong' };
  }
}

const str = (data: FormData, key: string): string => String(data.get(key) ?? '').trim();
const num = (data: FormData, key: string): number => Number(str(data, key) || 0);
const bool = (data: FormData, key: string): boolean => data.get(key) != null;

// ------------------------------------------------------------------- auth --

export async function signInAction(_prev: ActionState, data: FormData): Promise<ActionState> {
  const result = await guard(async () => {
    const email = str(data, 'email').toLowerCase();
    const password = str(data, 'password');
    const db = getDb();
    const user = repo.findUserByEmail(db, email);
    // The same message either way, so this cannot be used to enumerate accounts.
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return { error: 'That email and password do not match' };
    }
    await startSession(user.id);
    return { ok: user.role };
  });
  if (result.error) return result;
  redirect(result.ok === 'venue' ? '/search' : result.ok === 'admin' ? '/admin' : '/app');
}

export async function signUpAction(_prev: ActionState, data: FormData): Promise<ActionState> {
  const result = await guard(async () => {
    const email = str(data, 'email').toLowerCase();
    const password = str(data, 'password');
    const displayName = str(data, 'displayName');
    const role = str(data, 'role');

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'That does not look like an email address' };
    if (password.length < 8) return { error: 'Use a password of at least 8 characters' };
    if (!displayName) return { error: 'Tell us what to call you' };
    if (!['entertainer', 'venue', 'agency'].includes(role)) return { error: 'Pick an account type' };

    const db = getDb();
    if (repo.findUserByEmail(db, email)) return { error: 'There is already an account with that email' };

    const user = repo.createUser(db, {
      email,
      passwordHash: hashPassword(password),
      role: role as 'entertainer' | 'venue' | 'agency',
      displayName,
    });

    if (role === 'venue') {
      repo.createVenue(db, {
        userId: user.id,
        name: displayName,
        venueType: str(data, 'venueType') || 'restaurant',
        cityId: str(data, 'cityId') || null,
      });
    } else if (role === 'entertainer') {
      // A new act starts as a draft with its own empty profile to fill in.
      const id = newId('ent');
      let slug = slugify(displayName) || 'act';
      if (repo.getEntertainerBySlug(db, slug)) slug = `${slug}-${id.slice(-4)}`;
      db.prepare(
        `INSERT INTO entertainers (id, user_id, slug, stage_name, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'draft', ?, ?)`,
      ).run(id, user.id, slug, displayName, new Date().toISOString(), new Date().toISOString());
      repo.createSubscription(db, { userId: user.id, plan: 'standard', status: 'trialing', renewsAt: null });
    } else {
      repo.createSubscription(db, { userId: user.id, plan: 'agency', status: 'trialing', renewsAt: null });
    }

    await startSession(user.id);
    return { ok: role };
  });
  if (result.error) return result;
  redirect(result.ok === 'venue' ? '/search' : '/app');
}

export async function signOutAction(): Promise<void> {
  await endSession();
  redirect('/');
}

// -------------------------------------------------------------- shortlists --

export async function createShortlistAction(_prev: ActionState, data: FormData): Promise<ActionState> {
  return guard(async () => {
    const user = await requireRole('venue');
    const db = getDb();
    const venue = repo.getVenueForUser(db, user.id);
    if (!venue) return { error: 'No venue profile on this account' };
    const name = str(data, 'name');
    if (!name) return { error: 'Give the collection a name' };
    repo.createShortlist(db, venue.id, name, str(data, 'note') || null);
    revalidatePath('/app/shortlists');
    return { ok: 'Collection created' };
  });
}

export async function toggleShortlistAction(_prev: ActionState, data: FormData): Promise<ActionState> {
  return guard(async () => {
    const user = await requireRole('venue');
    const db = getDb();
    const venue = repo.getVenueForUser(db, user.id);
    if (!venue) return { error: 'No venue profile on this account' };

    const entertainerId = str(data, 'entertainerId');
    let shortlistId = str(data, 'shortlistId');

    // Favouriting with no collection chosen creates the default one, so a
    // single tap never dead-ends on "pick a collection first".
    if (!shortlistId) {
      const lists = repo.listShortlists(db, venue.id);
      shortlistId = lists[0]?.id ?? repo.createShortlist(db, venue.id, 'Saved acts', null);
    }
    if (!repo.shortlistOwnedBy(db, shortlistId, venue.id)) return { error: 'That collection is not yours' };

    const list = repo.listShortlists(db, venue.id).find((l) => l.id === shortlistId);
    if (list?.entertainerIds.includes(entertainerId)) {
      repo.removeFromShortlist(db, shortlistId, entertainerId);
      revalidatePath('/app/shortlists');
      return { ok: 'Removed from the collection' };
    }
    repo.addToShortlist(db, shortlistId, entertainerId);
    revalidatePath('/app/shortlists');
    return { ok: 'Saved to the collection' };
  });
}

// --------------------------------------------------------------- inquiries --

export async function sendInquiryAction(_prev: ActionState, data: FormData): Promise<ActionState> {
  let inquiryId: string | null = null;
  const result = await guard(async () => {
    const user = await requireRole('venue');
    const db = getDb();
    const venue = repo.getVenueForUser(db, user.id);
    if (!venue) return { error: 'No venue profile on this account' };

    const gigType = str(data, 'gigType') === 'long_term' ? 'long_term' : 'one_time';
    const startDate = str(data, 'startDate');
    if (!startDate || !isIsoDate(startDate)) return { error: 'Pick a date to start from' };

    const monthsRaw = num(data, 'months');
    const offerRaw = str(data, 'offer');

    inquiryId = sendInquiry(db, {
      venueId: venue.id,
      entertainerId: str(data, 'entertainerId'),
      gigType,
      startDate,
      endDate: gigType === 'one_time' && isIsoDate(str(data, 'endDate')) ? str(data, 'endDate') : null,
      timeBlock: TIME_BLOCKS.includes(str(data, 'timeBlock') as TimeBlock)
        ? (str(data, 'timeBlock') as TimeBlock)
        : 'evening',
      hours: gigType === 'one_time' ? num(data, 'hours') || null : null,
      months: gigType === 'long_term' ? ((monthsRaw || 3) as ContractLength) : null,
      daysPerWeek: gigType === 'long_term' ? num(data, 'daysPerWeek') || null : null,
      cityId: str(data, 'cityId') || venue.cityId,
      eventType: str(data, 'eventType') || null,
      notes: str(data, 'notes') || null,
      offerAmount: offerRaw ? parseMoney(offerRaw) : null,
    });
    return {};
  });
  if (result.error) return result;
  redirect(`/app/inquiries/${inquiryId}`);
}

export async function transitionInquiryAction(_prev: ActionState, data: FormData): Promise<ActionState> {
  return guard(async () => {
    const user = await requireUser();
    const db = getDb();
    const inquiryId = str(data, 'inquiryId');
    const inquiry = repo.getInquiry(db, inquiryId);
    if (!inquiry) return { error: 'No such inquiry' };

    const actor = accessRoleFor(inquiry, user);
    if (!actor) throw new AuthError('This inquiry is not yours');

    const offerRaw = str(data, 'offer');
    transitionInquiry(db, {
      inquiryId,
      to: str(data, 'to') as InquiryStatus,
      actor,
      actorUserId: user.id,
      reason: str(data, 'reason') || null,
      offer: offerRaw ? parseMoney(offerRaw) : null,
    });
    revalidatePath(`/app/inquiries/${inquiryId}`);
    revalidatePath('/app/inquiries');
    revalidatePath('/app/calendar');
    return { ok: 'Updated' };
  });
}

export async function sendMessageAction(_prev: ActionState, data: FormData): Promise<ActionState> {
  return guard(async () => {
    const user = await requireUser();
    const db = getDb();
    const inquiryId = str(data, 'inquiryId');
    const inquiry = repo.getInquiry(db, inquiryId);
    if (!inquiry) return { error: 'No such inquiry' };
    if (!accessRoleFor(inquiry, user)) throw new AuthError('This thread is not yours');

    postMessage(db, inquiryId, user.id, str(data, 'body'));
    revalidatePath(`/app/inquiries/${inquiryId}`);
    return { ok: 'Sent' };
  });
}

export async function leaveReviewAction(_prev: ActionState, data: FormData): Promise<ActionState> {
  return guard(async () => {
    const user = await requireRole('venue');
    const db = getDb();
    leaveReview(db, {
      inquiryId: str(data, 'inquiryId'),
      venueUserId: user.id,
      rating: num(data, 'rating'),
      body: str(data, 'body'),
    });
    revalidatePath(`/app/inquiries/${str(data, 'inquiryId')}`);
    return { ok: 'Thanks — your review is on their profile' };
  });
}

// ------------------------------------------------------------- entertainer --

/** The signed-in act's own profile, or one an agency manages. */
async function ownEntertainer(entertainerId?: string) {
  const user = await requireRole('entertainer', 'agency');
  const db = getDb();
  const ent = entertainerId
    ? repo.getEntertainerById(db, entertainerId)
    : repo.getEntertainerForUser(db, user.id);
  if (!ent) throw new AuthError('No entertainer profile on this account');
  if (ent.userId !== user.id && ent.managedByUserId !== user.id) {
    throw new AuthError('That profile is not yours to edit');
  }
  return { db, user, ent };
}

export async function saveProfileAction(_prev: ActionState, data: FormData): Promise<ActionState> {
  return guard(async () => {
    const { db, ent } = await ownEntertainer(str(data, 'entertainerId') || undefined);

    const lengths = CONTRACT_LENGTHS.filter((m) => data.getAll('contractLengths').includes(String(m)));
    repo.updateEntertainerProfile(db, ent.id, {
      stageName: str(data, 'stageName') || ent.stageName,
      realName: str(data, 'realName') || null,
      shortBio: str(data, 'shortBio'),
      fullBio: str(data, 'fullBio'),
      categoryId: str(data, 'categoryId') || null,
      homeCityId: str(data, 'homeCityId') || null,
      countryOfOrigin: str(data, 'countryOfOrigin'),
      teamSize: num(data, 'teamSize') || 1,
      languages: str(data, 'languages')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      equipmentProvided: str(data, 'equipmentProvided'),
      equipmentRequired: str(data, 'equipmentRequired'),
      travelRadiusKm: num(data, 'travelRadiusKm'),
      acceptsShortTerm: bool(data, 'acceptsShortTerm'),
      acceptsLongTerm: bool(data, 'acceptsLongTerm'),
      openToRelocate: bool(data, 'openToRelocate'),
      contractLengths: lengths,
      representationNote: str(data, 'representationNote') || null,
    });
    repo.setEntertainerGenres(db, ent.id, data.getAll('genres').map(String).filter(Boolean));
    revalidatePath('/app/profile');
    revalidatePath(`/entertainers/${ent.slug}`);
    return { ok: 'Profile saved' };
  });
}

export async function submitForReviewAction(_prev: ActionState, data: FormData): Promise<ActionState> {
  return guard(async () => {
    const { db, user, ent } = await ownEntertainer(str(data, 'entertainerId') || undefined);
    moveProfile(db, { entertainerId: ent.id, to: 'pending_review', role: user.role });
    revalidatePath('/app/profile');
    return { ok: 'Sent to Encore for review' };
  });
}

export async function addMediaAction(_prev: ActionState, data: FormData): Promise<ActionState> {
  return guard(async () => {
    const { db, ent } = await ownEntertainer(str(data, 'entertainerId') || undefined);
    const url = str(data, 'url');
    if (!/^https?:\/\//i.test(url)) return { error: 'Paste a full https:// link to the video' };
    repo.addMedia(db, ent.id, { kind: 'video', url, title: str(data, 'title') || undefined, accent: ent.heroAccent });
    revalidatePath('/app/profile');
    revalidatePath(`/entertainers/${ent.slug}`);
    return { ok: 'Video added' };
  });
}

export async function deleteMediaAction(_prev: ActionState, data: FormData): Promise<ActionState> {
  return guard(async () => {
    const { db, ent } = await ownEntertainer(str(data, 'entertainerId') || undefined);
    repo.deleteMedia(db, ent.id, str(data, 'mediaId'));
    revalidatePath('/app/profile');
    return { ok: 'Removed' };
  });
}

export async function addAwardAction(_prev: ActionState, data: FormData): Promise<ActionState> {
  return guard(async () => {
    const { db, ent } = await ownEntertainer(str(data, 'entertainerId') || undefined);
    const title = str(data, 'title');
    if (!title) return { error: 'Name the award' };
    repo.addAward(db, ent.id, { title, issuer: str(data, 'issuer'), year: num(data, 'year') || new Date().getFullYear() });
    revalidatePath('/app/profile');
    return { ok: 'Award added' };
  });
}

export async function addReferenceAction(_prev: ActionState, data: FormData): Promise<ActionState> {
  return guard(async () => {
    const { db, ent } = await ownEntertainer(str(data, 'entertainerId') || undefined);
    const quote = str(data, 'quote');
    if (!quote) return { error: 'Paste the reference' };
    repo.addReference(db, ent.id, {
      quote,
      clientName: str(data, 'clientName'),
      gigDate: isIsoDate(str(data, 'gigDate')) ? str(data, 'gigDate') : null,
      logoAccent: ent.heroAccent,
    });
    revalidatePath('/app/profile');
    // Self-submitted references are moderated before they appear.
    return { ok: 'Added — it appears once Encore has checked it' };
  });
}

// ------------------------------------------------------------------- rates --

export async function saveRatesAction(_prev: ActionState, data: FormData): Promise<ActionState> {
  return guard(async () => {
    const { db, ent } = await ownEntertainer(str(data, 'entertainerId') || undefined);

    repo.upsertRateCard(db, ent.id, {
      currency: str(data, 'currency') || 'AED',
      baseHourly: parseMoney(str(data, 'baseHourly')),
      minimumHours: num(data, 'minimumHours') || 1,
      residencyWeekly: str(data, 'residencyWeekly') ? parseMoney(str(data, 'residencyWeekly')) : null,
      residencyMonthly: str(data, 'residencyMonthly') ? parseMoney(str(data, 'residencyMonthly')) : null,
      daysPerWeekIncluded: num(data, 'daysPerWeekIncluded') || 5,
      extraDayRate: str(data, 'extraDayRate') ? parseMoney(str(data, 'extraDayRate')) : null,
      published: bool(data, 'published'),
    });

    // The grid posts one field per cell, named `rule:<weekday>:<block>`.
    for (const [key, value] of data.entries()) {
      if (!key.startsWith('rule:')) continue;
      const [, weekdayRaw, block] = key.split(':');
      const weekday = Number(weekdayRaw);
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) continue;
      if (!TIME_BLOCKS.includes(block as TimeBlock)) continue;
      repo.setRateRule(db, ent.id, {
        weekday: weekday as Weekday,
        timeBlock: block as TimeBlock,
        hourly: parseMoney(String(value)),
      });
    }

    revalidatePath('/app/rates');
    revalidatePath(`/entertainers/${ent.slug}`);
    return { ok: 'Rates published' };
  });
}

export async function addSpecialDateAction(_prev: ActionState, data: FormData): Promise<ActionState> {
  return guard(async () => {
    const { db, ent } = await ownEntertainer(str(data, 'entertainerId') || undefined);
    const date = str(data, 'date');
    if (!isIsoDate(date)) return { error: 'Pick a valid date' };
    repo.addSpecialDate(db, ent.id, {
      date,
      label: str(data, 'label') || 'Special date',
      hourly: parseMoney(str(data, 'hourly')),
      minimumHours: num(data, 'minimumHours') || null,
    });
    revalidatePath('/app/rates');
    return { ok: 'Special date priced' };
  });
}

export async function removeSpecialDateAction(_prev: ActionState, data: FormData): Promise<ActionState> {
  return guard(async () => {
    const { db, ent } = await ownEntertainer(str(data, 'entertainerId') || undefined);
    repo.removeSpecialDate(db, ent.id, str(data, 'date'));
    revalidatePath('/app/rates');
    return { ok: 'Removed' };
  });
}

// ------------------------------------------------------------ availability --

export async function addBlockAction(_prev: ActionState, data: FormData): Promise<ActionState> {
  return guard(async () => {
    const { db, ent } = await ownEntertainer(str(data, 'entertainerId') || undefined);
    const kind = str(data, 'kind') as 'single' | 'range' | 'recurring_weekday';

    const block = normaliseManualBlock({
      id: newId('blk'),
      kind,
      start: str(data, 'start') || undefined,
      end: str(data, 'end') || undefined,
      weekday: str(data, 'weekday') ? num(data, 'weekday') : undefined,
      recurFrom: str(data, 'recurFrom') || undefined,
      recurUntil: str(data, 'recurUntil') || undefined,
      note: str(data, 'note') || undefined,
    });
    repo.insertBlock(db, ent.id, block);
    revalidatePath('/app/calendar');
    revalidatePath(`/entertainers/${ent.slug}`);
    return { ok: 'Dates blocked' };
  });
}

export async function removeBlockAction(_prev: ActionState, data: FormData): Promise<ActionState> {
  return guard(async () => {
    const { db, ent } = await ownEntertainer(str(data, 'entertainerId') || undefined);
    const blockId = str(data, 'blockId');
    const block = repo.loadBlocks(db, ent.id).find((b) => b.id === blockId);
    if (!block) return { error: 'No such block' };
    // A booking owns its dates; cancelling the booking is what frees them.
    if (!canRemoveBlock(block)) {
      return { error: 'This date is held by a confirmed booking. Cancel the booking to free it.' };
    }
    repo.deleteBlock(db, ent.id, blockId);
    revalidatePath('/app/calendar');
    revalidatePath(`/entertainers/${ent.slug}`);
    return { ok: 'Dates freed' };
  });
}

// ------------------------------------------------------------------- admin --

export async function adminProfileAction(_prev: ActionState, data: FormData): Promise<ActionState> {
  return guard(async () => {
    await requireRole('admin');
    const db = getDb();
    moveProfile(db, {
      entertainerId: str(data, 'entertainerId'),
      to: str(data, 'to') as 'live' | 'draft' | 'suspended',
      role: 'admin',
      note: str(data, 'note') || null,
    });
    revalidatePath('/admin');
    return { ok: 'Done' };
  });
}

export async function adminFlagAction(_prev: ActionState, data: FormData): Promise<ActionState> {
  return guard(async () => {
    await requireRole('admin');
    const db = getDb();
    const id = str(data, 'entertainerId');
    if (str(data, 'flag') === 'verified') setVerified(db, id, str(data, 'value') === '1');
    else setFeatured(db, id, str(data, 'value') === '1');
    revalidatePath('/admin');
    return { ok: 'Updated' };
  });
}

export async function adminModerateAction(_prev: ActionState, data: FormData): Promise<ActionState> {
  return guard(async () => {
    await requireRole('admin');
    const db = getDb();
    const decision = str(data, 'decision') === 'approve' ? 'approved' : 'rejected';
    if (str(data, 'target') === 'media') repo.setMediaModeration(db, str(data, 'id'), decision);
    else repo.setReferenceModeration(db, str(data, 'id'), decision);
    revalidatePath('/admin/moderation');
    return { ok: 'Moderated' };
  });
}

export async function markNotificationsReadAction(): Promise<void> {
  const user = await currentUser();
  if (!user) return;
  repo.markNotificationsRead(getDb(), user.id);
  revalidatePath('/app/notifications');
}
