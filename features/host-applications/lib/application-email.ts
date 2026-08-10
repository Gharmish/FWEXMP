import 'server-only';

import { getTranslations } from 'next-intl/server';
import { hasEmail } from '@/lib/env';
import type { Locale } from '@/lib/i18n';
import { dispatchNotification } from '@/lib/notifications/dispatch';
import { SITE_URL } from '@/lib/site';
import { renderReceiptEmail } from '@/features/bookings/lib/booking-email-render';

/** Brand wordmark for email headers — PNG (clients don't render SVG). */
const EMAIL_LOGO_URL = `${SITE_URL}/images/gharmish-email-logo.png`;

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
    intro: t('approvedIntro'),
    rows: [],
    cta: { label: t('approvedCta'), url: `${SITE_URL}/${locale}/host` },
    closing: t('approvedClosing'),
    footer: t('footer'),
  });
  // No dedupeKey on purpose: an application can be decided again after a
  // resubmit cycle, and each decision deserves its notice. Still ledgered.
  await dispatchNotification({
    type: 'application_approved',
    recipient: { kind: 'applicant', email: recipient.contactEmail, locale },
    email: { subject: t('approvedSubject'), html, text },
  });
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
    intro: t('rejectedIntro'),
    rows: [],
    cta: { label: t('rejectedCta'), url: `${SITE_URL}/${locale}/host/apply` },
    closing: t('rejectedClosing'),
    footer: t('footer'),
  });
  // No dedupeKey — same resubmit-cycle rationale as the approval notice.
  await dispatchNotification({
    type: 'application_rejected',
    recipient: { kind: 'applicant', email: recipient.contactEmail, locale },
    email: { subject: t('rejectedSubject'), html, text },
  });
}

/**
 * Acknowledge a submitted application (2026-07-31 audit: applicants got
 * only a redirect page — nothing they could keep or forward). Fired on
 * EVERY submission including resubmits after a rejection; each one
 * deserves its receipt, so no dedupe key (mirrors the decision notices).
 */
export async function sendApplicationReceivedEmail(
  recipient: ApplicationDecisionRecipient,
): Promise<void> {
  if (!hasEmail() || !recipient.contactEmail) return;

  const locale = localeFor(recipient.languages);
  const t = await getTranslations({ locale, namespace: 'hostApplicationEmail' });
  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject: t('receivedSubject'),
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('greeting', { name: recipient.displayName }),
    intro: t('receivedIntro'),
    rows: [],
    cta: { label: t('receivedCta'), url: `${SITE_URL}/${locale}/host/apply` },
    closing: t('receivedClosing'),
    footer: t('footer'),
  });
  await dispatchNotification({
    type: 'application_received',
    recipient: { kind: 'applicant', email: recipient.contactEmail, locale },
    email: { subject: t('receivedSubject'), html, text },
  });
}
