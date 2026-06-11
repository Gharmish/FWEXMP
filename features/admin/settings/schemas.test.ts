import { describe, expect, it } from 'vitest';
import { commissionPctToBps, updateSettingsSchema } from '@/features/admin/settings/schemas';

describe('commissionPctToBps', () => {
  it('converts whole and fractional percentages to basis points', () => {
    expect(commissionPctToBps(0)).toBe(0);
    expect(commissionPctToBps(15)).toBe(1500);
    expect(commissionPctToBps(17.5)).toBe(1750);
  });

  it('rounds to the nearest basis point', () => {
    expect(commissionPctToBps(12.344)).toBe(1234);
    expect(commissionPctToBps(12.346)).toBe(1235);
  });
});

describe('updateSettingsSchema', () => {
  const base = {
    commissionPct: '15',
    enabledCategories: ['nature', 'food'],
    cancellationWindowHours: '48',
    approvalWindowHours: '24',
    approvalPaymentWindowHours: '24',
    locale: 'en',
  };

  it('accepts a valid payload and coerces commission to a number', () => {
    const parsed = updateSettingsSchema.safeParse(base);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.commissionPct).toBe(15);
      expect(parsed.data.cancellationWindowHours).toBe(48);
      expect(parsed.data.approvalWindowHours).toBe(24);
      expect(parsed.data.approvalPaymentWindowHours).toBe(24);
    }
  });

  it('rejects a zero or fractional approval window', () => {
    expect(updateSettingsSchema.safeParse({ ...base, approvalWindowHours: '0' }).success).toBe(
      false,
    );
    expect(
      updateSettingsSchema.safeParse({ ...base, approvalPaymentWindowHours: '12.5' }).success,
    ).toBe(false);
  });

  it('rejects a cancellation window outside 0–336 hours or fractional', () => {
    expect(updateSettingsSchema.safeParse({ ...base, cancellationWindowHours: '-1' }).success).toBe(
      false,
    );
    expect(
      updateSettingsSchema.safeParse({ ...base, cancellationWindowHours: '337' }).success,
    ).toBe(false);
    expect(
      updateSettingsSchema.safeParse({ ...base, cancellationWindowHours: '24.5' }).success,
    ).toBe(false);
  });

  it('rejects commission below 0 or above 50', () => {
    expect(updateSettingsSchema.safeParse({ ...base, commissionPct: '-1' }).success).toBe(false);
    expect(updateSettingsSchema.safeParse({ ...base, commissionPct: '51' }).success).toBe(false);
  });

  it('requires at least one enabled category', () => {
    const parsed = updateSettingsSchema.safeParse({ ...base, enabledCategories: [] });
    expect(parsed.success).toBe(false);
  });

  it('rejects an unknown category', () => {
    const parsed = updateSettingsSchema.safeParse({ ...base, enabledCategories: ['rockets'] });
    expect(parsed.success).toBe(false);
  });
});
