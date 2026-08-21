import 'server-only';

import { getTranslations } from 'next-intl/server';
import { formatInteger, formatSAR } from '@/lib/format';
import { waMoney, whatsappPayload } from '@/lib/notifications/whatsapp';
import { dispatchNotification, notificationsConfigured } from '@/lib/notifications/dispatch';
import { hostNotificationContact } from '@/lib/notifications/host-contact';
import { SITE_URL } from '@/lib/site';
import { renderReceiptEmail } from '@/features/bookings/lib/booking-email-render';

/** Brand wordmark for email headers — PNG (clients don't render SVG). */
const EMAIL_LOGO_URL = `${SITE_URL}/images/gharmish-email-logo.png`;

/**
 * "Your payout has been sent" (2026-07-31 audit: hosts learned about
 * transfers only by checking the dashboard). Fired when an admin marks
 * a payout batch paid; deduped on the batch id, so a retried action
 * can't double-send. Best-effort, email-only.
 */
export async function sendHostPayoutPaidEmail(input: {
  hostId: string;
  payoutId: string;
  amountSar: number;
  bookingCount: number;
  /** Last 4 of the destination IBAN for the WhatsApp hint; never the full number. */
  ibanLast4?: string | null;
}): Promise<void> {
  if (!notificationsConfigured()) return;
  const host = await hostNotificationContact(input.hostId);
  if (!host?.email && !host?.phone) return;
  if (!host) return;

  const t = await getTranslations({ locale: host.locale, namespace: 'payoutEmail' });
  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject: t('paidSubject'),
    dir: host.locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('greeting', { name: host.name }),
    intro: t('paidIntro'),
    rows: [
      { label: t('amountLabel'), value: formatSAR(input.amountSar, host.locale) },
      { label: t('bookingsLabel'), value: formatInteger(input.bookingCount, host.locale) },
    ],
    cta: { label: t('earningsCta'), url: `${SITE_URL}/${host.locale}/host/earnings` },
    closing: t('paidClosing'),
    footer: t('footer'),
  });
  await dispatchNotification({
    type: 'host_payout_paid',
    dedupeKey: `host_payout_paid:${input.payoutId}`,
    recipient: { kind: 'host', email: host.email, phone: host.phone, locale: host.locale },
    email: host.email ? { subject: t('paidSubject'), html, text } : undefined,
    whatsapp: whatsappPayload(
      'host_payout_sent',
      host.locale,
      {
        amount: waMoney(input.amountSar, host.locale),
        bankHint: input.ibanLast4
          ? host.locale === 'ar'
            ? `إلى حسابك المنتهي بـ ${input.ibanLast4}`
            : `to your account ending ${input.ibanLast4}`
          : host.locale === 'ar'
            ? 'إلى حسابك البنكي المسجل لدينا'
            : 'to the bank account on file',
        earningsPath: `${host.locale}/host/earnings`,
      },
      { payoutId: input.payoutId },
    ),
  });
}
