import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * MONEY-01 (2026-10-17 scan): a dispute refund approved on the manual
 * bank-transfer rail is queued with no payee — the dispute form never
 * collects bank details — so the resolution notice must ask for them,
 * exactly as the cancellation email does, instead of promising to
 * confirm "as soon as it's on its way".
 */

vi.mock('server-only', () => ({}));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => {
    const t = (key: string, values?: Record<string, unknown>) =>
      values ? `${key}(${Object.keys(values).join(',')})` : key;
    return Object.assign(t, { has: () => true, rich: t, raw: t, markup: t });
  },
}));
vi.mock('@/lib/env', () => ({ hasEmail: () => true }));
const settings = vi.hoisted(() => ({ refundsViaBankTransfer: true }));
vi.mock('@/lib/platform-settings', () => ({
  getPlatformSettings: async () => settings,
}));
vi.mock('@/lib/booking-link-token', () => ({
  bookingManageUrl: (locale: string, ref: string) => `manage:${locale}:${ref}`,
}));
vi.mock('@/lib/notifications/host-contact', () => ({ hostNotificationContact: async () => null }));
const sent = vi.hoisted(() => ({ calls: [] as Array<Record<string, unknown>> }));
vi.mock('@/lib/notifications/dispatch', () => ({
  dispatchNotification: async (input: Record<string, unknown>) => {
    sent.calls.push(input);
  },
}));
const row = vi.hoisted(() => ({ dispute: {} as Record<string, unknown> }));
vi.mock('@/lib/db', () => ({
  db: { query: { disputes: { findFirst: async () => row.dispute } } },
}));

import { sendDisputeResolvedEmail } from './dispute-email';

const dispute = (booking: Record<string, unknown> = {}) => ({
  id: 'd-1',
  bookingId: 'b-1',
  guest: { email: 'g@example.com', name: 'Noura', preferredLanguage: 'en' },
  booking: {
    id: 'b-1',
    idempotencyKey: '11111111-1111-4111-8111-111111111111',
    referenceCode: 'GH-TESTAA',
    refundBankName: null,
    refundBeneficiaryName: null,
    refundIban: null,
    experience: { titleEn: 'Sunrise hike', titleAr: 'رحلة الشروق' },
    ...booking,
  },
});

const lastEmail = () => sent.calls.at(-1)?.email as { html: string; text: string };

beforeEach(() => {
  sent.calls = [];
  settings.refundsViaBankTransfer = true;
  row.dispute = dispute();
});

describe('sendDisputeResolvedEmail', () => {
  it('asks for bank details when the refund is queued on the manual rail with no payee on file', async () => {
    await sendDisputeResolvedEmail('d-1', 400, 'refund_pending');
    expect(lastEmail().html).toContain('introWithRefundPendingNeedsBank');
    expect(lastEmail().html).toContain('addBankDetailsCta');
    expect(lastEmail().html).toContain('manage:en:11111111-1111-4111-8111-111111111111');
    expect(lastEmail().html).not.toContain('viewBookingCta');
  });

  it('keeps the plain pending wording once the payee is on file', async () => {
    row.dispute = dispute({
      refundBankName: 'Al Rajhi',
      refundBeneficiaryName: 'Noura A',
      refundIban: 'enc:SA00',
    });
    await sendDisputeResolvedEmail('d-1', 400, 'refund_pending');
    expect(lastEmail().html).toContain('introWithRefundPending');
    expect(lastEmail().html).not.toContain('introWithRefundPendingNeedsBank');
    expect(lastEmail().html).toContain('viewBookingCta');
  });

  it('with the gateway rail on, a pending refund needs no bank details', async () => {
    settings.refundsViaBankTransfer = false;
    await sendDisputeResolvedEmail('d-1', 400, 'refund_pending');
    expect(lastEmail().html).not.toContain('NeedsBank');
    expect(lastEmail().html).toContain('viewBookingCta');
  });

  it('a gateway-reversed refund and a no-refund resolution are unchanged', async () => {
    await sendDisputeResolvedEmail('d-1', 400, 'refunded');
    expect(lastEmail().html).toContain('introWithRefund');
    expect(lastEmail().html).not.toContain('Pending');
    await sendDisputeResolvedEmail('d-1', null);
    expect(lastEmail().html).toContain('intro');
    expect(lastEmail().html).not.toContain('introWithRefund');
  });
});
