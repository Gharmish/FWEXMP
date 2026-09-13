import 'server-only';

import { getTranslations } from 'next-intl/server';
import { escapeHtml } from '@/lib/html';
import { hasHyperpay } from '@/lib/env';
import type { Locale } from '@/lib/i18n';
import { formatDate, formatInteger, formatTime } from '@/lib/format';
import { dispatchNotification, notificationsConfigured } from '@/lib/notifications/dispatch';
import { reportError } from '@/lib/log';
import { getBookingByReference } from '@/features/bookings/queries';
import { startInstant } from '@/features/bookings/lib/cancellation';
import { getExperienceBySlug } from '@/features/experiences/queries';
import { toArabicText } from '@/features/experiences/lib/arabic-content';
import { guestBookingUrls } from './booking-email-links';
import { renderReceiptEmail, type ReceiptRow } from './booking-email-render';
import {
  firstName,
  guestBookingPath,
  hostBookingPath,
  waDate,
  waGuests,
  waTime,
  waTimeRemaining,
  whatsappPayload,
} from '@/lib/notifications/whatsapp';
import {
  EMAIL_LOGO_URL,
  emailHero,
  KSA_TIME,
  KSA_DATE,
  fullRefundDeadlineFor,
  googleMapsLink,
  hostEmailContext,
} from './booking-email-shared';

/**
 * The two-stage guest reminders (~24h "get ready", ~3h "see you soon").
 *
 * Split out of booking-email.ts (2026-09 engineering audit ARCH-07: one
 * 2,100-line module with 20 senders). The index module re-exports every
 * sender, so callers and mocks keep importing from booking-email.
 */

interface ReminderData {
  booking: NonNullable<Awaited<ReturnType<typeof getBookingByReference>>>;
  /** Guest email; null for phone-only guests (WhatsApp covers them). */
  guestEmail: string | null;
  /** Guest E.164 phone; null for email-only guests. */
  guestPhone: string | null;
  experience: NonNullable<Awaited<ReturnType<typeof getExperienceBySlug>>> | undefined;
  title: string | null;
  placeName: string | null;
  startsAt: Date;
  /** Google Maps link for the meeting point, or null when the listing is gone. */
  mapUrl: string | null;
  /** `lat,lng` for the WhatsApp directions button; null when the listing is gone. */
  mapsQuery: string | null;
  /** Localized "what to bring", falling back to the English list. */
  bringList: readonly string[];
}

/**
 * Shared gather for both reminders: resolves the booking, its
 * experience, and the locale-specific meeting point / map link / bring
 * list. Returns null when the send should be skipped (no email and no
 * phone on file — nothing is addressable).
 */
async function reminderData(reference: string, locale: Locale): Promise<ReminderData | null> {
  const booking = await getBookingByReference(reference);
  if (!booking) return null;
  if (!booking.guestEmail && !booking.guestPhone) return null;
  // Re-read guards against the gap between the cron's SELECT and this send:
  // only remind a booking that is still confirmed. A booking cancelled,
  // rescheduled to a new reference, or otherwise moved out of `confirmed`
  // in that window must never receive a reminder describing a stale state.
  if (booking.status !== 'confirmed') return null;
  // …and only a SECURED one (2026-09 engineering audit GAPA-02): a
  // confirmed-but-unpaid hold must never be told "see you tomorrow".
  // Mirrors `paymentCollected()`: paid, or — with payments switched off —
  // a row that never had a hold to pay.
  if (booking.paymentStatus !== 'paid' && (hasHyperpay() || booking.paymentDeadline !== null)) {
    return null;
  }

  const experience = booking.experienceSlug
    ? await getExperienceBySlug(booking.experienceSlug)
    : undefined;
  const title = experience ? (locale === 'ar' ? experience.titleAr : experience.titleEn) : null;
  const placeName = experience
    ? locale === 'ar'
      ? toArabicText(experience.placeName)
      : experience.placeName
    : null;
  const mapUrl = experience ? googleMapsLink(experience.lat, experience.lng) : null;
  const mapsQuery = experience ? `${experience.lat},${experience.lng}` : null;
  const bringList =
    locale === 'ar' && experience?.whatToBringAr.length
      ? experience.whatToBringAr
      : (experience?.whatToBring ?? []);

  return {
    booking,
    guestEmail: booking.guestEmail,
    guestPhone: booking.guestPhone,
    experience,
    title,
    placeName,
    startsAt: startInstant(booking.date, booking.startTime),
    mapUrl,
    mapsQuery,
    bringList,
  };
}

/**
 * "Get ready" reminder (~24h before). Prep-focused: the essentials, the
 * meeting point as a Google Maps button, what to bring, the host, and —
 * only while it's still valid — the free-cancellation deadline. Same
 * best-effort posture as the receipt; the cron stamps `reminderSentAt`
 * after a successful send so re-runs never double-send.
 */
export async function sendBookingPrepareReminderEmail(
  reference: string,
  locale: Locale,
): Promise<void> {
  if (!notificationsConfigured()) return;

  const data = await reminderData(reference, locale);
  if (!data) return;
  const { booking, guestEmail, guestPhone, title, placeName, startsAt, mapUrl, bringList } = data;

  const t = await getTranslations({ locale, namespace: 'bookingEmail' });
  const time = formatTime(startsAt, locale, KSA_TIME);

  const rows: ReceiptRow[] = [];
  if (title) rows.push({ label: t('experienceLabel'), value: title });
  if (placeName) rows.push({ label: t('meetingPointLabel'), value: placeName });
  rows.push({ label: t('dateLabel'), value: formatDate(startsAt, locale, 'gregory', KSA_DATE) });
  rows.push({ label: t('timeLabel'), value: time });
  rows.push({ label: t('partyLabel'), value: formatInteger(booking.partySize, locale) });
  rows.push({ label: t('referenceLabel'), value: booking.referenceCode });

  // Full-refund line — shown only while a full refund is still on the
  // table per `bookingOptions()` (on most tiers it has lapsed by the 24h
  // mark, so we fall back to a plain "manage your booking" link). The
  // rule comes from the booking's own policy snapshot plus the platform
  // grace, never the live platform settings.
  const deadline = fullRefundDeadlineFor(booking);
  const manageUrl = guestBookingUrls(locale, reference, booking.experienceSlug).manage;
  const note = deadline
    ? {
        // `t.markup`, not `t()`: the message carries an <a> tag, and a tag
        // with an attribute is not ICU — plain t() threw INVALID_MESSAGE and
        // the email shipped the raw key instead of the link (2026-07-15 →
        // 2026-09-13, seen on /pay/return in the production runtime logs).
        html: t.markup('reminderManageWithDeadline', {
          deadline: `${formatDate(deadline, locale, 'gregory', KSA_DATE)}, ${formatTime(deadline, locale, KSA_TIME)}`,
          a: (chunks) => `<a href="${escapeHtml(manageUrl)}">${chunks}</a>`,
        }),
      }
    : {
        html: t.markup('reminderManageNoDeadline', {
          a: (chunks) => `<a href="${escapeHtml(manageUrl)}">${chunks}</a>`,
        }),
      };

  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject: t('prepareSubject', { time }),
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('greeting', { name: booking.guestName }),
    intro: t('prepareIntro'),
    heroImage: emailHero(data.experience, title),
    rows,
    cta: mapUrl ? { label: t('openMap'), url: mapUrl } : undefined,
    bullets:
      bringList.length > 0 ? { heading: t('whatToBringHeading'), items: bringList } : undefined,
    host: data.experience
      ? { name: data.experience.hostName, note: t('hostReminderNote') }
      : undefined,
    note,
    closing: t('prepareClosing'),
    footer: t('footer'),
  });

  await dispatchNotification({
    type: 'booking_reminder_24h',
    // Scoped by date: a rescheduled booking resets its reminder flags and
    // must be remindable again for the NEW date — same reference, new key.
    dedupeKey: `booking_reminder_24h:${booking.referenceCode}:${booking.date}`,
    bookingId: booking.id,
    recipient: { kind: 'guest', email: guestEmail, phone: guestPhone, locale },
    email: { subject: t('prepareSubject', { time }), html, text },
    whatsapp: whatsappPayload(
      'guest_reminder_tomorrow',
      locale,
      {
        firstName: firstName(booking.guestName),
        experienceName: title ?? t('genericExperience'),
        date: waDate(startsAt, locale),
        time: waTime(startsAt, locale),
        // Never a reference code posing as a meeting point.
        meetingPoint: placeName ?? title ?? t('genericExperience'),
        bookingPath: guestBookingPath(locale, reference),
        guestName: booking.guestName,
        mapUrl,
        bookingUrl: manageUrl,
      },
      { reference: booking.referenceCode },
    ),
  });

  // Host side of the same hour (WhatsApp CX redesign, H05): who is
  // coming tomorrow. Best-effort; deduped per booking+date like the
  // guest reminder so a reschedule re-arms it.
  if (booking.experienceSlug) {
    try {
      const host = await hostEmailContext(booking.experienceSlug);
      // Optional category: the host can mute day-before reminders.
      if (host?.phone && host.prefs.reminders) {
        await dispatchNotification({
          type: 'host_reminder_tomorrow',
          dedupeKey: `host_reminder_tomorrow:${booking.referenceCode}:${booking.date}`,
          bookingId: booking.id,
          recipient: { kind: 'host', phone: host.phone, locale: host.locale },
          whatsapp: whatsappPayload(
            'host_reminder_tomorrow',
            host.locale,
            {
              experienceName: host.title,
              date: waDate(startsAt, host.locale),
              time: waTime(startsAt, host.locale),
              guests: waGuests(booking.partySize, host.locale),
              bookingPath: hostBookingPath(host.locale, booking.referenceCode),
            },
            { reference: booking.referenceCode },
          ),
        });
      }
    } catch (error) {
      reportError(error, { surface: 'bookings:hostReminderTomorrow', reference });
    }
  }
}

/**
 * "See you soon" reminder (~3h before, day-of). A lean doorway email: the
 * meeting point up top as a Google Maps button, the time (arrive early),
 * and the host. Reply-to is the contact channel until messaging/SMS lands.
 * The cron stamps `finalReminderSentAt` after a successful send.
 */
export async function sendBookingDepartureReminderEmail(
  reference: string,
  locale: Locale,
): Promise<void> {
  if (!notificationsConfigured()) return;

  const data = await reminderData(reference, locale);
  if (!data) return;
  const { booking, guestEmail, guestPhone, title, placeName, startsAt, mapUrl, mapsQuery } = data;

  const t = await getTranslations({ locale, namespace: 'bookingEmail' });
  const time = formatTime(startsAt, locale, KSA_TIME);

  const rows: ReceiptRow[] = [];
  if (placeName) rows.push({ label: t('meetingPointLabel'), value: placeName });
  rows.push({ label: t('timeLabel'), value: `${time} — ${t('arriveEarly')}` });
  rows.push({ label: t('partyLabel'), value: formatInteger(booking.partySize, locale) });
  rows.push({ label: t('referenceLabel'), value: booking.referenceCode });

  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject: t('departureSubject', { time }),
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('greeting', { name: booking.guestName }),
    intro: t('departureIntro'),
    heroImage: emailHero(data.experience, title),
    rows,
    cta: mapUrl ? { label: t('openMap'), url: mapUrl } : undefined,
    host: data.experience
      ? { name: data.experience.hostName, note: t('hostReminderNote') }
      : undefined,
    closing: t('departureClosing'),
    footer: t('footer'),
  });

  await dispatchNotification({
    type: 'booking_reminder_3h',
    dedupeKey: `booking_reminder_3h:${booking.referenceCode}:${booking.date}`,
    bookingId: booking.id,
    recipient: { kind: 'guest', email: guestEmail, phone: guestPhone, locale },
    email: { subject: t('departureSubject', { time }), html, text },
    whatsapp: whatsappPayload(
      'guest_reminder_soon',
      locale,
      {
        timeRemaining: waTimeRemaining(
          Math.max(0, (startsAt.getTime() - Date.now()) / 60_000),
          locale,
        ),
        experienceName: title ?? t('genericExperience'),
        time: waTime(startsAt, locale),
        meetingPoint: placeName ?? title ?? t('genericExperience'),
        mapsQuery,
        guestName: booking.guestName,
        mapUrl: mapUrl ?? guestBookingUrls(locale, reference, booking.experienceSlug).manage,
      },
      { reference: booking.referenceCode },
    ),
  });
}
