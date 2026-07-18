import 'server-only';

import { eq } from 'drizzle-orm';
import { getTranslations } from 'next-intl/server';
import { db } from '@/lib/db';
import { hasEmail } from '@/lib/env';
import type { Locale } from '@/lib/i18n';
import { dispatchNotification } from '@/lib/notifications/dispatch';
import { SITE_URL } from '@/lib/site';
import { renderReceiptEmail } from '@/features/bookings/lib/booking-email-render';

/** Brand wordmark for email headers — PNG (clients don't render SVG). */
const EMAIL_LOGO_URL = `${SITE_URL}/images/gharmish-wordmark.png`;

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
    intro: t('repliedIntro', { experience: title, url }),
    rows: [{ label: t('replyLabel'), value: review.hostReply }],
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
