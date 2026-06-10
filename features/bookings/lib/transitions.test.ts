import { describe, expect, it } from 'vitest';
import {
  availableTransitions,
  canTransition,
  sourcesFor,
  type BookingTransitionTarget,
} from '@/features/admin/bookings/lib/transitions';

describe('availableTransitions', () => {
  it('lets a pending booking be confirmed or cancelled', () => {
    expect(availableTransitions('pending')).toEqual(['confirmed', 'cancelled']);
  });

  it('lets a confirmed booking be completed or cancelled', () => {
    expect(availableTransitions('confirmed')).toEqual(['completed', 'cancelled']);
  });

  it('treats completed, cancelled, and refunded as terminal (no transitions)', () => {
    expect(availableTransitions('completed')).toEqual([]);
    expect(availableTransitions('cancelled')).toEqual([]);
    expect(availableTransitions('refunded')).toEqual([]);
  });
});

describe('canTransition', () => {
  it('allows the legal moves', () => {
    expect(canTransition('pending', 'confirmed')).toBe(true);
    expect(canTransition('pending', 'cancelled')).toBe(true);
    expect(canTransition('confirmed', 'completed')).toBe(true);
    expect(canTransition('confirmed', 'cancelled')).toBe(true);
  });

  it('rejects illegal moves', () => {
    // Can't skip straight from pending to completed.
    expect(canTransition('pending', 'completed')).toBe(false);
    // Terminal states can't move.
    expect(canTransition('completed', 'cancelled')).toBe(false);
    expect(canTransition('cancelled', 'confirmed')).toBe(false);
    expect(canTransition('refunded', 'confirmed')).toBe(false);
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

  it('round-trips with canTransition for every target', () => {
    const targets: BookingTransitionTarget[] = ['confirmed', 'completed', 'cancelled'];
    for (const to of targets) {
      for (const from of sourcesFor(to)) {
        expect(canTransition(from, to)).toBe(true);
      }
    }
  });
});
