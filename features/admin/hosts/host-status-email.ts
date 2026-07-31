import 'server-only';

import { getTranslations } from 'next-intl/server';
import { hasEmail } from '@/lib/env';
import { dispatchNotification } from '@/lib/notifications/dispatch';
import { hostNotificationContact } from '@/lib/notifications/host-contact';
import { SITE_URL } from '@/lib/site';
import { renderReceiptEmail, type ReceiptRow } from '@/features/bookings/lib/booking-email-render';

/** Brand wordmark for email headers — PNG (clients don't render SVG). */
const EMAIL_LOGO_URL = `${SITE_URL}/images/gharmish-wordmark.png`;

/**
 * Suspension / reinstatement notices (2026-07-31 audit: suspension
 * paused a host's listings, stopped their guests' reminders, and told
 * the host nothing). The reviewer's note is the schema's "shown to the
 * host" reason, so it goes in the email; omitted when the admin left
 * none. No dedupe keys — a host can be suspended and reinstated more
 * than once, and each flip deserves its notice. Best-effort, email-only.
 */
export async function sendHostSuspendedEmail(
  hostId: string,
  reason: string | null | undefined,
): Promise<void> {
  if (!hasEmail()) return;
  const host = await hostNotificationContact(hostId);
  if (!host?.email) return;

  const t = await getTranslations({ locale: host.locale, namespace: 'hostStatusEmail' });
  const rows: ReceiptRow[] = [];
  if (reason) rows.push({ label: t('reasonLabel'), value: reason });

  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject: t('suspendedSubject'),
    dir: host.locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('greeting', { name: host.name }),
    intro: t('suspendedIntro'),
    rows,
    closing: t('suspendedClosing'),
    footer: t('footer'),
  });
  await dispatchNotification({
    type: 'host_suspended',
    recipient: { kind: 'host', email: host.email, locale: host.locale },
    email: { subject: t('suspendedSubject'), html, text },
  });
}

export async function sendHostReinstatedEmail(hostId: string): Promise<void> {
  if (!hasEmail()) return;
  const host = await hostNotificationContact(hostId);
  if (!host?.email) return;

  const t = await getTranslations({ locale: host.locale, namespace: 'hostStatusEmail' });
  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject: t('reinstatedSubject'),
    dir: host.locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('greeting', { name: host.name }),
    intro: t('reinstatedIntro'),
    rows: [],
    cta: { label: t('reinstatedCta'), url: `${SITE_URL}/${host.locale}/host` },
    closing: t('reinstatedClosing'),
    footer: t('footer'),
  });
  await dispatchNotification({
    type: 'host_reinstated',
    recipient: { kind: 'host', email: host.email, locale: host.locale },
    email: { subject: t('reinstatedSubject'), html, text },
  });
}
