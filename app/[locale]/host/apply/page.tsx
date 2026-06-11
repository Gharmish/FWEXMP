import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect, Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { getCurrentUser } from '@/features/auth/queries';
import { getCurrentUserHostApplication } from '@/features/host-applications/queries';
import { HostApplyForm } from '@/app/[locale]/host/apply/host-apply-form';
import { HOST_LANGUAGE_OPTIONS } from '@/features/host-applications/types';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const title = locale === 'ar' ? 'كن مضيفاً' : 'Host with us';
  return {
    title,
    // Private workflow — not for indexing.
    robots: { index: false, follow: false },
  };
}

export default async function HostApplyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;

  // Auth gate — must be signed in to submit. The sign-in page will
  // bounce them back here on success. `redirect()` throws so we never
  // proceed past this block, but the type signature isn't `never` and
  // TS can't narrow on its own — the explicit throw below tells it
  // `user` is non-null afterwards.
  const user = await getCurrentUser();
  if (!user) {
    redirect({ href: '/sign-in?next=/host/apply', locale: loc });
  }

  const [t, existing] = await Promise.all([
    getTranslations('hostApply'),
    getCurrentUserHostApplication(),
  ]);

  const eyebrowClassName = cn(
    'text-sarat-black-600 text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  // If there's already a submitted (pending or approved) application,
  // render the status surface instead of the form. A rejected
  // application falls through to the form so the user can refile.
  if (existing && existing.status !== 'rejected') {
    return (
      <div className="flex flex-col">
        <section className="mx-auto w-full max-w-3xl px-6 py-20 sm:py-24">
          <div className="flex flex-col gap-5">
            <p className={eyebrowClassName}>{t(`status.${existing.status}.eyebrow`)}</p>
            <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
              {t(`status.${existing.status}.title`, { name: existing.displayName })}
            </h1>
            <p className="text-sarat-black-600 max-w-2xl text-lg leading-relaxed">
              {t(`status.${existing.status}.description`)}
            </p>
          </div>

          <dl className="border-sarat-black/8 rounded-card mt-12 grid gap-5 [border-width:0.5px] p-6 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <dt className={eyebrowClassName}>{t('summary.displayName')}</dt>
              <dd className="text-base font-medium">{existing.displayName}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className={eyebrowClassName}>{t('summary.languages')}</dt>
              <dd className="text-base font-medium">
                {existing.languages.map((l) => t(`languages.${l}`)).join(' · ')}
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className={eyebrowClassName}>{t('summary.identity')}</dt>
              <dd className="text-base font-medium">
                {t(`identityType.${existing.identityType}`)}
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className={eyebrowClassName}>{t('summary.contact')}</dt>
              <dd className="text-base font-medium" dir="ltr">
                {existing.contactPhone}
              </dd>
            </div>
          </dl>

          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              href="/experiences"
              className={cn(buttonVariants({ variant: 'secondary', size: 'md' }))}
            >
              {t('actions.browseExperiences')}
            </Link>
            <Link href="/me" className={cn(buttonVariants({ variant: 'primary', size: 'md' }))}>
              {t('actions.backToAccount')}
            </Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <section className="mx-auto w-full max-w-3xl px-6 py-20 sm:py-24">
        <div className="flex flex-col gap-5">
          <p className={eyebrowClassName}>{t('eyebrow')}</p>
          <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
            {t('title')}
          </h1>
          <p className="text-sarat-black-600 max-w-2xl text-lg leading-relaxed">{t('intro')}</p>
          <p className="text-sarat-black-600 max-w-2xl text-sm leading-relaxed">{t('introMeta')}</p>
        </div>

        <div className="border-sarat-black/8 mt-12 [border-top-width:0.5px] pt-12">
          <HostApplyForm
            locale={loc}
            contactPhone={user.phone}
            initial={
              existing
                ? {
                    displayName: existing.displayName,
                    bioEn: existing.bioEn,
                    languages: [...existing.languages],
                    identityType: existing.identityType,
                    identityNumber: existing.identityNumber,
                    contactEmail: existing.contactEmail ?? '',
                    city: existing.city,
                    region: existing.region,
                  }
                : undefined
            }
            languageOptions={HOST_LANGUAGE_OPTIONS.map((value) => ({
              value,
              label: t(`languages.${value}`),
            }))}
            copy={{
              sectionAbout: t('sections.about'),
              sectionIdentity: t('sections.identity'),
              sectionContact: t('sections.contact'),
              displayNameLabel: t('fields.displayName.label'),
              displayNameHint: t('fields.displayName.hint'),
              bioLabel: t('fields.bio.label'),
              bioHint: t('fields.bio.hint'),
              languagesLabel: t('fields.languages.label'),
              languagesHint: t('fields.languages.hint'),
              identityTypeLabel: t('fields.identityType.label'),
              identityTypeNationalId: t('identityType.national_id'),
              identityTypeCr: t('identityType.cr'),
              identityNumberLabel: t('fields.identityNumber.label'),
              identityNumberHint: t('fields.identityNumber.hint'),
              contactPhoneLabel: t('fields.contactPhone.label'),
              contactPhoneHint: t('fields.contactPhone.hint'),
              contactEmailLabel: t('fields.contactEmail.label'),
              contactEmailHint: t('fields.contactEmail.hint'),
              submit: existing ? t('actions.resubmit') : t('actions.submit'),
              pending: t('actions.pending'),
              errors: {
                validation: t('errors.validation'),
                server: t('errors.server'),
                authRequired: t('errors.authRequired'),
                display_name_short: t('errors.fields.displayNameShort'),
                display_name_long: t('errors.fields.displayNameLong'),
                bio_short: t('errors.fields.bioShort'),
                bio_long: t('errors.fields.bioLong'),
                languages_required: t('errors.fields.languagesRequired'),
                identity_invalid: t('errors.fields.identityInvalid'),
                email_invalid: t('errors.fields.emailInvalid'),
                required: t('errors.fields.required'),
              },
            }}
          />
        </div>
      </section>
    </div>
  );
}
