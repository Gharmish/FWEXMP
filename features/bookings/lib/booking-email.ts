import 'server-only';

import { eq } from 'drizzle-orm';
import { getTranslations } from 'next-intl/server';
import { db } from '@/lib/db';
import { hasEmail } from '@/lib/env';
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
