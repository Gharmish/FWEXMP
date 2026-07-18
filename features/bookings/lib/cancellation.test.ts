import { describe, expect, it } from 'vitest';
import { freeCancellationDeadline, startInstant } from '@/features/bookings/lib/cancellation';

describe('startInstant', () => {
  it('anchors the local time to Riyadh (UTC+3)', () => {
    expect(startInstant('2026-06-20', '09:00').toISOString()).toBe('2026-06-20T06:00:00.000Z');
  });
});

describe('freeCancellationDeadline', () => {
  it('is windowHours before the start', () => {
    expect(freeCancellationDeadline('2026-06-20', '09:00', 48).toISOString()).toBe(
      '2026-06-18T06:00:00.000Z',
    );
  });
});
