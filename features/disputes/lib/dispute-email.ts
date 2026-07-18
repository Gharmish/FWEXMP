import 'server-only';

import { eq } from 'drizzle-orm';
import { getTranslations } from 'next-intl/server';
import { db } from '@/lib/db';
import { hasEmail } from '@/lib/env';
import type { Locale } from '@/lib/i18n';
import { formatSAR } from '@/lib/format';
import { dispatchNotification } from '@/lib/notifications/dispatch';
import { SITE_URL } from '@/lib/site';
import { renderReceiptEmail } from '@/features/bookings/lib/booking-email-render';

/** Brand wordmark for email headers — PNG (clients don't render SVG). */
const EMAIL_LOGO_URL = `${SITE_URL}/images/gharmish-wordmark.png`;

/**
 * Tell the guest their report was handled (the "guest resolution
 * notice" the P2 backlog deferred). Without this, resolution is
 * invisible unless the guest revisits their booking page. The internal
 * `adminNotes` NEVER leaves the admin surface — the notice says the
 * report was handled (and names the refund when one was granted), not
 * what the team wrote about it.
 *
 * Email-only for now: there is no approved WhatsApp template for this
 * flow, and the dispatcher won't send WhatsApp without one. Same
 * posture as the review-reply email: best-effort, gated on email being
 * configured and the guest having an address on file; the resolve
 * action must not fail over it.
 */
export async function sendDisputeResolvedEmail(
  disputeId: string,
  refundAmountSar: number | null,
): Promise<void> {
  if (!hasEmail()) return;

  const dispute = await db.query.disputes.findFirst({
    where: (d) => eq(d.id, disputeId),
    with: { guest: true, booking: { with: { experience: true } } },
  });
  if (!dispute?.guest.email) return;

  const locale = dispute.guest.preferredLanguage as Locale;
  const t = await getTranslations({ locale, namespace: 'disputeEmail' });
  const title =
    locale === 'ar' ? dispute.booking.experience.titleAr : dispute.booking.experience.titleEn;

  const rows = [{ label: t('bookingLabel'), value: `${dispute.booking.referenceCode} — ${title}` }];
  if (refundAmountSar !== null) {
    rows.push({ label: t('refundLabel'), value: formatSAR(refundAmountSar, locale) });
  }

  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject: t('subject'),
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('greeting', { name: dispute.guest.name }),
    intro: refundAmountSar !== null ? t('introWithRefund') : t('intro'),
    rows,
    closing: t('closing'),
    footer: t('footer'),
  });
  await dispatchNotification({
    type: 'dispute_resolved',
    dedupeKey: `dispute_resolved:${disputeId}`,
    bookingId: dispute.bookingId,
    recipient: { kind: 'guest', email: dispute.guest.email, locale },
    email: { subject: t('subject'), html, text },
  });
}
