import 'server-only';

import { eq } from 'drizzle-orm';
import { getTranslations } from 'next-intl/server';
import { db } from '@/lib/db';
import { hasEmail, hasHyperpay } from '@/lib/env';
import type { Locale } from '@/lib/i18n';
import { formatDate, formatInteger, formatSAR, formatTime } from '@/lib/format';
import { sendEmail } from '@/lib/email';
import { SITE_URL } from '@/lib/site';
import { hostApplications } from '@/db/schema';
import { getBookingByReference } from '@/features/bookings/queries';
import { vatPortionSar, vatRatePercent } from '@/features/bookings/lib/vat';
import { splitCommission } from '@/features/bookings/lib/availability';
import { getExperienceBySlug } from '@/features/experiences/queries';
import { toArabicText } from '@/features/experiences/lib/arabic-content';
import { renderReceiptEmail, type ReceiptRow } from './booking-email-render';

/** Brand wordmark for email headers — PNG (clients don't render SVG). */
const EMAIL_LOGO_URL = `${SITE_URL}/images/gharmish-wordmark.png`;

/**
 * Send the "payment received / booking confirmed" receipt for a settled
 * booking. Best-effort and fully gated: a no-op when email is unconfigured or
 * the guest has no email on file (phone-only guests). Never throws — the
 * caller (the payment return route) must not fail a paid booking over a
 * receipt.
 */
export async function sendBookingReceiptEmail(reference: string, locale: Locale): Promise<void> {
  if (!hasEmail()) return;

  const booking = await getBookingByReference(reference);
  if (!booking?.guestEmail) return;

  const experience = booking.experienceSlug
    ? await getExperienceBySlug(booking.experienceSlug)
    : undefined;
  const title = experience ? (locale === 'ar' ? experience.titleAr : experience.titleEn) : null;
  const placeName = experience
    ? locale === 'ar'
      ? toArabicText(experience.placeName)
      : experience.placeName
    : null;

  const t = await getTranslations({ locale, namespace: 'bookingEmail' });
  const startsAt = new Date(`${booking.date}T${booking.startTime}:00`);

  const rows: ReceiptRow[] = [];
  if (title) rows.push({ label: t('experienceLabel'), value: title });
  if (placeName) rows.push({ label: t('placeLabel'), value: placeName });
  rows.push({ label: t('dateLabel'), value: formatDate(startsAt, locale) });
  rows.push({ label: t('timeLabel'), value: formatTime(startsAt, locale) });
  rows.push({ label: t('partyLabel'), value: formatInteger(booking.partySize, locale) });
  rows.push({ label: t('totalLabel'), value: formatSAR(booking.totalAmountSar, locale) });
  rows.push({
    label: t('vatIncludedLabel', { pct: vatRatePercent() }),
    value: formatSAR(vatPortionSar(booking.totalAmountSar), locale),
  });
  rows.push({ label: t('referenceLabel'), value: booking.reference });

  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject: t('subject'),
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('greeting', { name: booking.guestName }),
    intro: t('intro'),
    rows,
    closing: t('closing'),
    footer: t('footer'),
  });

  await sendEmail({ to: booking.guestEmail, subject: t('subject'), html, text });
}

/**
 * Send the cancellation notice after a guest cancels. `refund` mirrors
 * the cancel action's outcome: `refunded` (gateway refund issued),
 * `refund_pending` (we owe it, transfer is manual), `forfeited`
 * (inside the window, payment kept), `none` (nothing was paid). Same
 * best-effort posture as the receipt: gated, never throws upward.
 */
export async function sendBookingCancellationEmail(
  reference: string,
  locale: Locale,
  refund: 'none' | 'refunded' | 'refund_pending' | 'forfeited',
): Promise<void> {
  if (!hasEmail()) return;

  const booking = await getBookingByReference(reference);
  if (!booking?.guestEmail) return;

  const experience = booking.experienceSlug
    ? await getExperienceBySlug(booking.experienceSlug)
    : undefined;
  const title = experience ? (locale === 'ar' ? experience.titleAr : experience.titleEn) : null;

  const t = await getTranslations({ locale, namespace: 'bookingEmail' });
  const startsAt = new Date(`${booking.date}T${booking.startTime}:00`);

  const rows: ReceiptRow[] = [];
  if (title) rows.push({ label: t('experienceLabel'), value: title });
  rows.push({ label: t('dateLabel'), value: formatDate(startsAt, locale) });
  rows.push({ label: t('timeLabel'), value: formatTime(startsAt, locale) });
  if (refund === 'refunded' || refund === 'refund_pending') {
    rows.push({ label: t('refundLabel'), value: formatSAR(booking.totalAmountSar, locale) });
  }
  rows.push({ label: t('referenceLabel'), value: booking.reference });

  const intro =
    refund === 'refunded'
      ? t('cancelIntroRefunded')
      : refund === 'refund_pending'
        ? t('cancelIntroRefundPending')
        : refund === 'forfeited'
          ? t('cancelIntroForfeited')
          : t('cancelIntroUnpaid');

  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject: t('cancelSubject'),
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('greeting', { name: booking.guestName }),
    intro,
    rows,
    closing: t('cancelClosing'),
    footer: t('footer'),
  });

  await sendEmail({ to: booking.guestEmail, subject: t('cancelSubject'), html, text });
}

/**
 * Day-before reminder to the guest. Same best-effort posture as the
 * receipt. The cron is the only caller and stamps `reminderSentAt`
 * after a successful send, so re-runs never double-send.
 */
export async function sendBookingReminderEmail(reference: string, locale: Locale): Promise<void> {
  if (!hasEmail()) return;

  const booking = await getBookingByReference(reference);
  if (!booking?.guestEmail) return;

  const experience = booking.experienceSlug
    ? await getExperienceBySlug(booking.experienceSlug)
    : undefined;
  const title = experience ? (locale === 'ar' ? experience.titleAr : experience.titleEn) : null;
  const placeName = experience
    ? locale === 'ar'
      ? toArabicText(experience.placeName)
      : experience.placeName
    : null;

  const t = await getTranslations({ locale, namespace: 'bookingEmail' });
  const startsAt = new Date(`${booking.date}T${booking.startTime}:00`);

  const rows: ReceiptRow[] = [];
  if (title) rows.push({ label: t('experienceLabel'), value: title });
  if (placeName) rows.push({ label: t('placeLabel'), value: placeName });
  rows.push({ label: t('dateLabel'), value: formatDate(startsAt, locale) });
  rows.push({ label: t('timeLabel'), value: formatTime(startsAt, locale) });
  rows.push({ label: t('partyLabel'), value: formatInteger(booking.partySize, locale) });
  rows.push({ label: t('referenceLabel'), value: booking.reference });

  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject: t('reminderSubject'),
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('greeting', { name: booking.guestName }),
    intro: t('reminderIntro'),
    rows,
    closing: t('reminderClosing'),
    footer: t('footer'),
  });

  await sendEmail({ to: booking.guestEmail, subject: t('reminderSubject'), html, text });
}

/**
 * Standard detail rows (experience / date / time / party / reference)
 * shared by the request-lifecycle emails below. Locale-resolved titles.
 */
async function lifecycleRows(
  booking: NonNullable<Awaited<ReturnType<typeof getBookingByReference>>>,
  locale: Locale,
  t: Awaited<ReturnType<typeof getTranslations<'bookingEmail'>>>,
): Promise<ReceiptRow[]> {
  const experience = booking.experienceSlug
    ? await getExperienceBySlug(booking.experienceSlug)
    : undefined;
  const title = experience ? (locale === 'ar' ? experience.titleAr : experience.titleEn) : null;
  const startsAt = new Date(`${booking.date}T${booking.startTime}:00`);
  const rows: ReceiptRow[] = [];
  if (title) rows.push({ label: t('experienceLabel'), value: title });
  rows.push({ label: t('dateLabel'), value: formatDate(startsAt, locale) });
  rows.push({ label: t('timeLabel'), value: formatTime(startsAt, locale) });
  rows.push({ label: t('partyLabel'), value: formatInteger(booking.partySize, locale) });
  rows.push({ label: t('referenceLabel'), value: booking.reference });
  return rows;
}

/**
 * Acknowledge a guest's booking request (request-to-book only): "the host
 * has X hours to confirm; you won't be charged until then." No-ops for
 * instant bookings (their ack is the payment receipt) and for guests
 * without an email on file. Best-effort like every sender here.
 */
export async function sendBookingRequestReceivedEmail(
  reference: string,
  locale: Locale,
): Promise<void> {
  if (!hasEmail()) return;
  const booking = await getBookingByReference(reference);
  if (!booking?.guestEmail || booking.status !== 'pending') return;

  const t = await getTranslations({ locale, namespace: 'bookingEmail' });
  const rows = await lifecycleRows(booking, locale, t);
  if (booking.approvalDeadline) {
    rows.push({
      label: t('approvalDeadlineLabel'),
      value: formatDate(new Date(booking.approvalDeadline), locale),
    });
  }

  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject: t('requestReceivedSubject'),
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('greeting', { name: booking.guestName }),
    intro: t('requestReceivedIntro'),
    rows,
    closing: t('requestReceivedClosing'),
    footer: t('footer'),
  });
  await sendEmail({ to: booking.guestEmail, subject: t('requestReceivedSubject'), html, text });
}

/**
 * The host approved a request. Pay-after-approval: when online payment is
 * configured the email carries the payment link and the window deadline;
 * when payment is off the booking is simply confirmed. Locale follows the
 * guest's preferred language (the action caller may be the host/admin).
 */
export async function sendBookingApprovedEmail(reference: string): Promise<void> {
  if (!hasEmail()) return;
  const booking = await getBookingByReference(reference);
  if (!booking?.guestEmail || booking.status !== 'confirmed') return;

  const locale = booking.guestPreferredLanguage;
  const t = await getTranslations({ locale, namespace: 'bookingEmail' });
  const rows = await lifecycleRows(booking, locale, t);
  rows.push({ label: t('totalLabel'), value: formatSAR(booking.totalAmountSar, locale) });

  const needsPayment =
    hasHyperpay() && booking.paymentStatus !== 'paid' && booking.paymentDeadline !== null;
  const payUrl = `${SITE_URL}/${locale}/book/${reference}/pay?slug=${encodeURIComponent(booking.experienceSlug)}`;
  if (needsPayment && booking.paymentDeadline) {
    rows.push({
      label: t('paymentDeadlineLabel'),
      value: formatDate(new Date(booking.paymentDeadline), locale),
    });
  }

  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject: t('approvedSubject'),
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('greeting', { name: booking.guestName }),
    intro: needsPayment ? t('approvedPayIntro', { url: payUrl }) : t('approvedIntro'),
    rows,
    closing: needsPayment ? t('approvedPayClosing') : t('approvedClosing'),
    footer: t('footer'),
  });
  await sendEmail({ to: booking.guestEmail, subject: t('approvedSubject'), html, text });
}

/** The host declined the request. Nothing was ever charged. */
export async function sendBookingDeclinedEmail(reference: string): Promise<void> {
  if (!hasEmail()) return;
  const booking = await getBookingByReference(reference);
  if (!booking?.guestEmail || booking.status !== 'declined') return;

  const locale = booking.guestPreferredLanguage;
  const t = await getTranslations({ locale, namespace: 'bookingEmail' });
  const rows = await lifecycleRows(booking, locale, t);

  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject: t('declinedSubject'),
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('greeting', { name: booking.guestName }),
    intro: t('declinedIntro'),
    rows,
    closing: t('declinedClosing'),
    footer: t('footer'),
  });
  await sendEmail({ to: booking.guestEmail, subject: t('declinedSubject'), html, text });
}

/** The approval window lapsed with no host decision. Nothing was charged. */
export async function sendBookingExpiredEmail(reference: string): Promise<void> {
  if (!hasEmail()) return;
  const booking = await getBookingByReference(reference);
  if (!booking?.guestEmail || booking.status !== 'expired') return;

  const locale = booking.guestPreferredLanguage;
  const t = await getTranslations({ locale, namespace: 'bookingEmail' });
  const rows = await lifecycleRows(booking, locale, t);

  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject: t('expiredSubject'),
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('greeting', { name: booking.guestName }),
    intro: t('expiredIntro'),
    rows,
    closing: t('expiredClosing'),
    footer: t('footer'),
  });
  await sendEmail({ to: booking.guestEmail, subject: t('expiredSubject'), html, text });
}

/**
 * An unpaid hold lapsed and the cron released the spot — either an
 * approved request the guest never paid for, or an abandoned instant
 * booking. Nothing was charged.
 */
export async function sendBookingPaymentLapsedEmail(reference: string): Promise<void> {
  if (!hasEmail()) return;
  const booking = await getBookingByReference(reference);
  if (!booking?.guestEmail || booking.status !== 'cancelled') return;

  const locale = booking.guestPreferredLanguage;
  const t = await getTranslations({ locale, namespace: 'bookingEmail' });
  const rows = await lifecycleRows(booking, locale, t);

  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject: t('paymentLapsedSubject'),
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('greeting', { name: booking.guestName }),
    intro: t('paymentLapsedIntro'),
    rows,
    closing: t('paymentLapsedClosing'),
    footer: t('footer'),
  });
  await sendEmail({ to: booking.guestEmail, subject: t('paymentLapsedSubject'), html, text });
}

/**
 * "You have a new booking" notice to the host. The host's email lives
 * on their approved application (`host_applications.contact_email` —
 * the `hosts` table deliberately carries no contact columns); seeded
 * demo hosts have no application, so this no-ops for them. Locale
 * follows the host's first listed language (Arabic-first default).
 */
export async function sendHostNewBookingEmail(reference: string): Promise<void> {
  if (!hasEmail()) return;

  const booking = await getBookingByReference(reference);
  if (!booking?.experienceSlug) return;

  // The public ExperienceSummary deliberately omits commission and host
  // id, so read the row (with its host) straight from the DB.
  const experience = await db.query.experiences.findFirst({
    where: (e) => eq(e.slug, booking.experienceSlug),
    columns: { titleEn: true, titleAr: true, commissionBps: true },
    with: { host: { columns: { id: true, languages: true } } },
  });
  if (!experience) return;
  const application = await db.query.hostApplications.findFirst({
    where: eq(hostApplications.hostId, experience.host.id),
    columns: { contactEmail: true },
  });
  if (!application?.contactEmail) return;

  const locale: Locale = experience.host.languages[0] === 'en' ? 'en' : 'ar';
  const t = await getTranslations({ locale, namespace: 'bookingEmail' });
  const startsAt = new Date(`${booking.date}T${booking.startTime}:00`);
  const { payoutSar } = splitCommission(booking.totalAmountSar, experience.commissionBps);

  const rows: ReceiptRow[] = [];
  rows.push({
    label: t('experienceLabel'),
    value: locale === 'ar' ? experience.titleAr : experience.titleEn,
  });
  rows.push({ label: t('dateLabel'), value: formatDate(startsAt, locale) });
  rows.push({ label: t('timeLabel'), value: formatTime(startsAt, locale) });
  rows.push({ label: t('partyLabel'), value: formatInteger(booking.partySize, locale) });
  rows.push({ label: t('hostNewPayoutLabel'), value: formatSAR(payoutSar, locale) });

  const isRequest = booking.status === 'pending';
  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject: isRequest ? t('hostNewRequestSubject') : t('hostNewBookingSubject'),
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('hostNewGreeting'),
    intro: isRequest
      ? t('hostNewRequestIntro', { url: `${SITE_URL}/${locale}/host/bookings` })
      : t('hostNewBookingIntro', { url: `${SITE_URL}/${locale}/host/bookings` }),
    rows,
    closing: t('hostNewClosing'),
    footer: t('footer'),
  });

  await sendEmail({
    to: application.contactEmail,
    subject: isRequest ? t('hostNewRequestSubject') : t('hostNewBookingSubject'),
    html,
    text,
  });
}
