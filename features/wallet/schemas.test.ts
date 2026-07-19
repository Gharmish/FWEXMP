import { describe, expect, it } from 'vitest';
import {
  WALLET_MAX_PER_ACTION_SAR,
  WALLET_NOTE_MAX,
  adjustWalletBalanceSchema,
  issueWalletCreditSchema,
} from '@/features/wallet/schemas';

const KEY = '4bb44dab-6f13-4d96-8b44-2f7c76ffbe17';

function issueInput(overrides: Record<string, unknown> = {}) {
  return {
    amountSar: '50',
    reason: 'goodwill',
    note: 'Late host, comped per support call.',
    expiresAt: '',
    idempotencyKey: KEY,
    ...overrides,
  };
}

function adjustInput(overrides: Record<string, unknown> = {}) {
  return {
    amountSar: '30',
    note: 'Issued twice by mistake.',
    idempotencyKey: KEY,
    ...overrides,
  };
}

describe('issueWalletCreditSchema', () => {
  it('parses a full valid payload, coercing the amount', () => {
    const parsed = issueWalletCreditSchema.safeParse(issueInput());
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.amountSar).toBe(50);
      expect(parsed.data.reason).toBe('goodwill');
    }
  });

  it.each(['0', '-10', '12.5'])('rejects non-positive-integer amount %s', (amountSar) => {
    expect(issueWalletCreditSchema.safeParse(issueInput({ amountSar })).success).toBe(false);
  });

  it('rejects an amount over the per-action cap', () => {
    const over = String(WALLET_MAX_PER_ACTION_SAR + 1);
    expect(issueWalletCreditSchema.safeParse(issueInput({ amountSar: over })).success).toBe(false);
    const at = String(WALLET_MAX_PER_ACTION_SAR);
    expect(issueWalletCreditSchema.safeParse(issueInput({ amountSar: at })).success).toBe(true);
  });

  it('rejects reasons outside the P0 set', () => {
    expect(issueWalletCreditSchema.safeParse(issueInput({ reason: 'promo' })).success).toBe(false);
  });

  it('trims the note and turns an empty note into undefined', () => {
    const parsed = issueWalletCreditSchema.safeParse(issueInput({ note: '   ' }));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.note).toBeUndefined();
  });

  it('rejects a note over the max length', () => {
    const note = 'x'.repeat(WALLET_NOTE_MAX + 1);
    expect(issueWalletCreditSchema.safeParse(issueInput({ note })).success).toBe(false);
  });

  it('accepts an empty expiry and a future expiry', () => {
    expect(issueWalletCreditSchema.safeParse(issueInput({ expiresAt: '' })).success).toBe(true);
    expect(
      issueWalletCreditSchema.safeParse(issueInput({ expiresAt: '2030-01-01T12:00' })).success,
    ).toBe(true);
  });

  it('rejects garbage and past expiry values', () => {
    expect(issueWalletCreditSchema.safeParse(issueInput({ expiresAt: 'not-a-date' })).success).toBe(
      false,
    );
    expect(
      issueWalletCreditSchema.safeParse(issueInput({ expiresAt: '2020-01-01T12:00' })).success,
    ).toBe(false);
  });

  it('rejects a non-uuid idempotency key', () => {
    expect(issueWalletCreditSchema.safeParse(issueInput({ idempotencyKey: 'nope' })).success).toBe(
      false,
    );
  });
});

describe('adjustWalletBalanceSchema', () => {
  it('parses a valid payload', () => {
    const parsed = adjustWalletBalanceSchema.safeParse(adjustInput());
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.amountSar).toBe(30);
  });

  it('requires a non-empty note', () => {
    expect(adjustWalletBalanceSchema.safeParse(adjustInput({ note: '' })).success).toBe(false);
    expect(adjustWalletBalanceSchema.safeParse(adjustInput({ note: '   ' })).success).toBe(false);
  });

  it('enforces the per-action cap on the magnitude', () => {
    const over = String(WALLET_MAX_PER_ACTION_SAR + 1);
    expect(adjustWalletBalanceSchema.safeParse(adjustInput({ amountSar: over })).success).toBe(
      false,
    );
  });
});
