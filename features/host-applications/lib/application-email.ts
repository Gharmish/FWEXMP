import 'server-only';

import { getTranslations } from 'next-intl/server';
import { hasEmail } from '@/lib/env';
import type { Locale } from '@/lib/i18n';
import { sendEmail } from '@/lib/email';
import { SITE_URL } from '@/lib/site';
import { renderReceiptEmail } from '@/features/bookings/lib/booking-email-render';

/** Brand wordmark for email headers — PNG (clients don't render SVG). */
const EMAIL_LOGO_URL = `${SITE_URL}/images/gharmish-wordmark.png`;

export interface ApplicationDecisionRecipient {
  contactEmail: string | null;
  displayName: string;
  languages: readonly string[];
}

/** Hosts are Arabic-first: only an explicit leading 'en' flips the locale. */
function localeFor(languages: readonly string[]): Locale {
  return languages[0] === 'en' ? 'en' : 'ar';
}

/**
 * Application decision notices. Without these the applicant must poll
 * /host/apply to learn they were approved (or why they were rejected).
 * Best-effort and gated like every sender — never throws upward,
 * no-ops without email config or a contact address.
 */
export async function sendApplicationApprovedEmail(
  recipient: ApplicationDecisionRecipient,
): Promise<void> {
  if (!hasEmail() || !recipient.contactEmail) return;

  const locale = localeFor(recipient.languages);
  const t = await getTranslations({ locale, namespace: 'hostApplicationEmail' });
  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject: t('approvedSubject'),
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('greeting', { name: recipient.displayName }),
    intro: t('approvedIntro', { url: `${SITE_URL}/${locale}/host` }),
    rows: [],
    closing: t('approvedClosing'),
    footer: t('footer'),
  });
  await sendEmail({ to: recipient.contactEmail, subject: t('approvedSubject'), html, text });
}

/**
 * Rejection notice. The reviewer's note is deliberately not embedded —
 * the email links to /host/apply, where the note renders in-product and
 * the host can revise and resubmit.
 */
export async function sendApplicationRejectedEmail(
  recipient: ApplicationDecisionRecipient,
): Promise<void> {
  if (!hasEmail() || !recipient.contactEmail) return;

  const locale = localeFor(recipient.languages);
  const t = await getTranslations({ locale, namespace: 'hostApplicationEmail' });
  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject: t('rejectedSubject'),
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('greeting', { name: recipient.displayName }),
    intro: t('rejectedIntro', { url: `${SITE_URL}/${locale}/host/apply` }),
    rows: [],
    closing: t('rejectedClosing'),
    footer: t('footer'),
  });
  await sendEmail({ to: recipient.contactEmail, subject: t('rejectedSubject'), html, text });
}
