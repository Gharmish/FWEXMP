import 'server-only';

import { eq } from 'drizzle-orm';
import { getTranslations } from 'next-intl/server';
import { db } from '@/lib/db';
import { dispatchNotification, notificationsConfigured } from '@/lib/notifications/dispatch';
import { whatsappPayload } from '@/lib/notifications/whatsapp';
import { hostNotificationContact } from '@/lib/notifications/host-contact';
import { SITE_URL } from '@/lib/site';
import { renderReceiptEmail } from '@/features/bookings/lib/booking-email-render';

/** Brand wordmark for email headers — PNG (clients don't render SVG). */
const EMAIL_LOGO_URL = `${SITE_URL}/images/gharmish-email-logo.png`;

export type ModerationDecision = 'approved' | 'rejected' | 'changes_requested';

/**
 * Moderation decision notices to the host (2026-07-31 audit: a listing
 * could be approved, rejected, or bounced for changes with zero notice).
 * The reviewer's note deliberately stays out of the email — it renders
 * in-product on /host/experiences/[id] (same precedent as application
 * rejections), which is where the CTA lands for non-approvals. Approval
 * links to the live public page instead. No dedupe keys — a listing can
 * cycle through review repeatedly. Best-effort, email-only.
 */
export async function sendExperienceModerationEmail(
  experienceId: string,
  decision: ModerationDecision,
): Promise<void> {
  if (!notificationsConfigured()) return;

  const experience = await db.query.experiences.findFirst({
    where: (e) => eq(e.id, experienceId),
    columns: { id: true, slug: true, titleEn: true, titleAr: true, hostId: true },
  });
  if (!experience) return;
  const host = await hostNotificationContact(experience.hostId);
  if (!host || (!host.email && !host.phone)) return;

  const t = await getTranslations({ locale: host.locale, namespace: 'moderationEmail' });
  const title = host.locale === 'ar' ? experience.titleAr : experience.titleEn;

  const subject =
    decision === 'approved'
      ? t('approvedSubject', { experience: title })
      : decision === 'rejected'
        ? t('rejectedSubject', { experience: title })
        : t('changesSubject', { experience: title });
  const intro =
    decision === 'approved'
      ? t('approvedIntro')
      : decision === 'rejected'
        ? t('rejectedIntro')
        : t('changesIntro');
  const cta =
    decision === 'approved'
      ? {
          label: t('approvedCta'),
          url: `${SITE_URL}/${host.locale}/experiences/${experience.slug}`,
        }
      : {
          label: t('editCta'),
          url: `${SITE_URL}/${host.locale}/host/experiences/${experience.id}`,
        };

  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject,
    dir: host.locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('greeting', { name: host.name }),
    intro,
    rows: [{ label: t('experienceLabel'), value: title }],
    cta,
    closing: decision === 'approved' ? t('approvedClosing') : t('decisionClosing'),
    footer: t('footer'),
  });
  // WhatsApp only for approvals and change requests; a rejection stays
  // email + in-product, where the reviewer's note lives.
  const whatsapp =
    decision === 'approved'
      ? whatsappPayload('host_experience_approved', host.locale, {
          experienceName: title,
          experiencePath: `${host.locale}/experiences/${experience.slug}`,
        })
      : decision === 'changes_requested'
        ? whatsappPayload('host_experience_changes', host.locale, {
            experienceName: title,
            editPath: `${host.locale}/host/experiences/${experience.id}`,
          })
        : undefined;
  await dispatchNotification({
    type: `experience_${decision}`,
    recipient: { kind: 'host', email: host.email, phone: host.phone, locale: host.locale },
    email: host.email ? { subject, html, text } : undefined,
    whatsapp,
  });
}
