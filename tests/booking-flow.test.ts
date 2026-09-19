import { describe, expect, it } from 'vitest';
import { makeFixture } from './helpers';
import * as repo from '@/db/repo';
import {
  BookingConflictError,
  accessRoleFor,
  leaveReview,
  postMessage,
  quoteFor,
  sendInquiry,
  transitionInquiry,
} from '@/services/booking';
import { dayAvailability } from '@/domain/availability';
import { InvalidTransitionError } from '@/domain/inquiry';

describe('sending an inquiry', () => {
  it('pre-fills the offer from the act’s own rate rules', () => {
    const f = makeFixture();
    const id = sendInquiry(f.db, {
      venueId: f.venueId,
      entertainerId: f.entertainerId,
      gigType: 'one_time',
      startDate: '2026-12-31',
      timeBlock: 'late_night',
      hours: 4,
    });
    const inquiry = repo.getInquiry(f.db, id)!;
    // The NYE override, four hours, not the Thursday late-night rule.
    expect(inquiry.quotedAmount).toBe(340000 * 4);
    expect(inquiry.offerAmount).toBe(inquiry.quotedAmount);
    expect(inquiry.status).toBe('new');
  });

  it('lets the venue propose a different amount', () => {
    const f = makeFixture();
    const id = sendInquiry(f.db, {
      venueId: f.venueId,
      entertainerId: f.entertainerId,
      gigType: 'one_time',
      startDate: '2026-12-31',
      timeBlock: 'late_night',
      hours: 4,
      offerAmount: 1000000,
    });
    const inquiry = repo.getInquiry(f.db, id)!;
    expect(inquiry.offerAmount).toBe(1000000);
    expect(inquiry.quotedAmount).toBe(340000 * 4);
  });

  it('prices a residency as a monthly package', () => {
    const f = makeFixture();
    const act = repo.getEntertainerById(f.db, f.entertainerId)!;
    const quote = quoteFor(act.rateCard, {
      venueId: f.venueId,
      entertainerId: f.entertainerId,
      gigType: 'long_term',
      months: 6,
      daysPerWeek: 4,
    });
    expect(quote.basis).toBe('residency');
    expect(quote.amount).toBe(1400000);
  });

  it('notifies the entertainer', () => {
    const f = makeFixture();
    sendInquiry(f.db, {
      venueId: f.venueId,
      entertainerId: f.entertainerId,
      gigType: 'one_time',
      startDate: '2026-12-31',
      hours: 4,
    });
    const notes = repo.listNotifications(f.db, f.entertainerUserId);
    expect(notes[0]?.kind).toBe('inquiry_received');
  });

  it('refuses an inquiry to a profile that is not live', () => {
    const f = makeFixture();
    repo.updateEntertainerStatus(f.db, f.entertainerId, 'suspended', 'Under review');
    expect(() =>
      sendInquiry(f.db, {
        venueId: f.venueId,
        entertainerId: f.entertainerId,
        gigType: 'one_time',
        startDate: '2026-12-31',
        hours: 4,
      }),
    ).toThrow(/not accepting inquiries/);
  });
});

describe('the booking lifecycle', () => {
  function openInquiry(f: ReturnType<typeof makeFixture>, date = '2026-12-31') {
    return sendInquiry(f.db, {
      venueId: f.venueId,
      entertainerId: f.entertainerId,
      gigType: 'one_time',
      startDate: date,
      timeBlock: 'late_night',
      hours: 4,
    });
  }

  it('blocks the dates the instant a booking is confirmed', () => {
    const f = makeFixture();
    const id = openInquiry(f);
    transitionInquiry(f.db, { inquiryId: id, to: 'accepted', actor: 'entertainer', actorUserId: f.entertainerUserId });

    expect(dayAvailability(repo.loadBlocks(f.db, f.entertainerId), '2026-12-31').status).toBe('available');

    transitionInquiry(f.db, { inquiryId: id, to: 'confirmed', actor: 'entertainer', actorUserId: f.entertainerUserId });

    const day = dayAvailability(repo.loadBlocks(f.db, f.entertainerId), '2026-12-31');
    expect(day.status).toBe('booked');
    expect(day.blocks[0]?.bookingId).toBe(id);
  });

  it('refuses to double-commit a date another booking already holds', () => {
    const f = makeFixture();
    const first = openInquiry(f);
    transitionInquiry(f.db, { inquiryId: first, to: 'accepted', actor: 'entertainer', actorUserId: f.entertainerUserId });
    transitionInquiry(f.db, { inquiryId: first, to: 'confirmed', actor: 'entertainer', actorUserId: f.entertainerUserId });

    const second = openInquiry(f);
    transitionInquiry(f.db, { inquiryId: second, to: 'accepted', actor: 'entertainer', actorUserId: f.entertainerUserId });
    expect(() =>
      transitionInquiry(f.db, { inquiryId: second, to: 'confirmed', actor: 'entertainer', actorUserId: f.entertainerUserId }),
    ).toThrow(BookingConflictError);

    // The failed confirmation leaves nothing behind.
    expect(repo.getInquiry(f.db, second)!.status).toBe('accepted');
    expect(repo.loadBlocks(f.db, f.entertainerId).filter((b) => b.source === 'booking')).toHaveLength(1);
  });

  it('frees the dates again when a confirmed booking is cancelled', () => {
    const f = makeFixture();
    const id = openInquiry(f);
    transitionInquiry(f.db, { inquiryId: id, to: 'accepted', actor: 'entertainer', actorUserId: f.entertainerUserId });
    transitionInquiry(f.db, { inquiryId: id, to: 'confirmed', actor: 'entertainer', actorUserId: f.entertainerUserId });
    transitionInquiry(f.db, {
      inquiryId: id,
      to: 'cancelled',
      actor: 'venue',
      actorUserId: f.venueUserId,
      reason: 'Event called off',
    });

    expect(dayAvailability(repo.loadBlocks(f.db, f.entertainerId), '2026-12-31').status).toBe('available');
    expect(repo.getInquiry(f.db, id)!.cancelReason).toBe('Event called off');
  });

  it('keeps the dates held once a booking completes', () => {
    const f = makeFixture();
    const id = openInquiry(f);
    transitionInquiry(f.db, { inquiryId: id, to: 'accepted', actor: 'entertainer', actorUserId: f.entertainerUserId });
    transitionInquiry(f.db, { inquiryId: id, to: 'confirmed', actor: 'entertainer', actorUserId: f.entertainerUserId });
    transitionInquiry(f.db, { inquiryId: id, to: 'completed', actor: 'venue', actorUserId: f.venueUserId });

    expect(dayAvailability(repo.loadBlocks(f.db, f.entertainerId), '2026-12-31').status).toBe('booked');
  });

  it('carries a counter-offer through to the confirmed amount', () => {
    const f = makeFixture();
    const id = openInquiry(f);
    transitionInquiry(f.db, {
      inquiryId: id,
      to: 'countered',
      actor: 'entertainer',
      actorUserId: f.entertainerUserId,
      offer: 1500000,
    });
    expect(repo.getInquiry(f.db, id)!.offerAmount).toBe(1500000);

    transitionInquiry(f.db, { inquiryId: id, to: 'confirmed', actor: 'venue', actorUserId: f.venueUserId });
    const inquiry = repo.getInquiry(f.db, id)!;
    expect(inquiry.status).toBe('confirmed');
    expect(inquiry.offerAmount).toBe(1500000);
  });

  it('never lets a venue confirm without the act’s acceptance', () => {
    const f = makeFixture();
    const id = openInquiry(f);
    expect(() =>
      transitionInquiry(f.db, { inquiryId: id, to: 'confirmed', actor: 'venue', actorUserId: f.venueUserId }),
    ).toThrow(InvalidTransitionError);
  });

  it('writes an audit trail of every move with its actor', () => {
    const f = makeFixture();
    const id = openInquiry(f);
    transitionInquiry(f.db, { inquiryId: id, to: 'viewed', actor: 'entertainer', actorUserId: f.entertainerUserId });
    transitionInquiry(f.db, { inquiryId: id, to: 'accepted', actor: 'entertainer', actorUserId: f.entertainerUserId });
    const events = repo.listInquiryEvents(f.db, id);
    expect(events.map((e) => e.toStatus)).toEqual(['new', 'viewed', 'accepted']);
    expect(events.at(-1)?.actor).toBe('entertainer');
  });

  it('blocks the whole window of a confirmed residency', () => {
    const f = makeFixture();
    const id = sendInquiry(f.db, {
      venueId: f.venueId,
      entertainerId: f.entertainerId,
      gigType: 'long_term',
      startDate: '2027-01-01',
      months: 6,
      daysPerWeek: 4,
    });
    transitionInquiry(f.db, { inquiryId: id, to: 'accepted', actor: 'entertainer', actorUserId: f.entertainerUserId });
    transitionInquiry(f.db, { inquiryId: id, to: 'confirmed', actor: 'entertainer', actorUserId: f.entertainerUserId });

    const blocks = repo.loadBlocks(f.db, f.entertainerId);
    expect(dayAvailability(blocks, '2027-01-01').status).toBe('booked');
    expect(dayAvailability(blocks, '2027-06-30').status).toBe('booked');
    expect(dayAvailability(blocks, '2027-07-01').status).toBe('available');
  });
});

describe('access control', () => {
  it('lets only the two parties and admin touch an inquiry', () => {
    const f = makeFixture();
    const id = sendInquiry(f.db, {
      venueId: f.venueId,
      entertainerId: f.entertainerId,
      gigType: 'one_time',
      startDate: '2026-12-31',
      hours: 4,
    });
    const inquiry = repo.getInquiry(f.db, id)!;

    expect(accessRoleFor(inquiry, { id: f.venueUserId, role: 'venue' })).toBe('venue');
    expect(accessRoleFor(inquiry, { id: f.entertainerUserId, role: 'entertainer' })).toBe('entertainer');
    expect(accessRoleFor(inquiry, { id: 'someone-else', role: 'venue' })).toBeNull();
    expect(accessRoleFor(inquiry, { id: 'staff', role: 'admin' })).toBe('admin');
  });

  it('lets an agency act for the entertainer it represents', () => {
    const f = makeFixture({ managed: true });
    const id = sendInquiry(f.db, {
      venueId: f.venueId,
      entertainerId: f.entertainerId,
      gigType: 'one_time',
      startDate: '2026-12-31',
      hours: 4,
    });
    const inquiry = repo.getInquiry(f.db, id)!;
    expect(accessRoleFor(inquiry, { id: f.managerUserId, role: 'agency' })).toBe('entertainer');

    // And the agency is told about the act's inquiries.
    expect(repo.listNotifications(f.db, f.managerUserId).length).toBeGreaterThan(0);
  });
});

describe('messaging', () => {
  it('notifies the other party and nobody else', () => {
    const f = makeFixture();
    const id = sendInquiry(f.db, {
      venueId: f.venueId,
      entertainerId: f.entertainerId,
      gigType: 'one_time',
      startDate: '2026-12-31',
      hours: 4,
    });
    postMessage(f.db, id, f.venueUserId, 'Holding 31 Dec, 180 covers.');

    expect(repo.listMessages(f.db, id)).toHaveLength(1);
    expect(repo.unreadCount(f.db, id, f.entertainerUserId)).toBe(1);
    expect(repo.unreadCount(f.db, id, f.venueUserId)).toBe(0);

    repo.markThreadRead(f.db, id, f.entertainerUserId);
    expect(repo.unreadCount(f.db, id, f.entertainerUserId)).toBe(0);
  });

  it('refuses an empty message', () => {
    const f = makeFixture();
    const id = sendInquiry(f.db, {
      venueId: f.venueId,
      entertainerId: f.entertainerId,
      gigType: 'one_time',
      startDate: '2026-12-31',
      hours: 4,
    });
    expect(() => postMessage(f.db, id, f.venueUserId, '   ')).toThrow(/cannot be empty/);
  });
});

describe('verified reviews', () => {
  function completedBooking(f: ReturnType<typeof makeFixture>) {
    const id = sendInquiry(f.db, {
      venueId: f.venueId,
      entertainerId: f.entertainerId,
      gigType: 'one_time',
      startDate: '2026-12-31',
      hours: 4,
    });
    transitionInquiry(f.db, { inquiryId: id, to: 'accepted', actor: 'entertainer', actorUserId: f.entertainerUserId });
    transitionInquiry(f.db, { inquiryId: id, to: 'confirmed', actor: 'entertainer', actorUserId: f.entertainerUserId });
    transitionInquiry(f.db, { inquiryId: id, to: 'completed', actor: 'venue', actorUserId: f.venueUserId });
    return id;
  }

  it('feeds the act’s public rating', () => {
    const f = makeFixture();
    const id = completedBooking(f);
    leaveReview(f.db, { inquiryId: id, venueUserId: f.venueUserId, rating: 5, body: 'Held the room all night.' });

    const act = repo.getEntertainerById(f.db, f.entertainerId)!;
    expect(act.rating).toBe(5);
    expect(act.reviewCount).toBe(1);
  });

  it('is impossible before the booking completes', () => {
    const f = makeFixture();
    const id = sendInquiry(f.db, {
      venueId: f.venueId,
      entertainerId: f.entertainerId,
      gigType: 'one_time',
      startDate: '2026-12-31',
      hours: 4,
    });
    expect(() => leaveReview(f.db, { inquiryId: id, venueUserId: f.venueUserId, rating: 5, body: 'x' })).toThrow(
      /completed booking/,
    );
  });

  it('cannot be left twice, or by anyone but the booking venue', () => {
    const f = makeFixture();
    const id = completedBooking(f);
    leaveReview(f.db, { inquiryId: id, venueUserId: f.venueUserId, rating: 5, body: 'Great.' });
    expect(() => leaveReview(f.db, { inquiryId: id, venueUserId: f.venueUserId, rating: 4, body: 'Again' })).toThrow(
      /already been reviewed/,
    );
    expect(() => leaveReview(f.db, { inquiryId: id, venueUserId: 'someone', rating: 5, body: 'x' })).toThrow(
      /booking venue/,
    );
  });

  it('rejects a rating outside one to five', () => {
    const f = makeFixture();
    const id = completedBooking(f);
    expect(() => leaveReview(f.db, { inquiryId: id, venueUserId: f.venueUserId, rating: 6, body: 'x' })).toThrow(
      RangeError,
    );
  });
});
