import 'server-only';

import { eq } from 'drizzle-orm';
import { getTranslations } from 'next-intl/server';
import { db } from '@/lib/db';
import type { Locale } from '@/lib/i18n';
import { formatDate, formatInteger, formatTime } from '@/lib/format';
import { applyChannelPrefs } from '@/lib/notifications/host-contact';
import { SITE_URL } from '@/lib/site';
import { hostApplications } from '@/db/schema';
import { getBookingByReference } from '@/features/bookings/queries';
import { startInstant } from '@/features/bookings/lib/cancellation';
import { bookingOptions } from '@/features/bookings/lib/policy';
import { getExperienceBySlug } from '@/features/experiences/queries';
import { type ReceiptRow } from './booking-email-render';

/**
 * Helpers every booking email builds on: the brand logo URL, KSA date
 * formats, the lifecycle row set, the host contact resolver and the
 * shared host rows.
 *
 * Split out of booking-email.ts (2026-09 engineering audit ARCH-07: one
 * 2,100-line module with 20 senders). The index module re-exports every
 * sender, so callers and mocks keep importing from booking-email.
 */

/** Brand wordmark for email headers — PNG (clients don't render SVG). */
export const EMAIL_LOGO_URL = `${SITE_URL}/images/gharmish-email-logo.png`;

/** Email hero block from an experience's photo, when it has one. */
export function emailHero(
  experience: { heroImage: string | null } | undefined,
  alt: string | null,
): { url: string; alt: string } | undefined {
  if (!experience?.heroImage) return undefined;
  // A relative `/images/...` path renders as a broken image in every mail
  // client; absolutise it the way JSON-LD and the catalog feed already do
  // (2026-09 engineering audit GAPB-09).
  const url = experience.heroImage.startsWith('/')
    ? `${SITE_URL}${experience.heroImage}`
    : experience.heroImage;
  return { url, alt: alt ?? 'Gharmish' };
}

/**
 * Email dates/times ALWAYS render in KSA wall-clock time, explicitly
 * (2026-07 audit M7). Before this, `new Date('YYYY-MM-DDTHH:mm:00')`
 * parsed in the server zone and formatted in the server zone — correct
 * on UTC Vercel only because the two cancelled out, and one "helpful"
 * tz added to a formatter would have shifted every receipt 3h. Parsing
 * now pins +03:00 via `startInstant` and formatting pins Asia/Riyadh.
 * (This also fixed a real bug: deadline dates formatted in server UTC
 * showed the previous DAY for deadlines before 3am KSA.)
 */
export const KSA_TIME: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Riyadh' };

export const KSA_DATE: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Riyadh',
};

/**
 * Numeric `dd/MM/yyyy`, always Latin. The PDF renderer can't mix an Arabic
 * month name with Latin digits in one run without corrupting the shaping
 * (see invoice-pdf.tsx), so PDF dates use this locale-independent form.
 */
export const KSA_NUMERIC_DATE: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Asia/Riyadh',
};

/** Card-scheme label, kept single-script so it's safe in the Arabic PDF. */
export function paymentBrandLabel(brand: string | null, locale: Locale): string | null {
  if (!brand) return null;
  if (brand === 'MADA') return locale === 'ar' ? 'مدى' : 'mada';
  if (brand === 'VISA') return 'Visa';
  if (brand === 'MASTER') return 'Mastercard';
  return brand;
}

/**
 * The instant until which cancelling this booking still refunds in full
 * — from the same `bookingOptions()` the pages and server actions run,
 * so it is grace-aware and reschedule-anchored, unlike the retired
 * `freeCancellationDeadline` helper. Null once that moment has passed
 * (or the booking can no longer be cancelled): emails only ever
 * advertise a deadline while it is still ahead.
 */
export function fullRefundDeadlineFor(
  booking: NonNullable<Awaited<ReturnType<typeof getBookingByReference>>>,
  now = new Date(),
): Date | null {
  const { cancel } = bookingOptions({
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    dateStr: booking.date,
    startTime: booking.startTime,
    createdAt: new Date(booking.createdAt),
    totalAmountSar: booking.totalAmountSar + booking.walletAppliedSar,
    snapshot: booking.policy,
    rescheduleCount: booking.rescheduleCount,
    rescheduledFromDate: booking.rescheduledFromDate,
    now,
  });
  if (!cancel.allowed) return null;
  if (cancel.refund !== 'full' && cancel.refund !== 'none_needed') return null;
  return now.getTime() <= cancel.fullRefundUntil.getTime() ? cancel.fullRefundUntil : null;
}

/** Google Maps deep link to a coordinate — the guest-facing meeting point. */
export function googleMapsLink(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export interface LifecycleDetails {
  rows: ReceiptRow[];
  /** Locale-resolved experience title; null when the listing is gone. */
  title: string | null;
  startsAt: Date;
  /** Hero photo block for the email, when the listing still has one. */
  hero: { url: string; alt: string } | undefined;
}

/**
 * Standard detail rows (experience / date / time / party / reference)
 * shared by the request-lifecycle senders below, plus the resolved
 * title/start the WhatsApp template variables reuse.
 */
export async function lifecycleDetails(
  booking: NonNullable<Awaited<ReturnType<typeof getBookingByReference>>>,
  locale: Locale,
  t: Awaited<ReturnType<typeof getTranslations<'bookingEmail'>>>,
): Promise<LifecycleDetails> {
  const experience = booking.experienceSlug
    ? await getExperienceBySlug(booking.experienceSlug)
    : undefined;
  const title = experience ? (locale === 'ar' ? experience.titleAr : experience.titleEn) : null;
  const startsAt = startInstant(booking.date, booking.startTime);
  const rows: ReceiptRow[] = [];
  if (title) rows.push({ label: t('experienceLabel'), value: title });
  rows.push({ label: t('dateLabel'), value: formatDate(startsAt, locale, 'gregory', KSA_DATE) });
  rows.push({ label: t('timeLabel'), value: formatTime(startsAt, locale, KSA_TIME) });
  rows.push({ label: t('partyLabel'), value: formatInteger(booking.partySize, locale) });
  rows.push({ label: t('referenceLabel'), value: booking.referenceCode });
  return { rows, title, startsAt, hero: emailHero(experience, title) };
}

export interface HostEmailContext {
  /** Null when absent OR the host switched the email channel off. */
  email: string | null;
  /** E.164 phone — the WhatsApp address. Null for seeded demo hosts or a switched-off channel. */
  phone: string | null;
  locale: Locale;
  title: string;
  /** Optional-category opt-ins (reminder / review notices). */
  prefs: { reminders: boolean; reviews: boolean };
}

/**
 * Resolve the notification contacts for the host of an experience.
 * Prefers `hosts.contact_email` / `hosts.contact_phone` (copied from
 * the application at approval) and falls back to the application row
 * for hosts approved before those columns existed. Returns null when
 * neither channel is addressable (seeded demo hosts), so the host
 * senders below no-op for them.
 */
export async function hostEmailContext(
  experienceSlug: string,
  options: { critical?: boolean } = {},
): Promise<HostEmailContext | null> {
  // The public ExperienceSummary deliberately omits commission and host
  // id, so read the row (with its host) straight from the DB.
  const experience = await db.query.experiences.findFirst({
    where: (e) => eq(e.slug, experienceSlug),
    columns: { titleEn: true, titleAr: true },
    with: {
      host: {
        columns: {
          id: true,
          languages: true,
          contactEmail: true,
          contactPhone: true,
          notifyEmail: true,
          notifyWhatsapp: true,
          notifyReminders: true,
          notifyReviews: true,
        },
      },
    },
  });
  if (!experience) return null;

  let email = experience.host.contactEmail;
  let phone = experience.host.contactPhone;
  if (!email || !phone) {
    const application = await db.query.hostApplications.findFirst({
      where: eq(hostApplications.hostId, experience.host.id),
      columns: { contactEmail: true, contactPhone: true },
    });
    email = email ?? application?.contactEmail ?? null;
    phone = phone ?? application?.contactPhone ?? null;
  }
  // The host's channel toggles (2026-08-22): a switched-off channel
  // reads as "no address" for every sender that uses this context —
  // except account-critical notices (see HostContactOptions.critical).
  if (!options.critical) ({ email, phone } = applyChannelPrefs({ email, phone }, experience.host));
  if (!email && !phone) return null;

  const locale: Locale = experience.host.languages[0] === 'en' ? 'en' : 'ar';
  return {
    email,
    phone,
    locale,
    title: locale === 'ar' ? experience.titleAr : experience.titleEn,
    prefs: { reminders: experience.host.notifyReminders, reviews: experience.host.notifyReviews },
  };
}

/**
 * Standard host-facing rows: experience / guest / date / time / party /
 * reference. The guest's name and the reference let the host match the
 * notice to a dashboard row without opening every booking; contact
 * details stay in the dashboard.
 */
export function hostRows(
  booking: NonNullable<Awaited<ReturnType<typeof getBookingByReference>>>,
  host: HostEmailContext,
  t: Awaited<ReturnType<typeof getTranslations<'bookingEmail'>>>,
): ReceiptRow[] {
  const startsAt = startInstant(booking.date, booking.startTime);
  return [
    { label: t('experienceLabel'), value: host.title },
    { label: t('hostGuestLabel'), value: booking.guestName },
    { label: t('dateLabel'), value: formatDate(startsAt, host.locale) },
    { label: t('timeLabel'), value: formatTime(startsAt, host.locale) },
    { label: t('partyLabel'), value: formatInteger(booking.partySize, host.locale) },
    { label: t('referenceLabel'), value: booking.referenceCode },
  ];
}

/** Absolute host-dashboard URL in the host's locale. */
export function hostBookingsUrl(locale: Locale): string {
  return `${SITE_URL}/${locale}/host/bookings`;
}
