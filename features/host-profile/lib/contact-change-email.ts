import 'server-only';

import { eq } from 'drizzle-orm';
import { getTranslations } from 'next-intl/server';
import { db } from '@/lib/db';
import { hasEmail, supportWhatsappE164 } from '@/lib/env';
import type { Locale } from '@/lib/i18n';
import { reportError } from '@/lib/log';
import { dispatchNotification } from '@/lib/notifications/dispatch';
import { SITE_URL } from '@/lib/site';
import { whatsappLink } from '@/lib/whatsapp';
import { hosts } from '@/db/schema';
import { renderReceiptEmail, type ReceiptRow } from '@/features/bookings/lib/booking-email-render';

/** Brand wordmark for email headers — PNG (clients don't render SVG). */
const EMAIL_LOGO_URL = `${SITE_URL}/images/gharmish-email-logo.png`;

export type HostContactChange =
  | { kind: 'phone'; previous: string | null; next: string }
  | { kind: 'email'; previous: string | null; next: string }
  | { kind: 'prefs'; summary: string };

/** `+966559002592` → `+9665•••••92`; an email → `a•••@domain`. */
export function maskContact(value: string | null): string {
  if (!value) return '—';
  if (value.includes('@')) {
    const [local, domain] = value.split('@');
    return `${local.slice(0, 1)}•••@${domain}`;
  }
  if (value.length <= 6) return value;
  return `${value.slice(0, 5)}${'•'.repeat(Math.max(2, value.length - 7))}${value.slice(-2)}`;
}

/**
 * "Your contact details changed" notice (2026-08-22 review). Proving a
 * NEW number shows the host can receive codes there; it says nothing
 * about who is driving the session. So every change to where
 * notifications go is announced to the PREVIOUS address — the old
 * email (and the new one), with the support line to revert. Email only:
 * no approved WhatsApp template exists for this, and the email channel
 * is exactly the one a phone hijacker doesn't control. Bypasses channel
 * toggles (account-critical). Best-effort, never throws.
 */
export async function sendHostContactChangedEmail(
  hostId: string,
  change: HostContactChange,
  recipients: { previousEmail: string | null; currentEmail: string | null },
): Promise<void> {
  if (!hasEmail()) return;
  try {
    const host = await db.query.hosts.findFirst({
      where: eq(hosts.id, hostId),
      columns: { name: true, languages: true },
    });
    if (!host) return;
    const locale: Locale = host.languages[0] === 'en' ? 'en' : 'ar';
    const t = await getTranslations({ locale, namespace: 'hostContactChangedEmail' });

    const rows: ReceiptRow[] = [];
    if (change.kind === 'phone') {
      rows.push({ label: t('previousPhone'), value: maskContact(change.previous) });
      rows.push({ label: t('newPhone'), value: maskContact(change.next) });
    } else if (change.kind === 'email') {
      rows.push({ label: t('previousEmail'), value: maskContact(change.previous) });
      rows.push({ label: t('newEmail'), value: maskContact(change.next) });
    } else {
      rows.push({ label: t('prefsLabel'), value: change.summary });
    }
    const support = supportWhatsappE164();
    const supportUrl = support ? whatsappLink(support, t('supportMessage', { name: host.name })) : null;
    const subject = t(`subject.${change.kind}`);
    const { html, text } = renderReceiptEmail({
      logoUrl: EMAIL_LOGO_URL,
      subject,
      dir: locale === 'ar' ? 'rtl' : 'ltr',
      greeting: t('greeting', { name: host.name }),
      intro: t(`intro.${change.kind}`),
      rows,
      cta: supportUrl ? { label: t('cta'), url: supportUrl } : undefined,
      closing: t('closing'),
      footer: t('footer'),
    });

    const targets = new Set<string>();
    if (recipients.previousEmail) targets.add(recipients.previousEmail.toLowerCase());
    if (recipients.currentEmail) targets.add(recipients.currentEmail.toLowerCase());
    await Promise.all(
      [...targets].map((email) =>
        dispatchNotification({
          type: `host_contact_changed_${change.kind}`,
          recipient: { kind: 'host', email, locale },
          email: { subject, html, text },
        }),
      ),
    );
  } catch (error) {
    reportError(error, { surface: 'host-profile:contactChangedEmail', hostId });
  }
}
