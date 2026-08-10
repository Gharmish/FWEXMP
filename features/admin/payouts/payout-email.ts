import 'server-only';

import { getTranslations } from 'next-intl/server';
import { hasEmail } from '@/lib/env';
import { formatInteger, formatSAR } from '@/lib/format';
import { dispatchNotification } from '@/lib/notifications/dispatch';
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
}): Promise<void> {
  if (!hasEmail()) return;
  const host = await hostNotificationContact(input.hostId);
  if (!host?.email) return;

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
    recipient: { kind: 'host', email: host.email, locale: host.locale },
    email: { subject: t('paidSubject'), html, text },
  });
}
