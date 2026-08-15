import 'server-only';

import { eq } from 'drizzle-orm';
import { getTranslations } from 'next-intl/server';
import { db } from '@/lib/db';
import { bookings } from '@/db/schema';
import { SITE_URL } from '@/lib/site';
import { renderReceiptEmail } from '@/features/bookings/lib/booking-email-render';
import { dispatchNotification, notificationsConfigured } from '@/lib/notifications/dispatch';
import { unsubscribeUrl } from '@/lib/marketing/unsubscribe-token';
import { getExperiences } from '@/features/experiences/queries';

/**
 * Post-trip marketing rail (2026-08-15 marketing audit). Before this the
 * lifecycle ended at the review invite — no code path ever touched a past
 * guest again, so a first booking could never become a second one.
 *
 * Two email sends, both fired by the hourly cron off the booking's date:
 *
 *  - **D+7 rebook** — "here's more near {city}", while the trip is still
 *    a warm memory.
 *  - **D+90 win-back** — for guests with no booking since; the seasons
 *    argument is real in Aseer (mist summers, clear winters).
 *
 * Hard rules, enforced here and not left to callers:
 *
 *  - CONSENT: only guests with `marketingConsentAt` set (the unchecked
 *    checkbox at booking). No consent → silent no-op.
 *  - UNSUBSCRIBE: every send carries a signed one-tap unsubscribe link;
 *    if the link can't be minted (no signing secret) the send is DROPPED
 *    — a marketing email without a working unsubscribe never goes out.
 *  - Marketing-scope suppressions respected via `marketing: true` on the
 *    dispatch (a campaign unsubscribe stops these, never the receipts).
 *  - Email-only: WhatsApp marketing needs its own Meta-approved template
 *    class and stricter rules — deliberately out of scope.
 *  - One send per booking per stage (ledger dedupe on the reference).
 */

const EMAIL_LOGO_URL = `${SITE_URL}/images/gharmish-email-logo.png`;

async function marketingContext(reference: string) {
  const booking = await db.query.bookings.findFirst({
    where: eq(bookings.idempotencyKey, reference),
    columns: { id: true, status: true, referenceCode: true },
    with: {
      guest: {
        columns: {
          name: true,
          email: true,
          preferredLanguage: true,
          marketingConsentAt: true,
        },
      },
      experience: {
        columns: { slug: true, city: true, category: true, titleEn: true, titleAr: true },
      },
    },
  });
  if (!booking || booking.status !== 'completed') return null;
  if (!booking.guest.email || !booking.guest.marketingConsentAt) return null;
  const unsubscribe = unsubscribeUrl(booking.guest.email, booking.guest.preferredLanguage);
  if (!unsubscribe) return null;
  return { booking, unsubscribe };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Same-city-first recommendations, as anchor links for the email note. */
async function recommendationLinks(
  excludeSlug: string,
  city: string,
  locale: 'en' | 'ar',
): Promise<string> {
  const all = await getExperiences();
  const pool = all.filter((e) => e.slug !== excludeSlug);
  const picks = [
    ...pool.filter((e) => e.city === city),
    ...pool.filter((e) => e.city !== city),
  ].slice(0, 3);
  return picks
    .map(
      (e) =>
        `<a href="${SITE_URL}/${locale}/experiences/${e.slug}">${escapeHtml(
          locale === 'ar' ? e.titleAr : e.titleEn,
        )}</a>`,
    )
    .join('<br/>');
}

async function sendMarketingEmail(reference: string, stage: 'rebook' | 'winback'): Promise<void> {
  if (!notificationsConfigured()) return;
  const context = await marketingContext(reference);
  if (!context) return;
  const { booking, unsubscribe } = context;

  const locale = booking.guest.preferredLanguage;
  const t = await getTranslations({ locale, namespace: 'marketingEmail' });
  const experienceName = locale === 'ar' ? booking.experience.titleAr : booking.experience.titleEn;
  const links = await recommendationLinks(booking.experience.slug, booking.experience.city, locale);

  const subject =
    stage === 'rebook' ? t('rebookSubject', { city: booking.experience.city }) : t('winbackSubject');
  const noteHtml = [
    links ? `${escapeHtml(t('recommendationsHeading'))}<br/>${links}` : '',
    `<a href="${unsubscribe}">${escapeHtml(t('unsubscribe'))}</a>`,
  ]
    .filter(Boolean)
    .join('<br/><br/>');

  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject,
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('greeting', { name: booking.guest.name }),
    intro:
      stage === 'rebook'
        ? t('rebookIntro', { experience: experienceName, city: booking.experience.city })
        : t('winbackIntro', { experience: experienceName }),
    rows: [],
    cta: { label: t('browseCta'), url: `${SITE_URL}/${locale}/experiences` },
    note: { html: noteHtml },
    closing: stage === 'rebook' ? t('rebookClosing') : t('winbackClosing'),
    footer: t('footer'),
  });

  await dispatchNotification({
    type: stage === 'rebook' ? 'marketing_rebook' : 'marketing_winback',
    dedupeKey: `marketing_${stage}:${booking.referenceCode}`,
    bookingId: booking.id,
    marketing: true,
    recipient: { kind: 'guest', email: booking.guest.email, locale },
    email: { subject, html, text },
  });
}

/** D+7 "more like this near {city}" — fired by the cron a week after the trip. */
export async function sendRebookEmail(reference: string): Promise<void> {
  await sendMarketingEmail(reference, 'rebook');
}

/** D+90 win-back for guests with no booking since. */
export async function sendWinbackEmail(reference: string): Promise<void> {
  await sendMarketingEmail(reference, 'winback');
}
