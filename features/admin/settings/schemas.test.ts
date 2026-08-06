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
    approvalWindowHours: '24',
    approvalPaymentWindowHours: '24',
    vatEnabled: false,
    vatRatePct: '15',
    locale: 'en',
  };

  it('accepts a valid payload and coerces commission to a number', () => {
    const parsed = updateSettingsSchema.safeParse(base);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.commissionPct).toBe(15);
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

  it('allows VAT off without a registration number (pre-registration default)', () => {
    expect(updateSettingsSchema.safeParse(base).success).toBe(true);
    expect(updateSettingsSchema.safeParse({ ...base, vatRegistrationNumber: '' }).success).toBe(
      true,
    );
  });

  it('requires a valid ZATCA number to enable VAT', () => {
    // Enabling without a number, or with a malformed one, is refused —
    // a tax invoice without a registration number is a ZATCA violation.
    expect(updateSettingsSchema.safeParse({ ...base, vatEnabled: true }).success).toBe(false);
    expect(
      updateSettingsSchema.safeParse({
        ...base,
        vatEnabled: true,
        vatRegistrationNumber: '123456789012345',
      }).success,
    ).toBe(false);
    expect(
      updateSettingsSchema.safeParse({
        ...base,
        vatEnabled: true,
        vatRegistrationNumber: '310000000000003',
      }).success,
    ).toBe(true);
  });

  it('rejects a malformed number even while VAT is off (bad data never persists)', () => {
    expect(
      updateSettingsSchema.safeParse({ ...base, vatRegistrationNumber: '3abc3' }).success,
    ).toBe(false);
  });
});
