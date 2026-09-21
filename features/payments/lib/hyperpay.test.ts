import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The gateway client's two 2026-09-21 contracts, with `fetch` stubbed:
 *
 *  - `queryPaymentsByReference` answers `[]` ONLY on the gateway's explicit
 *    "cannot find transaction". Settle abandons a booking on an empty
 *    report, so a throttled, unauthorised or broken report must THROW —
 *    an unanswered question is never "nothing was paid".
 *  - a bare HTTP 429 on the status GET folds into the throttle result code,
 *    so every caller has one transient path.
 *
 * Response shapes are the ones the test server returned on 2026-09-21.
 */

vi.mock('server-only', () => ({}));

const env = vi.hoisted(() => ({
  HYPERPAY_ACCESS_TOKEN: 'tok',
  HYPERPAY_ENTITY_ID: 'ent-card',
  HYPERPAY_APPLEPAY_ENTITY_ID: '',
  HYPERPAY_MODE: 'test' as const,
  HYPERPAY_BASE_URL: '',
  HYPERPAY_TEST_CONNECTOR: 'external' as const,
}));
vi.mock('@/lib/env', () => ({ serverEnv: env }));

import { gatewayChannels, getPaymentStatus, queryPaymentsByReference } from './hyperpay';

const REF = '11111111-2222-4333-8444-555555555555';
const fetchMock = vi.fn<(input: URL | string, init?: RequestInit) => Promise<Response>>();

function respond(status: number, body: unknown): void {
  fetchMock.mockResolvedValueOnce(
    new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  env.HYPERPAY_APPLEPAY_ENTITY_ID = '';
});
afterEach(() => vi.unstubAllGlobals());

describe('queryPaymentsByReference', () => {
  it('asks the transaction report for OUR reference on the channel’s entity', async () => {
    respond(200, { result: { code: '000.000.100' }, payments: [] });

    await queryPaymentsByReference(REF, 'card');

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.origin + url.pathname).toBe('https://eu-test.oppwa.com/v1/query');
    expect(url.searchParams.get('entityId')).toBe('ent-card');
    expect(url.searchParams.get('merchantTransactionId')).toBe(REF);
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get('authorization')).toBe('Bearer tok');
  });

  it('returns every entry of a successful report', async () => {
    const payments = [
      { id: 'd1', paymentType: 'DB', result: { code: '100.380.401' }, merchantTransactionId: REF },
      {
        id: 'd2',
        paymentType: 'DB',
        amount: '260.00',
        currency: 'SAR',
        result: { code: '000.100.112' },
        merchantTransactionId: REF,
      },
    ];
    respond(200, { result: { code: '000.000.100', description: 'successful request' }, payments });

    expect(await queryPaymentsByReference(REF)).toEqual(payments);
  });

  it('is empty ONLY on the explicit "cannot find transaction" (HTTP 404, 700.400.580)', async () => {
    respond(404, { result: { code: '700.400.580', description: 'cannot find transaction' } });

    expect(await queryPaymentsByReference(REF)).toEqual([]);
  });

  it('THROWS on anything else — an unanswered report must never read as "nothing was paid"', async () => {
    const unanswered: Array<[number, unknown]> = [
      [429, { result: { code: '800.120.100', description: 'Rejected by Throttling.' } }],
      [401, { result: { code: '800.900.300', description: 'invalid authentication information' } }],
      [403, { result: { code: '800.900.303', description: 'no access' } }],
      [400, { result: { code: '200.300.404', description: 'invalid or missing parameter' } }],
      [502, '<html>Bad gateway</html>'],
      [200, {}],
      // A "successful" envelope with no list is not an empty list.
      [200, { result: { code: '000.000.100' } }],
    ];
    for (const [status, body] of unanswered) {
      respond(status, body);
      await expect(queryPaymentsByReference(REF)).rejects.toThrow(/HyperPay/);
    }
  });
});

describe('gatewayChannels', () => {
  it('is the one entity when Apple Pay has none of its own', () => {
    expect(gatewayChannels('card')).toEqual(['card']);
    // Production today: the variable unset → Apple Pay falls back to the card entity.
    expect(gatewayChannels('applepay')).toEqual(['applepay']);
    // HyperPay's 2026-08-10 arrangement: the variable SET to the card entity id.
    env.HYPERPAY_APPLEPAY_ENTITY_ID = 'ent-card';
    expect(gatewayChannels('card')).toEqual(['card']);
  });

  it('lists both entities, the asked-for channel first, when Apple Pay has its own', () => {
    env.HYPERPAY_APPLEPAY_ENTITY_ID = 'ent-applepay';
    expect(gatewayChannels('card')).toEqual(['card', 'applepay']);
    expect(gatewayChannels('applepay')).toEqual(['applepay', 'card']);
  });
});

describe('getPaymentStatus', () => {
  it('folds a bare HTTP 429 into the throttle result code, whatever the body', async () => {
    respond(429, '<html>Too Many Requests</html>');

    const status = await getPaymentStatus('chk-1');

    expect(status.result.code).toBe('800.120.100');
    expect(status.id).toBe('');
  });

  it('passes the expired-session answer through untouched (HTTP 400, 200.300.404)', async () => {
    respond(400, { result: { code: '200.300.404', description: 'no payment session found' } });

    expect((await getPaymentStatus('chk-1')).result.code).toBe('200.300.404');
  });

  it('still throws on a response with no result code', async () => {
    respond(502, '<html>Bad gateway</html>');
    await expect(getPaymentStatus('chk-1')).rejects.toThrow(/non-JSON/);
  });
});
