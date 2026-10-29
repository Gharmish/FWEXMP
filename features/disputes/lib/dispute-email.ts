import 'server-only';

import { eq } from 'drizzle-orm';
import { getTranslations } from 'next-intl/server';
import { db } from '@/lib/db';
import { hasEmail } from '@/lib/env';
import type { Locale } from '@/lib/i18n';
import { formatSAR } from '@/lib/format';
import { getPlatformSettings } from '@/lib/platform-settings';
import { dispatchNotification } from '@/lib/notifications/dispatch';
import { hostNotificationContact } from '@/lib/notifications/host-contact';
import { SITE_URL } from '@/lib/site';
import { renderReceiptEmail } from '@/features/bookings/lib/booking-email-render';
import { bookingManageUrl } from '@/lib/booking-link-token';

/** Brand wordmark for email headers — PNG (clients don't render SVG). */
const EMAIL_LOGO_URL = `${SITE_URL}/images/gharmish-email-logo.png`;

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
  /**
   * What actually happened to the money. `refund_pending` means the
   * gateway refused or was unreachable and the reversal is sitting in
   * the admin's manual queue — the guest must NOT be told it's already
   * on its way to their card (2026-07-28 third audit). Omitted when no
   * refund was granted.
   */
  refundOutcome?: 'refunded' | 'refund_pending',
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

  // Title and reference as separate rows — one cell mixing an Arabic
  // title with a Latin reference around an em dash reorders in RTL.
  const rows = [
    { label: t('bookingLabel'), value: title },
    { label: t('referenceLabel'), value: dispute.booking.referenceCode },
  ];
  if (refundAmountSar !== null) {
    rows.push({ label: t('refundLabel'), value: formatSAR(refundAmountSar, locale) });
  }

  // A queued refund on the manual bank-transfer rail cannot move until
  // the guest says where to send it (2026-10-17 scan, MONEY-01): the
  // dispute form collects no bank details, so a pending refund with no
  // payee on file must ask for them — the same needs-bank branch the
  // cancellation email takes — instead of promising to "confirm as soon
  // as it's on its way". Same settings read as executeRefund; it
  // degrades to the manual default on error.
  const payeeOnFile =
    Boolean(dispute.booking.refundBankName) &&
    Boolean(dispute.booking.refundBeneficiaryName) &&
    Boolean(dispute.booking.refundIban);
  const needsBank =
    refundAmountSar !== null &&
    refundOutcome === 'refund_pending' &&
    !payeeOnFile &&
    (await getPlatformSettings()).refundsViaBankTransfer;

  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject: t('subject'),
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('greeting', { name: dispute.guest.name }),
    intro:
      refundAmountSar === null
        ? t('intro')
        : refundOutcome === 'refund_pending'
          ? t(needsBank ? 'introWithRefundPendingNeedsBank' : 'introWithRefundPending')
          : t('introWithRefund'),
    rows,
    cta: {
      // The bank-details form lives on the tokened booking page, which
      // is where this link already pointed.
      label: t(needsBank ? 'addBankDetailsCta' : 'viewBookingCta'),
      // The URL takes the reference UUID, never the GH- code: the page
      // 404s on anything that isn't UUID-shaped (2026-08-09).
      url: bookingManageUrl(locale, dispute.booking.idempotencyKey),
    },
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

/**
 * Acknowledge a guest's report the moment it lands (2026-07-31 audit:
 * only the admin inbox heard about new disputes — the guest who wrote
 * one got silence until resolution). No dedupe key: a booking can be
 * disputed again after an earlier report was resolved, and each deserves
 * its ack. Best-effort, email-only.
 */
export async function sendDisputeReceivedEmail(reference: string): Promise<void> {
  if (!hasEmail()) return;

  const booking = await db.query.bookings.findFirst({
    where: (b) => eq(b.idempotencyKey, reference),
    columns: { id: true, idempotencyKey: true, referenceCode: true },
    with: { guest: true, experience: { columns: { titleEn: true, titleAr: true } } },
  });
  if (!booking?.guest.email) return;

  const locale = booking.guest.preferredLanguage as Locale;
  const t = await getTranslations({ locale, namespace: 'disputeEmail' });
  const title = locale === 'ar' ? booking.experience.titleAr : booking.experience.titleEn;

  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject: t('receivedSubject'),
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('greeting', { name: booking.guest.name }),
    intro: t('receivedIntro'),
    rows: [
      { label: t('bookingLabel'), value: title },
      { label: t('referenceLabel'), value: booking.referenceCode },
    ],
    cta: {
      label: t('viewBookingCta'),
      url: bookingManageUrl(locale, booking.idempotencyKey),
    },
    closing: t('receivedClosing'),
    footer: t('footer'),
  });
  await dispatchNotification({
    type: 'dispute_received',
    bookingId: booking.id,
    recipient: { kind: 'guest', email: booking.guest.email, locale },
    email: { subject: t('receivedSubject'), html, text },
  });
}

/**
 * Tell the host a guest reported a problem on their booking. The
 * guest's message deliberately stays out of the email (same posture as
 * adminNotes) — the team mediates; the host just needs to know a review
 * of that booking is underway. No dedupe key, same re-dispute rationale
 * as the guest ack. Best-effort, email-only.
 */
export async function sendHostDisputeOpenedEmail(reference: string): Promise<void> {
  if (!hasEmail()) return;

  const booking = await db.query.bookings.findFirst({
    where: (b) => eq(b.idempotencyKey, reference),
    columns: { id: true, idempotencyKey: true, referenceCode: true },
    with: { experience: { columns: { titleEn: true, titleAr: true, hostId: true } } },
  });
  if (!booking) return;
  const host = await hostNotificationContact(booking.experience.hostId, { critical: true });
  if (!host?.email) return;

  const t = await getTranslations({ locale: host.locale, namespace: 'disputeEmail' });
  const title = host.locale === 'ar' ? booking.experience.titleAr : booking.experience.titleEn;

  const subject = t('hostOpenedSubject', { experience: title });
  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject,
    dir: host.locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('hostGreeting', { name: host.name }),
    intro: t('hostOpenedIntro'),
    rows: [
      { label: t('bookingLabel'), value: title },
      { label: t('referenceLabel'), value: booking.referenceCode },
    ],
    closing: t('hostOpenedClosing'),
    footer: t('footer'),
  });
  await dispatchNotification({
    type: 'host_dispute_opened',
    bookingId: booking.id,
    recipient: { kind: 'host', email: host.email, locale: host.locale },
    email: { subject, html, text },
  });
}
