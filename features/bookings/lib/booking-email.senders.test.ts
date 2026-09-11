import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Every lifecycle sender's contract (2026-09 engineering audit TEST-14):
 * the status/contact guard that decides whether a message goes out at
 * all, and — when it does — exactly one dispatch to the right recipient
 * kind, keyed on the booking so the ledger dedupes retries. Rendering is
 * covered by booking-email.test.ts; this file is about the gates.
 */

vi.mock('server-only', () => ({}));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
const env = vi.hoisted(() => ({ hyperpay: true }));
vi.mock('@/lib/env', () => ({
  serverEnv: {
    DATABASE_URL: 'postgres://test',
    BOOKING_LINK_SECRET: 'secret-secret-secret-secret',
  },
  hasHyperpay: () => env.hyperpay,
  hasSupabaseAuth: () => false,
}));
const dispatchNotification = vi.fn(async () => undefined);
vi.mock('@/lib/notifications/dispatch', () => ({
  notificationsConfigured: () => true,
  dispatchNotification: (...args: unknown[]) => dispatchNotification(...(args as [])),
}));
vi.mock('@/lib/notifications/host-contact', () => ({
  applyChannelPrefs: <T>(contact: T) => contact,
}));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => {
    const t = (key: string, values?: Record<string, unknown>) =>
      values ? `${key}(${Object.keys(values).join(',')})` : key;
    return Object.assign(t, { has: () => true, rich: t, raw: t, markup: t });
  },
}));
vi.mock('qrcode', () => ({ default: { toDataURL: async () => 'data:image/png;base64,AA==' } }));
vi.mock('./booking-ics', () => ({ renderBookingIcs: () => 'BEGIN:VCALENDAR\nEND:VCALENDAR' }));
vi.mock('./invoice-pdf', () => ({ renderInvoicePdf: async () => Buffer.from('pdf') }));
vi.mock('@/lib/platform-settings', () => ({
  getPlatformSettings: async () => ({
    vatEnabled: false,
    vatRateBps: 1500,
    refundsViaBankTransfer: true,
  }),
}));
vi.mock('@/features/experiences/queries', () => ({
  getExperienceBySlug: async () => ({
    slug: 'sunrise-hike',
    titleEn: 'Sunrise hike',
    titleAr: 'رحلة الشروق',
    heroImage: null,
    hostName: 'Abdulaziz',
    placeName: 'Old Abha',
    city: 'Abha',
    meetingPointLat: 18.2,
    meetingPointLng: 42.5,
    whatToBring: [],
    whatToBringAr: [],
    inclusions: [],
    durationMinutes: 180,
    priceSar: 100,
  }),
}));

type BookingRow = Record<string, unknown>;
let booking: BookingRow | undefined;
vi.mock('@/features/bookings/queries', () => ({
  getBookingByReference: async () => booking,
}));

let hostRow: Record<string, unknown> | undefined;
vi.mock('@/lib/db', () => ({
  db: {
    query: {
      experiences: { findFirst: async () => hostRow },
      hostApplications: { findFirst: async () => undefined },
    },
  },
}));

import * as senders from './booking-email';

const PAID_AT = '2026-09-10T08:00:00.000Z';
const FUTURE = new Date(Date.now() + 6 * 3_600_000).toISOString();

function base(over: BookingRow = {}): BookingRow {
  return {
    id: 'b1',
    guestId: 'g1',
    reference: 'ref-1',
    referenceCode: 'GH-TEST01',
    status: 'confirmed',
    paymentStatus: 'paid',
    paidAt: PAID_AT,
    paymentDeadline: null,
    approvalDeadline: null,
    partySize: 2,
    totalAmountSar: 200,
    discountSar: 0,
    promoCode: null,
    walletAppliedSar: 0,
    commissionBps: 1500,
    vatRateBps: null,
    vatRegistrationNumber: null,
    invoiceItemEn: null,
    invoiceItemAr: null,
    billedName: null,
    date: '2026-09-20',
    startTime: '09:00',
    experienceSlug: 'sunrise-hike',
    guestName: 'Sara',
    guestEmail: 'sara@example.com',
    guestPhone: '+966500000001',
    guestPreferredLanguage: 'en',
    termsAcceptedAt: null,
    termsVersion: null,
    settleAnomalyAt: null,
    checkoutSupersededAt: null,
    paymentBrand: null,
    cancelledAt: null,
    cancellationReason: null,
    refundedAmountSar: null,
    refundDueSar: null,
    hostPaidAt: null,
    policy: {
      policyTier: 'moderate',
      freeCancelHours: 48,
      partialRefundHours: 24,
      partialRefundBps: 5000,
      rescheduleCutoffHours: 24,
    },
    ...over,
  };
}

const NO_CONTACT = { guestEmail: null, guestPhone: null };

beforeEach(() => {
  dispatchNotification.mockClear();
  env.hyperpay = true;
  booking = base();
  hostRow = {
    titleEn: 'Sunrise hike',
    titleAr: 'رحلة الشروق',
    host: {
      id: 'h1',
      languages: ['en'],
      contactEmail: 'host@example.com',
      contactPhone: '+966500000002',
      notifyEmail: true,
      notifyWhatsapp: true,
      notifyReminders: true,
      notifyReviews: true,
    },
  };
});

type Sent = { type: string; dedupeKey: string; recipient: { kind: string; locale?: string } };
const sent = (): Sent[] => dispatchNotification.mock.calls.map((c) => (c as unknown as [Sent])[0]);

interface Case {
  name: string;
  run: () => Promise<void>;
  ok: BookingRow;
  blocked: BookingRow;
  kind: 'guest' | 'host';
  /** Senders that also notify the other party. */
  also?: 'host' | 'guest';
}

const GUEST_CASES: Case[] = [
  {
    name: 'sendBookingReceiptEmail',
    run: () => senders.sendBookingReceiptEmail('ref-1'),
    ok: {},
    blocked: { paidAt: null },
    kind: 'guest',
  },
  {
    name: 'sendBookingCancellationEmail',
    run: () => senders.sendBookingCancellationEmail('ref-1', 'refunded'),
    ok: { status: 'cancelled' },
    blocked: NO_CONTACT,
    kind: 'guest',
  },
  {
    name: 'sendBookingRescheduledEmail',
    run: () => senders.sendBookingRescheduledEmail('ref-1', '2026-09-15'),
    ok: {},
    blocked: NO_CONTACT,
    kind: 'guest',
  },
  {
    name: 'sendBookingPrepareReminderEmail',
    run: () => senders.sendBookingPrepareReminderEmail('ref-1', 'en'),
    ok: {},
    blocked: { paymentStatus: 'unpaid', paymentDeadline: FUTURE },
    kind: 'guest',
    also: 'host',
  },
  {
    name: 'sendBookingDepartureReminderEmail',
    run: () => senders.sendBookingDepartureReminderEmail('ref-1', 'en'),
    ok: {},
    blocked: { status: 'cancelled' },
    kind: 'guest',
  },
  {
    name: 'sendBookingRequestReceivedEmail',
    run: () => senders.sendBookingRequestReceivedEmail('ref-1'),
    ok: { status: 'pending', paymentStatus: 'unpaid', paidAt: null, approvalDeadline: FUTURE },
    blocked: { status: 'confirmed' },
    kind: 'guest',
  },
  {
    name: 'sendBookingApprovedEmail',
    run: () => senders.sendBookingApprovedEmail('ref-1'),
    ok: { status: 'confirmed', paymentStatus: 'unpaid', paidAt: null, paymentDeadline: FUTURE },
    blocked: { status: 'pending' },
    kind: 'guest',
  },
  {
    name: 'sendBookingAwaitingPaymentEmail',
    run: () => senders.sendBookingAwaitingPaymentEmail('ref-1', 'created'),
    ok: { paymentStatus: 'unpaid', paidAt: null, paymentDeadline: FUTURE },
    blocked: { paymentStatus: 'paid' },
    kind: 'guest',
  },
  {
    name: 'sendBookingDeclinedEmail',
    run: () => senders.sendBookingDeclinedEmail('ref-1'),
    ok: { status: 'declined', paymentStatus: 'unpaid', paidAt: null },
    blocked: { status: 'pending' },
    kind: 'guest',
  },
  {
    name: 'sendBookingExpiredEmail',
    run: () => senders.sendBookingExpiredEmail('ref-1'),
    ok: { status: 'expired', paymentStatus: 'unpaid', paidAt: null },
    blocked: { status: 'pending' },
    kind: 'guest',
  },
  {
    name: 'sendBookingPaymentLapsedEmail',
    run: () => senders.sendBookingPaymentLapsedEmail('ref-1'),
    ok: { status: 'cancelled', paymentStatus: 'unpaid', paidAt: null },
    blocked: { status: 'confirmed' },
    kind: 'guest',
  },
  {
    name: 'sendBookingOnHoldEmail',
    run: () => senders.sendBookingOnHoldEmail('ref-1'),
    ok: {},
    blocked: { status: 'completed' },
    kind: 'guest',
  },
  {
    name: 'sendBookingPaymentFailedEmail',
    run: () => senders.sendBookingPaymentFailedEmail('ref-1'),
    ok: { paymentStatus: 'failed', paidAt: null, paymentDeadline: FUTURE },
    blocked: { paymentStatus: 'paid' },
    kind: 'guest',
  },
];

const HOST_CASES: Case[] = [
  {
    name: 'sendHostNewBookingEmail',
    run: () => senders.sendHostNewBookingEmail('ref-1'),
    ok: {},
    blocked: { experienceSlug: null },
    kind: 'host',
  },
  {
    name: 'sendHostGuestCancelledEmail',
    run: () => senders.sendHostGuestCancelledEmail('ref-1'),
    ok: { status: 'cancelled' },
    blocked: { experienceSlug: null },
    kind: 'host',
  },
  {
    name: 'sendHostBookingRescheduledEmail',
    run: () => senders.sendHostBookingRescheduledEmail('ref-1', '2026-09-15'),
    ok: {},
    blocked: { experienceSlug: null },
    kind: 'host',
  },
  {
    name: 'sendHostHoldLapsedEmail',
    run: () => senders.sendHostHoldLapsedEmail('ref-1'),
    ok: { status: 'cancelled', paymentStatus: 'unpaid', paidAt: null },
    blocked: { experienceSlug: null },
    kind: 'host',
  },
  {
    name: 'sendHostPaymentReceivedEmail',
    run: () => senders.sendHostPaymentReceivedEmail('ref-1'),
    ok: {},
    blocked: { experienceSlug: null },
    kind: 'host',
  },
  {
    name: 'sendHostBookingCancelledEmail',
    run: () => senders.sendHostBookingCancelledEmail('ref-1'),
    ok: { status: 'cancelled' },
    blocked: { experienceSlug: null },
    kind: 'host',
  },
];

describe.each([...GUEST_CASES, ...HOST_CASES])('$name', (c) => {
  it('dispatches once per party, to the right recipient, keyed on the booking', async () => {
    booking = base(c.ok);
    await c.run();
    const calls = sent();
    const kinds = calls.map((call) => call.recipient.kind).sort();
    expect(kinds).toEqual([c.kind, ...(c.also ? [c.also] : [])].sort());
    for (const call of calls) {
      expect(call.dedupeKey).toMatch(/GH-TEST01|ref-1/);
      expect(call.type).toMatch(/^[a-z0-9_]+$/);
      if (call.recipient.kind === 'guest') expect(call.recipient.locale).toBe('en');
    }
  });

  it('sends nothing when the guard says the state is wrong', async () => {
    booking = base(c.blocked);
    await c.run();
    expect(sent()).toHaveLength(0);
  });

  it('sends nothing when the booking is gone', async () => {
    booking = undefined;
    await c.run();
    expect(sent()).toHaveLength(0);
  });
});

describe('host senders without a reachable host', () => {
  it('skip when the experience has no host contact', async () => {
    hostRow = undefined;
    await senders.sendHostNewBookingEmail('ref-1');
    expect(sent()).toHaveLength(0);
  });
});

describe('sendBookingCompletedEmails', () => {
  it('invites the guest to review and thanks the host', async () => {
    booking = base({ status: 'completed' });
    await senders.sendBookingCompletedEmails('ref-1');
    const kinds = sent()
      .map((c) => c.recipient.kind)
      .sort();
    expect(kinds).toEqual(['guest', 'host']);
  });

  it('is silent for a booking that is not completed', async () => {
    booking = base({ status: 'confirmed' });
    await senders.sendBookingCompletedEmails('ref-1');
    expect(sent()).toHaveLength(0);
  });
});

describe('reminders honour the payment gate (GAPA-02)', () => {
  it('with payments off, a hold-less confirmed booking is still reminded', async () => {
    env.hyperpay = false;
    booking = base({ paymentStatus: 'unpaid', paidAt: null, paymentDeadline: null });
    await senders.sendBookingPrepareReminderEmail('ref-1', 'en');
    expect(
      sent()
        .map((c) => c.recipient.kind)
        .sort(),
    ).toEqual(['guest', 'host']);
  });

  it('with payments on, an unpaid confirmed booking is never reminded', async () => {
    booking = base({ paymentStatus: 'unpaid', paidAt: null, paymentDeadline: null });
    await senders.sendBookingPrepareReminderEmail('ref-1', 'en');
    expect(sent()).toHaveLength(0);
  });
});
