import { describe, expect, it } from 'vitest';
import {
  availableTransitions,
  canTransition,
  sourcesFor,
  BOOKING_TRANSITION_TARGETS,
} from '@/features/bookings/lib/transitions';

describe('availableTransitions', () => {
  it('lets a pending request be approved, declined, or cancelled', () => {
    expect(availableTransitions('pending')).toEqual(['confirmed', 'declined', 'cancelled']);
  });

  it('lets a confirmed booking be completed or cancelled', () => {
    expect(availableTransitions('confirmed')).toEqual(['completed', 'cancelled']);
  });

  it('treats completed, cancelled, refunded, declined, and expired as terminal', () => {
    expect(availableTransitions('completed')).toEqual([]);
    expect(availableTransitions('cancelled')).toEqual([]);
    expect(availableTransitions('refunded')).toEqual([]);
    expect(availableTransitions('declined')).toEqual([]);
    expect(availableTransitions('expired')).toEqual([]);
  });
});

describe('canTransition', () => {
  it('allows the legal moves', () => {
    expect(canTransition('pending', 'confirmed')).toBe(true);
    expect(canTransition('pending', 'declined')).toBe(true);
    expect(canTransition('pending', 'cancelled')).toBe(true);
    expect(canTransition('confirmed', 'completed')).toBe(true);
    expect(canTransition('confirmed', 'cancelled')).toBe(true);
  });

  it('rejects illegal moves', () => {
    // Can't skip straight from pending to completed.
    expect(canTransition('pending', 'completed')).toBe(false);
    // Declining is only meaningful on an undecided request.
    expect(canTransition('confirmed', 'declined')).toBe(false);
    // Terminal states can't move.
    expect(canTransition('completed', 'cancelled')).toBe(false);
    expect(canTransition('cancelled', 'confirmed')).toBe(false);
    expect(canTransition('refunded', 'confirmed')).toBe(false);
    expect(canTransition('declined', 'confirmed')).toBe(false);
    expect(canTransition('expired', 'confirmed')).toBe(false);
  });
});

describe('sourcesFor', () => {
  it('confirmed only comes from pending', () => {
    expect(sourcesFor('confirmed')).toEqual(['pending']);
  });

  it('completed only comes from confirmed', () => {
    expect(sourcesFor('completed')).toEqual(['confirmed']);
  });

  it('cancelled comes from pending or confirmed', () => {
    expect(sourcesFor('cancelled')).toEqual(['pending', 'confirmed']);
  });

  it('declined only comes from pending', () => {
    expect(sourcesFor('declined')).toEqual(['pending']);
  });

  it('round-trips with canTransition for every target', () => {
    for (const to of BOOKING_TRANSITION_TARGETS) {
      for (const from of sourcesFor(to)) {
        expect(canTransition(from, to)).toBe(true);
      }
    }
  });
});
