import 'server-only';

import { eq } from 'drizzle-orm';
import { getTranslations } from 'next-intl/server';
import { db } from '@/lib/db';
import { hasEmail } from '@/lib/env';
import type { Locale } from '@/lib/i18n';
import { formatInteger } from '@/lib/format';
import { dispatchNotification, notificationsConfigured } from '@/lib/notifications/dispatch';
import { whatsappPayload } from '@/lib/notifications/whatsapp';
import { hostNotificationContact } from '@/lib/notifications/host-contact';
import { SITE_URL } from '@/lib/site';
import { bookings } from '@/db/schema';
import { renderReceiptEmail } from '@/features/bookings/lib/booking-email-render';

/** Brand wordmark for email headers — PNG (clients don't render SVG). */
const EMAIL_LOGO_URL = `${SITE_URL}/images/gharmish-email-logo.png`;

/**
 * Tell the guest their review got a reply. Without this the reply only
 * surfaces if the guest happens to revisit the listing — hosts were
 * writing into the void. Same posture as the booking emails:
 * best-effort, gated on email being configured and the guest having an
 * address on file, and the caller must not fail the reply over it.
 */
export async function sendHostRepliedEmail(reviewId: string): Promise<void> {
  if (!hasEmail()) return;

  const review = await db.query.reviews.findFirst({
    where: (r) => eq(r.id, reviewId),
    with: { guest: true, experience: true },
  });
  if (!review?.hostReply || !review.guest.email) return;

  const locale = review.guest.preferredLanguage as Locale;
  const t = await getTranslations({ locale, namespace: 'reviewEmail' });
  const title = locale === 'ar' ? review.experience.titleAr : review.experience.titleEn;
  const url = `${SITE_URL}/${locale}/experiences/${review.experience.slug}`;

  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject: t('repliedSubject'),
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('greeting', { name: review.guest.name }),
    intro: t('repliedIntro', { experience: title }),
    rows: [{ label: t('replyLabel'), value: review.hostReply }],
    cta: { label: t('repliedCta'), url },
    closing: t('repliedClosing'),
    footer: t('footer'),
  });
  await dispatchNotification({
    type: 'review_replied',
    dedupeKey: `review_replied:${reviewId}`,
    recipient: { kind: 'guest', email: review.guest.email, locale },
    email: { subject: t('repliedSubject'), html, text },
  });
}

/**
 * Tell the host a guest posted a new review (2026-07-31 audit: the
 * reply email existed, but hosts never heard about the review itself —
 * the thing they'd want to reply to). Looked up by booking reference
 * because the submit action holds that, not the review id. Best-effort,
 * email-only, deduped per booking (one review per booking; edits inside
 * the window don't re-notify).
 */
export async function sendHostNewReviewEmail(bookingReference: string): Promise<void> {
  if (!notificationsConfigured()) return;

  const booking = await db.query.bookings.findFirst({
    where: eq(bookings.idempotencyKey, bookingReference),
    columns: { id: true, idempotencyKey: true },
    with: {
      review: { columns: { rating: true, textEn: true, textAr: true } },
      experience: { columns: { titleEn: true, titleAr: true, hostId: true } },
    },
  });
  if (!booking?.review) return;
  const host = await hostNotificationContact(booking.experience.hostId);
  if (!host || (!host.email && !host.phone)) return;

  const t = await getTranslations({ locale: host.locale, namespace: 'reviewEmail' });
  const title = host.locale === 'ar' ? booking.experience.titleAr : booking.experience.titleEn;
  // The guest wrote in THEIR language; show whichever text exists.
  const reviewText = booking.review.textAr ?? booking.review.textEn;

  const rows = [
    { label: t('experienceLabel'), value: title },
    {
      label: t('ratingLabel'),
      value: `${formatInteger(booking.review.rating, host.locale)}/${formatInteger(5, host.locale)}`,
    },
  ];
  if (reviewText) rows.push({ label: t('reviewTextLabel'), value: reviewText });

  const subject = t('hostNewSubject', { experience: title });
  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject,
    dir: host.locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('hostGreeting', { name: host.name }),
    intro: t('hostNewIntro'),
    rows,
    cta: { label: t('hostNewCta'), url: `${SITE_URL}/${host.locale}/host/reviews` },
    closing: t('hostNewClosing'),
    footer: t('footer'),
  });
  await dispatchNotification({
    type: 'host_new_review',
    dedupeKey: `host_new_review:${booking.idempotencyKey}`,
    bookingId: booking.id,
    recipient: { kind: 'host', email: host.email, phone: host.phone, locale: host.locale },
    email: host.email ? { subject, html, text } : undefined,
    whatsapp: whatsappPayload('host_new_review', host.locale, {
      experienceName: title,
      reviewsPath: `${host.locale}/host/reviews`,
    }),
  });
}
