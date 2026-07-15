import { describe, expect, it } from 'vitest';
import {
  baseUrlFor,
  buildCheckoutBody,
  buildRefundBody,
  classifyResult,
  formatAmount,
  isSuccessfulResult,
  LIVE_BASE_URL,
  TEST_BASE_URL,
} from '@/features/payments/lib/hyperpay-core';
import type { HyperpayConfig, PrepareCheckoutInput } from '@/features/payments/types';

const input: PrepareCheckoutInput = {
  merchantTransactionId: 'b1f9c0de-0000-4000-8000-000000000001',
  amountSar: 480,
  customer: { email: 'guest@example.com', givenName: 'Sara', surname: 'Al Qahtani' },
  billing: {
    street1: '12 King Fahd Rd',
    city: 'Abha',
    state: 'Asir',
    country: 'SA',
    postcode: '62521',
  },
};

const testCfg: HyperpayConfig = { entityId: 'ent_test', mode: 'test', testConnector: 'external' };
const internalCfg: HyperpayConfig = {
  entityId: 'ent_test',
  mode: 'test',
  testConnector: 'internal',
};
const liveCfg: HyperpayConfig = { entityId: 'ent_live', mode: 'live', testConnector: 'external' };

describe('classifyResult', () => {
  it('treats the standard success groups as success', () => {
    for (const code of ['000.000.000', '000.100.110', '000.300.000', '000.600.000']) {
      expect(classifyResult(code)).toBe('success');
      expect(isSuccessfulResult(code)).toBe(true);
    }
  });

  it('treats risk manual-review codes as success (funds captured)', () => {
    expect(classifyResult('000.400.000')).toBe('success');
    expect(classifyResult('000.400.010')).toBe('success');
  });

  it('treats async result codes as pending', () => {
    expect(classifyResult('000.200.000')).toBe('pending');
    expect(isSuccessfulResult('000.200.000')).toBe(false);
  });

  it('treats rejections and errors as rejected', () => {
    for (const code of ['100.396.101', '800.100.151', '200.300.404', '800.400.103']) {
      expect(classifyResult(code)).toBe('rejected');
      expect(isSuccessfulResult(code)).toBe(false);
    }
  });
});

describe('formatAmount', () => {
  it('renders whole SAR with a .00 fractional part (test-server requirement)', () => {
    expect(formatAmount(480)).toBe('480.00');
    expect(formatAmount(0)).toBe('0.00');
    expect(formatAmount(1500)).toBe('1500.00');
  });
});

describe('baseUrlFor', () => {
  it('derives the test/live base from the mode', () => {
    expect(baseUrlFor('test', '')).toBe(TEST_BASE_URL);
    expect(baseUrlFor('live', '')).toBe(LIVE_BASE_URL);
  });

  it('honours an explicit override and normalises the trailing slash', () => {
    expect(baseUrlFor('test', 'https://example.test')).toBe('https://example.test/');
    expect(baseUrlFor('live', 'https://example.test/')).toBe('https://example.test/');
  });
});

describe('buildCheckoutBody', () => {
  it('includes all required customer + billing parameters', () => {
    const body = buildCheckoutBody(input, testCfg);
    expect(body.get('entityId')).toBe('ent_test');
    expect(body.get('amount')).toBe('480.00');
    expect(body.get('currency')).toBe('SAR');
    expect(body.get('paymentType')).toBe('DB');
    expect(body.get('merchantTransactionId')).toBe(input.merchantTransactionId);
    expect(body.get('customer.email')).toBe('guest@example.com');
    expect(body.get('customer.givenName')).toBe('Sara');
    expect(body.get('customer.surname')).toBe('Al Qahtani');
    expect(body.get('billing.street1')).toBe('12 King Fahd Rd');
    expect(body.get('billing.city')).toBe('Abha');
    expect(body.get('billing.state')).toBe('Asir');
    expect(body.get('billing.country')).toBe('SA');
    expect(body.get('billing.postcode')).toBe('62521');
  });

  it('sends card.holder only when provided (Apple Pay channel)', () => {
    expect(buildCheckoutBody(input, testCfg).has('card.holder')).toBe(false);
    const body = buildCheckoutBody({ ...input, cardHolder: 'Sara Al Qahtani' }, testCfg);
    expect(body.get('card.holder')).toBe('Sara Al Qahtani');
  });

  it('omits billing.state when the guest left it blank (optional per 3DS2 guide)', () => {
    const body = buildCheckoutBody({ ...input, billing: { ...input.billing, state: '' } }, testCfg);
    expect(body.has('billing.state')).toBe(false);
    expect(body.get('billing.street1')).toBe('12 King Fahd Rd');
  });

  it('adds the test-only flags in test mode with the external connector', () => {
    const body = buildCheckoutBody(input, testCfg);
    expect(body.get('testMode')).toBe('EXTERNAL');
    expect(body.get('customParameters[3DS2_enrolled]')).toBe('true');
  });

  it('omits the test-only flags for the internal simulator connector', () => {
    const body = buildCheckoutBody(input, internalCfg);
    expect(body.get('testMode')).toBeNull();
    expect(body.get('customParameters[3DS2_enrolled]')).toBeNull();
    // Everything else is unchanged — only the routing flags differ.
    expect(body.get('entityId')).toBe('ent_test');
    expect(body.get('merchantTransactionId')).toBe(input.merchantTransactionId);
  });

  it('NEVER adds the test-only flags in live mode', () => {
    const body = buildCheckoutBody(input, liveCfg);
    expect(body.get('testMode')).toBeNull();
    expect(body.get('customParameters[3DS2_enrolled]')).toBeNull();
  });
});

describe('buildRefundBody', () => {
  it('builds an RF body with entity, amount, and currency only', () => {
    const body = buildRefundBody(960, testCfg);
    expect(body.get('entityId')).toBe('ent_test');
    expect(body.get('amount')).toBe('960.00');
    expect(body.get('currency')).toBe('SAR');
    expect(body.get('paymentType')).toBe('RF');
    // Refunds reference the original debit — no customer/billing data travels.
    expect(body.get('customer.email')).toBeNull();
    expect(body.get('merchantTransactionId')).toBeNull();
  });

  it('adds the test flag only for the external test connector, NEVER in live mode', () => {
    expect(buildRefundBody(100, testCfg).get('testMode')).toBe('EXTERNAL');
    expect(buildRefundBody(100, internalCfg).get('testMode')).toBeNull();
    expect(buildRefundBody(100, liveCfg).get('testMode')).toBeNull();
  });
});
