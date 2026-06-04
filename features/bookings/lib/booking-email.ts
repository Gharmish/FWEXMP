import 'server-only';

import { getTranslations } from 'next-intl/server';
import { hasEmail } from '@/lib/env';
import type { Locale } from '@/lib/i18n';
import { formatDate, formatInteger, formatSAR, formatTime } from '@/lib/format';
import { sendEmail } from '@/lib/email';
import { getBookingByReference } from '@/features/bookings/queries';
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
