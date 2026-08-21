import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClaimInput, ClaimResult } from './ledger';

/**
 * Dispatcher tests. `dispatchNotification` is the single doorway every
 * outbound message goes through, so these pin its cross-cutting rules:
 * channel gating (send on whatever is configured AND addressable for
 * the recipient), suppression (ledgered refusal, nothing sent),
 * idempotency (a lost claim sends nothing), outcome stamping (sent vs
 * failed), and the never-throws posture — a notification failure must
 * never break the booking flow that triggered it.
 */

const flags = vi.hoisted(() => ({ email: true, whatsapp: true }));
vi.mock('@/lib/env', () => ({
  hasEmail: () => flags.email,
  hasWhatsApp: () => flags.whatsapp,
}));

const reportError = vi.fn();
vi.mock('@/lib/log', () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));

const sendEmail = vi.fn(
  async (): Promise<{ ok: boolean; id: string | null }> => ({
    ok: true,
    id: 're-1',
  }),
);
vi.mock('@/lib/email', () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...(args as [])),
}));

const claims: ClaimInput[] = [];
let claimResult: ClaimResult = { claimed: true, id: 'del-1' };
let suppressed: Record<string, boolean> = {};
const markDeliverySent = vi.fn(async () => undefined);
const markDeliveryFailed = vi.fn(async () => undefined);
vi.mock('./ledger', () => ({
  claimDelivery: async (input: ClaimInput) => {
    claims.push(input);
    return claimResult;
  },
  isSuppressed: async (channel: string) => Boolean(suppressed[channel]),
  markDeliverySent: (...args: unknown[]) => markDeliverySent(...(args as [])),
  markDeliveryFailed: (...args: unknown[]) => markDeliveryFailed(...(args as [])),
  addSuppression: vi.fn(),
}));

let contentSid: string | null = 'HX-en';
let sidByTemplate: Record<string, string> = {};
let whatsappResult: { ok: true; sid: string } | { ok: false; error: string } = {
  ok: true,
  sid: 'SM-1',
};
const sendWhatsAppTemplate = vi.fn(async () => whatsappResult);
vi.mock('./whatsapp/provider', () => ({
  whatsappContentSid: (template: string) => sidByTemplate[template] ?? contentSid,
  whatsappAddress: (phone: string | null | undefined) => {
    if (!phone) return null;
    const digits = phone.replace(/[^\d]/g, '');
    return digits.length >= 8 && digits.length <= 15 ? `whatsapp:+${digits}` : null;
  },
  sendWhatsAppTemplate: (...args: unknown[]) => sendWhatsAppTemplate(...(args as [])),
}));

import { dispatchNotification, notificationsConfigured } from './dispatch';
import type { DispatchInput } from './types';

function input(overrides: Partial<DispatchInput> = {}): DispatchInput {
  return {
    type: 'booking_confirmed',
    dedupeKey: 'booking_confirmed:GH-7K3M9X',
    bookingId: 'b-1',
    recipient: {
      kind: 'guest',
      email: 'Guest@Example.com',
      phone: '+966 54 110 4000',
      locale: 'en',
    },
    email: { subject: 'Booking confirmed', html: '<p>hi</p>', text: 'hi' },
    whatsapp: { template: 'booking_confirmed', variables: { '1': 'GH-7K3M9X' } },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  claims.length = 0;
  claimResult = { claimed: true, id: 'del-1' };
  suppressed = {};
  contentSid = 'HX-en';
  sidByTemplate = {};
  whatsappResult = { ok: true, sid: 'SM-1' };
  flags.email = true;
  flags.whatsapp = true;
  sendEmail.mockResolvedValue({ ok: true, id: 're-1' });
});

describe('notificationsConfigured', () => {
  it('is true when either channel is configured, false when neither', () => {
    expect(notificationsConfigured()).toBe(true);
    flags.email = false;
    expect(notificationsConfigured()).toBe(true);
    flags.whatsapp = false;
    expect(notificationsConfigured()).toBe(false);
  });
});

describe('dispatchNotification', () => {
  it('fans out to both channels under one dedupeKey and stamps both sent', async () => {
    await dispatchNotification(input());

    expect(claims.map((c) => c.channel).sort()).toEqual(['email', 'whatsapp']);
    for (const claim of claims) {
      expect(claim.dedupeKey).toBe('booking_confirmed:GH-7K3M9X');
      expect(claim.bookingId).toBe('b-1');
      expect(claim.suppressed).toBeUndefined();
    }
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'Guest@Example.com', subject: 'Booking confirmed' }),
    );
    expect(sendWhatsAppTemplate).toHaveBeenCalledWith({
      to: 'whatsapp:+966541104000',
      contentSid: 'HX-en',
      variables: { '1': 'GH-7K3M9X' },
    });
    expect(markDeliverySent).toHaveBeenCalledTimes(2);
    expect(markDeliverySent).toHaveBeenCalledWith('del-1', 'SM-1');
    // The Resend id is stored too — the delivery webhook's correlation key.
    expect(markDeliverySent).toHaveBeenCalledWith('del-1', 're-1');
  });

  it('ledgers the email claim lowercased and the WhatsApp claim as a bare phone', async () => {
    await dispatchNotification(input());

    expect(claims.find((c) => c.channel === 'email')?.recipient).toBe('guest@example.com');
    expect(claims.find((c) => c.channel === 'whatsapp')?.recipient).toBe('+966541104000');
  });

  it('sends email-only for a recipient without a phone', async () => {
    await dispatchNotification(
      input({ recipient: { kind: 'guest', email: 'guest@example.com', locale: 'en' } }),
    );

    expect(claims.map((c) => c.channel)).toEqual(['email']);
    expect(sendWhatsAppTemplate).not.toHaveBeenCalled();
  });

  it('sends WhatsApp-only for a phone-only recipient', async () => {
    await dispatchNotification(
      input({ recipient: { kind: 'guest', phone: '+966541104000', locale: 'ar' } }),
    );

    expect(claims.map((c) => c.channel)).toEqual(['whatsapp']);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('sends nothing when no channel is configured', async () => {
    flags.email = false;
    flags.whatsapp = false;

    await dispatchNotification(input());

    expect(claims).toHaveLength(0);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(sendWhatsAppTemplate).not.toHaveBeenCalled();
  });

  it('ledgers a FAILED row (visible, retryable) when the template has no approved SID', async () => {
    contentSid = null;

    await dispatchNotification(input());

    // 2026-07-31 audit: previously a silent skip with no ledger row — a
    // phone-only guest's missed message was indistinguishable from
    // "nothing happened". Now the claim lands and is failed with a
    // diagnosable reason; the retry sweep re-drives it once the SID
    // lands in the env map.
    expect(claims.map((c) => c.channel)).toEqual(['email', 'whatsapp']);
    expect(sendWhatsAppTemplate).not.toHaveBeenCalled();
    expect(markDeliveryFailed).toHaveBeenCalledWith(
      'del-1',
      'no approved content SID for template/locale',
    );
  });

  it('ledgers a FAILED row instead of sending a template with a blank variable', async () => {
    const payload = input();
    payload.whatsapp = { template: 'booking_confirmed', variables: { '1': 'Ahmad', '2': ' ' } };

    await dispatchNotification(payload);

    expect(sendWhatsAppTemplate).not.toHaveBeenCalled();
    expect(markDeliveryFailed).toHaveBeenCalledWith('del-1', 'blank template variable {{2}}');
  });

  it('falls back to the plain template SID when the preferred variant has none', async () => {
    sidByTemplate = { booking_confirmed: 'HX-plain' };
    contentSid = null; // the preferred *_media key resolves nothing
    const payload = input();
    payload.whatsapp = {
      template: 'booking_confirmed_media',
      fallbackTemplate: 'booking_confirmed',
      variables: { '1': 'Ahmad' },
    };

    await dispatchNotification(payload);

    expect(sendWhatsAppTemplate).toHaveBeenCalledTimes(1);
    expect(sendWhatsAppTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ contentSid: 'HX-plain' }),
    );
  });

  it('ledgers a suppressed address as suppressed and never messages it', async () => {
    suppressed = { email: true };

    await dispatchNotification(input());

    const emailClaim = claims.find((c) => c.channel === 'email');
    expect(emailClaim?.suppressed).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled();
    // The other channel is independent — WhatsApp still goes out.
    expect(sendWhatsAppTemplate).toHaveBeenCalledTimes(1);
  });

  it('sends nothing when the claim is a duplicate (idempotency)', async () => {
    claimResult = { claimed: false, reason: 'duplicate' };

    await dispatchNotification(input());

    expect(sendEmail).not.toHaveBeenCalled();
    expect(sendWhatsAppTemplate).not.toHaveBeenCalled();
    expect(markDeliverySent).not.toHaveBeenCalled();
  });

  it('stamps the ledger failed when a provider rejects', async () => {
    sendEmail.mockResolvedValue({ ok: false, id: null });
    whatsappResult = { ok: false, error: 'HTTP 400: template not approved' };

    await dispatchNotification(input());

    expect(markDeliveryFailed).toHaveBeenCalledWith('del-1', 'resend rejected or unreachable');
    expect(markDeliveryFailed).toHaveBeenCalledWith('del-1', 'HTTP 400: template not approved');
    expect(markDeliverySent).not.toHaveBeenCalled();
  });

  it('generates a unique type-prefixed dedupeKey when the caller omits one', async () => {
    await dispatchNotification(input({ dedupeKey: undefined }));
    await dispatchNotification(input({ dedupeKey: undefined }));

    const keys = claims.map((c) => c.dedupeKey);
    for (const key of keys) expect(key).toMatch(/^booking_confirmed:/);
    // Both channels of one dispatch share the key; the next dispatch gets a fresh one.
    expect(keys[0]).toBe(keys[1]);
    expect(new Set(keys).size).toBe(2);
  });

  it('never throws — a channel blowing up is reported, not propagated', async () => {
    sendEmail.mockRejectedValue(new Error('resend exploded'));
    sendWhatsAppTemplate.mockRejectedValueOnce(new Error('twilio exploded'));

    await expect(dispatchNotification(input())).resolves.toBeUndefined();

    const surfaces = reportError.mock.calls.map((call) => (call[1] as { surface: string }).surface);
    expect(surfaces).toContain('notifications:dispatch-email');
    expect(surfaces).toContain('notifications:dispatch-whatsapp');
  });
});
