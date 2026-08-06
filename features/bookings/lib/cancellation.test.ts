import { describe, expect, it } from 'vitest';
import { startInstant } from '@/features/bookings/lib/cancellation';

describe('startInstant', () => {
  it('anchors the local time to Riyadh (UTC+3)', () => {
    expect(startInstant('2026-06-20', '09:00').toISOString()).toBe('2026-06-20T06:00:00.000Z');
  });
});
