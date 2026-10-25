import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getOperators } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { bookings } from '@/db/schema';

/**
 * Sender-side contract of the two dispute acknowledgements (review of
 * #187): `createDispute` hands them the booking's reference UUID, so the
 * lookup must match on `idempotencyKey` with that value, and the email's
 * "Reference" row must show the `GH-` code, never the UUID (the host's
 * email must not carry the guest's manage-link capability at all).
 * actions.test.ts mocks these senders, so without this file the two
 * sides could drift apart again.
 */

vi.mock('server-only', () => ({}));
vi.mock('@/lib/env', () => ({
  hasEmail: () => true,
  serverEnv: { COOKIE_SIGNING_SECRET: 'dispute-email-test-secret', NODE_ENV: 'test' },
}));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => {
    const t = (key: string, values?: Record<string, unknown>) =>
      values ? `${key}(${Object.keys(values).join(',')})` : key;
    return Object.assign(t, { has: () => true, rich: t, raw: t, markup: t });
  },
}));
const dispatchNotification = vi.fn(async () => undefined);
vi.mock('@/lib/notifications/dispatch', () => ({
  dispatchNotification: (...args: unknown[]) => dispatchNotification(...(args as [])),
}));
vi.mock('@/lib/notifications/host-contact', () => ({
  hostNotificationContact: async () => ({
    email: 'host@example.com',
    phone: null,
    locale: 'en',
    name: 'Host',
    prefs: { reminders: true, reviews: true },
  }),
}));

const REFERENCE = '550e8400-e29b-41d4-a716-446655440000';
const CODE = 'GH-TEST01';
type Row = Record<string, unknown>;
const lookups: Array<{ sql: string; params: unknown[] }> = [];
let booking: Row | undefined;
vi.mock('@/lib/db', () => ({
  db: {
    query: {
      bookings: {
        findFirst: async (args: { where: (table: unknown, ops: unknown) => unknown }) => {
          const node = args.where(bookings, getOperators());
          const rendered = new PgDialect().sqlToQuery(node as never);
          lookups.push({ sql: rendered.sql, params: rendered.params });
          return booking;
        },
      },
    },
  },
}));

const { sendDisputeReceivedEmail, sendHostDisputeOpenedEmail } = await import('./dispute-email');

function sentEmail(): { type: string; email: string; html: string; text: string } {
  expect(dispatchNotification).toHaveBeenCalledTimes(1);
  const [payload] = dispatchNotification.mock.calls[0] as unknown as [
    { type: string; recipient: { email: string }; email: { html: string; text: string } },
  ];
  return {
    type: payload.type,
    email: payload.recipient.email,
    html: payload.email.html,
    text: payload.email.text,
  };
}

beforeEach(() => {
  dispatchNotification.mockClear();
  lookups.length = 0;
  booking = {
    id: 'b1',
    idempotencyKey: REFERENCE,
    referenceCode: CODE,
    guest: { email: 'guest@example.com', name: 'Sara', preferredLanguage: 'en' },
    experience: { titleEn: 'Sunrise hike', titleAr: 'رحلة الشروق', hostId: 'h1' },
  };
});

describe('dispute acknowledgements look the booking up by its reference UUID', () => {
  it('guest ack: matches idempotency_key = reference and shows the GH- code', async () => {
    await sendDisputeReceivedEmail(REFERENCE);
    expect(lookups).toHaveLength(1);
    expect(lookups[0].sql).toMatch(/"bookings"\."idempotency_?key" = \$1/i);
    expect(lookups[0].params).toEqual([REFERENCE]);
    const sent = sentEmail();
    expect(sent.type).toBe('dispute_received');
    expect(sent.email).toBe('guest@example.com');
    expect(sent.text).toContain(CODE);
    // The manage CTA is the one place the UUID belongs (it is the page key).
    expect(sent.text).toContain(`/en/book/confirmed/${REFERENCE}`);
    expect(sent.text.replaceAll(`/en/book/confirmed/${REFERENCE}`, '')).not.toContain(REFERENCE);
  });

  it('host notice: matches idempotency_key = reference and never carries the UUID', async () => {
    await sendHostDisputeOpenedEmail(REFERENCE);
    expect(lookups).toHaveLength(1);
    expect(lookups[0].sql).toMatch(/"bookings"\."idempotency_?key" = \$1/i);
    expect(lookups[0].params).toEqual([REFERENCE]);
    const sent = sentEmail();
    expect(sent.type).toBe('host_dispute_opened');
    expect(sent.email).toBe('host@example.com');
    expect(sent.text).toContain(CODE);
    expect(sent.text).not.toContain(REFERENCE);
    expect(sent.html).not.toContain(REFERENCE);
  });

  it('a GH- code finds no booking, so nothing is sent (the bug #187 fixed)', async () => {
    booking = undefined;
    await sendDisputeReceivedEmail(CODE);
    await sendHostDisputeOpenedEmail(CODE);
    expect(lookups.map((l) => l.params)).toEqual([[CODE], [CODE]]);
    expect(dispatchNotification).not.toHaveBeenCalled();
  });
});
