import type { Metadata } from 'next';
import { ExternalLink } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect, Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { isArPlaceholder } from '@/lib/ar-placeholder';
import { SITE_URL } from '@/lib/site';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { getHostDashboard } from '@/features/host-dashboard/queries';
import { HostProfileForm } from '@/features/host-profile/components/host-profile-form';
import { HostPhotoUpload } from '@/features/host-profile/components/host-photo-upload';
import { HostContactForm } from '@/features/host-profile/components/host-contact-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'hostProfileSettings.meta' });
  return {
    title: t('title'),
    robots: { index: false, follow: false },
  };
}

const sectionTitle = 'font-display text-xl font-medium tracking-[-0.02em]';

/**
 * The host's public face, editable — everything a guest sees on
 * /hosts/[slug] that the host authors: photo, display name, English
 * and Arabic bio, languages. Derived trust signals (rating, response stats,
 * joined year, verified badge) stay read-only by design.
 */
export default async function HostProfileSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;

  const dashboard = await getHostDashboard();
  if (!dashboard) {
    redirect({ href: '/host/apply', locale: loc });
  }
  const { host } = dashboard;

  const t = await getTranslations('hostProfileSettings');

  const eyebrowClassName = cn(
    'text-sarat-black-600 font-medium text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  const publicUrl = `${SITE_URL}/${loc}/hosts/${host.slug}`;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className={eyebrowClassName}>{t('eyebrow')}</p>
        <h1 className="font-display text-3xl font-semibold tracking-[-0.035em] text-balance sm:text-4xl">
          {t('title')}
        </h1>
        <p className="text-sarat-black-600 max-w-xl text-base leading-relaxed">{t('intro')}</p>
      </header>

      {/* Identity — the same card guests anchor on, with the photo controls. */}
      <Card className="p-6 sm:p-8">
        <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:items-center sm:gap-6 sm:text-start">
          <Avatar
            name={host.name}
            src={host.photoUrl ?? undefined}
            size="lg"
            className="size-24 text-2xl"
          />
          <div className="flex flex-1 flex-col items-center gap-4 sm:items-start">
            <div className="flex flex-col items-center gap-2 sm:items-start">
              <p className="font-display text-2xl font-medium tracking-[-0.025em]">{host.name}</p>
              {host.verified ? (
                <Badge variant="verified">{t('identity.verified')}</Badge>
              ) : (
                <Badge variant="neutral">{t('identity.pendingVerification')}</Badge>
              )}
            </div>
            <HostPhotoUpload
              photoUrl={host.photoUrl}
              copy={{
                change: t('photo.change'),
                uploading: t('photo.uploading'),
                remove: t('photo.remove'),
                removing: t('photo.removing'),
                hint: t('photo.hint'),
                errors: {
                  no_db: t('photo.errors.noDb'),
                  no_auth: t('photo.errors.noAuth'),
                  no_storage: t('photo.errors.noStorage'),
                  no_file: t('photo.errors.noFile'),
                  invalid_type: t('photo.errors.invalidType'),
                  too_large: t('photo.errors.tooLarge'),
                  server: t('photo.errors.server'),
                },
              }}
            />
          </div>
        </div>

        {/* Public link — only verified hosts resolve on /hosts/[slug]
            (queries gate the public page to verified). */}
        {host.verified && (
          <div className="border-sarat-black/8 mt-6 flex flex-col gap-1 [border-top-width:0.5px] pt-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="text-sarat-black-600 text-sm">{t('identity.publicLink')}</p>
              <Link
                href={`/hosts/${host.slug}`}
                className="text-sarat-black inline-flex min-h-11 items-center gap-1.5 text-sm font-medium transition-opacity duration-200 hover:opacity-60"
              >
                <span dir="ltr">{publicUrl}</span>
                <ExternalLink className="size-4 shrink-0" aria-hidden />
              </Link>
            </div>
            <p className="text-sarat-black-600 text-xs">{t('identity.slugNote')}</p>
          </div>
        )}
      </Card>

      {/* Editable details */}
      <Card className="flex flex-col gap-6 p-6 sm:p-8">
        <h2 className={sectionTitle}>{t('details.title')}</h2>
        <HostProfileForm
          profile={{
            name: host.name,
            bioEn: host.bioEn,
            // Never seed the editor with the TODO(ar) marker — show an
            // empty field so the host writes from scratch.
            bioAr: isArPlaceholder(host.bioAr) ? '' : host.bioAr,
            storyEn: host.storyEn ?? '',
            storyAr: host.storyAr ?? '',
            languages: host.languages,
          }}
          copy={{
            nameLabel: t('details.nameLabel'),
            nameHint: t('details.nameHint'),
            bioLabel: t('details.bioLabel'),
            bioHint: t('details.bioHint'),
            bioArLabel: t('details.bioArLabel'),
            bioArHint: t('details.bioArHint'),
            storyLabel: t('details.storyLabel'),
            storyHint: t('details.storyHint'),
            storyArLabel: t('details.storyArLabel'),
            storyArHint: t('details.storyArHint'),
            languagesLabel: t('details.languagesLabel'),
            languageLabels: {
              ar: t('details.languages.ar'),
              en: t('details.languages.en'),
              fr: t('details.languages.fr'),
              ur: t('details.languages.ur'),
            },
            submit: t('details.submit'),
            submitting: t('details.submitting'),
            saved: t('details.saved'),
            nameError: t('details.nameError'),
            bioError: t('details.bioError'),
            bioArError: t('details.bioArError'),
            storyError: t('details.storyError'),
            storyArError: t('details.storyArError'),
            languagesError: t('details.languagesError'),
            errors: {
              no_db: t('details.errors.noDb'),
              no_auth: t('details.errors.noAuth'),
              validation: t('details.errors.validation'),
              server: t('details.errors.server'),
            },
          }}
        />
      </Card>

      {/* Contact & notifications — where every request, reminder and
          payout notice lands. Never shown publicly. */}
      <Card className="flex flex-col gap-6 p-6 sm:p-8">
        <div className="flex flex-col gap-2">
          <h2 className={sectionTitle}>{t('contact.title')}</h2>
          <p className="text-sarat-black-600 text-sm leading-relaxed">{t('contact.intro')}</p>
        </div>
        <HostContactForm
          locale={loc}
          contact={{
            contactPhone: host.contactPhone ?? '',
            contactEmail: host.contactEmail ?? '',
          }}
          copy={{
            phoneLabel: t('contact.phoneLabel'),
            phoneHint: t('contact.phoneHint'),
            phonePlaceholder: t('contact.phonePlaceholder'),
            countryLabel: t('contact.countryLabel'),
            emailLabel: t('contact.emailLabel'),
            emailHint: t('contact.emailHint'),
            submit: t('contact.submit'),
            submitting: t('contact.submitting'),
            saved: t('contact.saved'),
            phoneError: t('contact.phoneError'),
            emailError: t('contact.emailError'),
            errors: {
              no_db: t('details.errors.noDb'),
              no_auth: t('details.errors.noAuth'),
              validation: t('details.errors.validation'),
              server: t('details.errors.server'),
            },
          }}
        />
      </Card>
    </div>
  );
}
