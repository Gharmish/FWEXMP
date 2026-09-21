import { describe, expect, it } from 'vitest';
import {
  baseUrlFor,
  buildCheckoutBody,
  buildRefundBody,
  classifyResult,
  formatAmount,
  isSuccessfulResult,
  isThrottled,
  LIVE_BASE_URL,
  pickCapture,
  TEST_BASE_URL,
} from '@/features/payments/lib/hyperpay-core';
import type {
  HyperpayConfig,
  PrepareCheckoutInput,
  ReportedPayment,
} from '@/features/payments/types';

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

const testCfg: HyperpayConfig = {
  entityId: 'ent_test',
  mode: 'test',
  testConnector: 'external',
  channel: 'card',
};
const internalCfg: HyperpayConfig = {
  entityId: 'ent_test',
  mode: 'test',
  testConnector: 'internal',
  channel: 'card',
};
const liveCfg: HyperpayConfig = {
  entityId: 'ent_live',
  mode: 'live',
  testConnector: 'external',
  channel: 'card',
};
const applePayCfg: HyperpayConfig = {
  entityId: 'ent_applepay',
  mode: 'test',
  testConnector: 'external',
  channel: 'applepay',
};

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

  it('treats "Rejected by Throttling" as pending — a refused REQUEST is never a declined PAYMENT', () => {
    // OPPWA allows two status GETs per checkout per minute; the third
    // answers 800.120.100. Read as a decline it flipped a possibly
    // captured booking to `failed` and emailed "your payment failed".
    expect(isThrottled('800.120.100')).toBe(true);
    expect(classifyResult('800.120.100')).toBe('pending');
    expect(isSuccessfulResult('800.120.100')).toBe(false);
    // Its neighbours are real risk-velocity declines of a payment.
    for (const code of ['800.120.101', '800.120.200', '800.120.300']) {
      expect(isThrottled(code)).toBe(false);
      expect(classifyResult(code)).toBe('rejected');
    }
  });
});

/**
 * `pickCapture` decides whether an expired checkout was PAID. Entries
 * mirror what `GET /v1/query?merchantTransactionId=…` really returned on
 * the test server (2026-09-21): a declined debit carries no amount, and a
 * refund names the debit it reverses in `referencedId`.
 */
describe('pickCapture', () => {
  const REF = '11111111-2222-4333-8444-555555555555';
  const debit = (extra: Partial<ReportedPayment> = {}): ReportedPayment => ({
    id: 'pay-ok',
    paymentType: 'DB',
    paymentBrand: 'VISA',
    amount: '480.00',
    currency: 'SAR',
    merchantTransactionId: REF,
    result: { code: '000.100.112' },
    ...extra,
  });
  const declined = debit({
    id: 'pay-declined',
    amount: undefined,
    currency: undefined,
    result: { code: '100.380.401' },
  });

  it('finds the capture among the declines that preceded it', () => {
    const found = pickCapture([declined, debit()], REF, 480);
    expect(found).toEqual({ kind: 'captured', payment: debit(), liveDebits: 1 });
  });

  it('reports none when every attempt was declined, or nothing exists', () => {
    expect(pickCapture([declined], REF, 480)).toEqual({ kind: 'none' });
    expect(pickCapture([], REF, 480)).toEqual({ kind: 'none' });
  });

  it('NEVER settles from a capture that was already refunded or reversed', () => {
    // A human refunded an unmatched capture in the HyperPay console. If it
    // still counted, a later abandoned checkout on the same booking would
    // settle it as PAID with money that has already gone home.
    for (const paymentType of ['RF', 'RV', 'CB']) {
      const reversal: ReportedPayment = {
        id: 'rev-1',
        paymentType,
        referencedId: 'pay-ok',
        amount: '480.00',
        currency: 'SAR',
        merchantTransactionId: REF,
        result: { code: '000.100.112' },
      };
      expect(pickCapture([debit(), reversal], REF, 480)).toEqual({ kind: 'none' });
    }
  });

  it('still counts a capture whose refund attempt FAILED', () => {
    const failedRefund: ReportedPayment = {
      id: 'rf-1',
      paymentType: 'RF',
      referencedId: 'pay-ok',
      merchantTransactionId: REF,
      result: { code: '700.400.200' },
    };
    expect(pickCapture([debit(), failedRefund], REF, 480).kind).toBe('captured');
  });

  it('only a reversal of THAT debit cancels it', () => {
    const otherRefund: ReportedPayment = {
      id: 'rf-2',
      paymentType: 'RF',
      referencedId: 'some-other-debit',
      merchantTransactionId: REF,
      result: { code: '000.100.112' },
    };
    expect(pickCapture([debit(), otherRefund], REF, 480).kind).toBe('captured');
  });

  it('prefers the capture matching what the guest owes, and counts a double charge', () => {
    const stale = debit({ id: 'pay-old-total', amount: '530.00' });
    const found = pickCapture([stale, debit()], REF, 480);
    expect(found).toMatchObject({ kind: 'captured', liveDebits: 2 });
    expect(found.kind === 'captured' && found.payment.id).toBe('pay-ok');
  });

  it('hands back a wrong-amount capture rather than hiding it — settle raises the mismatch', () => {
    const found = pickCapture([debit({ amount: '530.00' })], REF, 480);
    expect(found).toMatchObject({ kind: 'captured', liveDebits: 1 });
  });

  it('reports pending while a debit is still in flight', () => {
    expect(pickCapture([debit({ result: { code: '000.200.000' } })], REF, 480)).toEqual({
      kind: 'pending',
    });
  });

  it('reads a throttle code on a RECORDED entry as that attempt’s refusal, not as in flight', () => {
    // Otherwise the booking would sit in `processing` forever.
    expect(pickCapture([debit({ result: { code: '800.120.100' } })], REF, 480)).toEqual({
      kind: 'none',
    });
  });

  it('ignores entries that do not name this booking, or carry no payment id', () => {
    expect(pickCapture([debit({ merchantTransactionId: 'someone-else' })], REF, 480)).toEqual({
      kind: 'none',
    });
    expect(pickCapture([debit({ id: undefined })], REF, 480)).toEqual({ kind: 'none' });
    expect(pickCapture([debit({ id: '' })], REF, 480)).toEqual({ kind: 'none' });
  });

  it('never reads a successful non-debit as a capture', () => {
    expect(pickCapture([debit({ paymentType: 'RF' })], REF, 480)).toEqual({ kind: 'none' });
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

  it('requests an SRI hash (integrity=true) in every mode — HyperPay go-live requirement', () => {
    expect(buildCheckoutBody(input, testCfg).get('integrity')).toBe('true');
    expect(buildCheckoutBody(input, internalCfg).get('integrity')).toBe('true');
    expect(buildCheckoutBody(input, liveCfg).get('integrity')).toBe('true');
  });

  it('sends customer.mobile only when the booking has a phone (3DS2 phone requirement)', () => {
    expect(buildCheckoutBody(input, testCfg).has('customer.mobile')).toBe(false);
    const body = buildCheckoutBody(
      { ...input, customer: { ...input.customer, mobile: '+966541104000' } },
      testCfg,
    );
    expect(body.get('customer.mobile')).toBe('+966541104000');
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

  it('NEVER adds the test-only flags on the applepay channel (HyperPay 2026-08-10)', () => {
    const body = buildCheckoutBody(input, applePayCfg);
    expect(body.get('testMode')).toBeNull();
    expect(body.get('customParameters[3DS2_enrolled]')).toBeNull();
    // The rest of the body is unchanged — only the flags are gated.
    expect(body.get('entityId')).toBe('ent_applepay');
    expect(body.get('integrity')).toBe('true');
  });

  it('keeps the applepay body minimal: no card.holder, no customer.mobile (guide audit 2026-08-10)', () => {
    const body = buildCheckoutBody(
      {
        ...input,
        cardHolder: 'Sara Al Qahtani',
        customer: { ...input.customer, mobile: '+966541104000' },
      },
      applePayCfg,
    );
    expect(body.has('card.holder')).toBe(false);
    expect(body.has('customer.mobile')).toBe(false);
    // The same inputs DO travel on the card channel.
    const cardBody = buildCheckoutBody(
      {
        ...input,
        cardHolder: 'Sara Al Qahtani',
        customer: { ...input.customer, mobile: '+966541104000' },
      },
      testCfg,
    );
    expect(cardBody.get('card.holder')).toBe('Sara Al Qahtani');
    expect(cardBody.get('customer.mobile')).toBe('+966541104000');
  });

  it('sends no billing on the applepay channel even when the caller supplies a saved address', () => {
    // The auto-prepared checkout posts the guest's stored billing (country
    // defaults to SA) with every method; the builder is the single gate.
    const withBilling = {
      ...input,
      billing: {
        street1: '12 King Fahd Rd',
        city: 'Abha',
        state: '',
        postcode: '62521',
        country: 'SA',
      },
    };
    const body = buildCheckoutBody(withBilling, applePayCfg);
    expect([...body.keys()].filter((key) => key.startsWith('billing.'))).toEqual([]);
    // Cards still carry it — 3DS2 requires the address.
    const cardBody = buildCheckoutBody(withBilling, testCfg);
    expect(cardBody.get('billing.street1')).toBe('12 King Fahd Rd');
    expect(cardBody.get('billing.country')).toBe('SA');
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

  it('omits the test flag on the applepay channel, matching its debits', () => {
    expect(buildRefundBody(100, applePayCfg).get('testMode')).toBeNull();
  });
});
