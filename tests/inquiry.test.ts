import { describe, expect, it } from 'vitest';
import {
  InvalidTransitionError,
  MissingReasonError,
  allowedTransitions,
  applyTransition,
  canLeaveReview,
  canTransition,
} from '@/domain/inquiry';

describe('who may move an inquiry', () => {
  it('lets only the entertainer accept — there is no instant booking', () => {
    expect(canTransition('new', 'accepted', 'entertainer')).toBe(true);
    expect(canTransition('new', 'accepted', 'venue')).toBe(false);
    expect(canTransition('new', 'confirmed', 'venue')).toBe(false);
  });

  it('lets the venue confirm only by accepting a counter-offer', () => {
    expect(canTransition('countered', 'confirmed', 'venue')).toBe(true);
    expect(canTransition('viewed', 'confirmed', 'venue')).toBe(false);
  });

  it('lets either party cancel from any pre-completed state', () => {
    for (const from of ['new', 'viewed', 'accepted', 'countered', 'confirmed'] as const) {
      expect(canTransition(from, 'cancelled', 'venue')).toBe(true);
      expect(canTransition(from, 'cancelled', 'entertainer')).toBe(true);
    }
  });

  it('treats completed and cancelled as terminal', () => {
    expect(allowedTransitions('completed', 'admin')).toEqual([]);
    expect(allowedTransitions('cancelled', 'admin')).toEqual([]);
  });
});

describe('applyTransition', () => {
  it('rejects an illegal move with a useful error', () => {
    expect(() => applyTransition({ from: 'new', to: 'completed', actor: 'venue' })).toThrow(InvalidTransitionError);
  });

  it('demands a logged reason for a cancellation', () => {
    expect(() => applyTransition({ from: 'confirmed', to: 'cancelled', actor: 'venue' })).toThrow(MissingReasonError);
    const out = applyTransition({ from: 'confirmed', to: 'cancelled', actor: 'venue', reason: 'Event postponed' });
    expect(out.reason).toBe('Event postponed');
  });

  it('treats a whitespace-only reason as no reason', () => {
    expect(() => applyTransition({ from: 'new', to: 'declined', actor: 'entertainer', reason: '   ' })).toThrow(
      MissingReasonError,
    );
  });

  it('demands an amount on a counter-offer', () => {
    expect(() => applyTransition({ from: 'viewed', to: 'countered', actor: 'entertainer' })).toThrow(RangeError);
    const out = applyTransition({ from: 'viewed', to: 'countered', actor: 'entertainer', offer: 390000 });
    expect(out.offer).toBe(390000);
  });
});

describe('calendar side effects', () => {
  it('holds dates on confirmation', () => {
    const out = applyTransition({ from: 'accepted', to: 'confirmed', actor: 'entertainer' });
    expect(out.holdsDates).toBe(true);
    expect(out.releasesDates).toBe(false);
  });

  it('keeps dates held when a confirmed booking completes', () => {
    const out = applyTransition({ from: 'confirmed', to: 'completed', actor: 'venue' });
    expect(out.holdsDates).toBe(false);
    expect(out.releasesDates).toBe(false);
  });

  it('releases dates when a confirmed booking is cancelled', () => {
    const out = applyTransition({ from: 'confirmed', to: 'cancelled', actor: 'venue', reason: 'Venue closed' });
    expect(out.releasesDates).toBe(true);
  });

  it('holds no dates for a move between pre-confirmation states', () => {
    const out = applyTransition({ from: 'new', to: 'viewed', actor: 'entertainer' });
    expect(out.holdsDates).toBe(false);
    expect(out.releasesDates).toBe(false);
  });
});

describe('post-gig review', () => {
  it('is possible only from a completed booking', () => {
    expect(canLeaveReview('completed')).toBe(true);
    expect(canLeaveReview('confirmed')).toBe(false);
    expect(canLeaveReview('cancelled')).toBe(false);
  });
});
