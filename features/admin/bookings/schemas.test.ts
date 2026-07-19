import { describe, expect, it } from 'vitest';
import { EMERGENCY_REASON_MAX, emergencyCancelSchema } from '@/features/admin/bookings/schemas';

const valid = {
  bookingId: '4fa8b1c2-9d3e-4f5a-8b6c-7d8e9f0a1b2c',
  reason: 'Flash flooding at the meeting point — departure called off.',
  locale: 'en',
};

describe('emergencyCancelSchema', () => {
  it('accepts a well-formed emergency cancellation', () => {
    const parsed = emergencyCancelSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it('requires a reason — whitespace does not count', () => {
    expect(emergencyCancelSchema.safeParse({ ...valid, reason: '' }).success).toBe(false);
    expect(emergencyCancelSchema.safeParse({ ...valid, reason: '   ' }).success).toBe(false);
  });

  it('caps the reason at the note limit', () => {
    const long = 'x'.repeat(EMERGENCY_REASON_MAX + 1);
    expect(emergencyCancelSchema.safeParse({ ...valid, reason: long }).success).toBe(false);
    const atLimit = 'x'.repeat(EMERGENCY_REASON_MAX);
    expect(emergencyCancelSchema.safeParse({ ...valid, reason: atLimit }).success).toBe(true);
  });

  it('rejects a non-uuid booking id and unknown locale', () => {
    expect(emergencyCancelSchema.safeParse({ ...valid, bookingId: 'GH-ABC123' }).success).toBe(
      false,
    );
    expect(emergencyCancelSchema.safeParse({ ...valid, locale: 'fr' }).success).toBe(false);
  });
});
