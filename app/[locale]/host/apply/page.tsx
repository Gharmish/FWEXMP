import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect, Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { serverEnv, hasSupabaseAuth } from '@/lib/env';
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
  const t = await getTranslations({ locale, namespace: 'hostApply.meta' });
  const title = t('title');
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

          {existing.documents.length > 0 && (
            <section className="border-sarat-black/8 rounded-card mt-6 flex flex-col gap-4 [border-width:0.5px] p-6">
              <h2 className={eyebrowClassName}>{t('summary.documents')}</h2>
              <ul className="flex flex-col gap-3">
                {existing.documents.map((doc) => (
                  <li key={doc.id} className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-base font-medium">{t(`documentType.${doc.type}`)}</span>
                      <span className="text-sarat-black-600 text-sm">
                        {t(`documentStatus.${doc.status}`)}
                      </span>
                    </div>
                    {doc.status === 'rejected' && doc.reviewerNotes && (
                      <p className="text-al-qatt-red-800 text-sm whitespace-pre-line">
                        {doc.reviewerNotes}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

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
            documentsEnabled={Boolean(serverEnv.DATABASE_URL) && hasSupabaseAuth()}
            existingDocuments={(existing?.documents ?? []).map((doc) => ({
              type: doc.type,
              fileName: doc.fileName,
              status: doc.status,
              reviewerNotes: doc.reviewerNotes,
            }))}
            initial={
              existing
                ? {
                    displayName: existing.displayName,
                    bioEn: existing.bioEn,
                    bioAr: existing.bioAr ?? '',
                    languages: [...existing.languages],
                    identityType: existing.identityType,
                    identityNumber: existing.identityNumber,
                    legalName: existing.legalName ?? '',
                    dateOfBirth: existing.dateOfBirth ?? '',
                    iban: existing.iban ?? '',
                    bankName: existing.bankName ?? '',
                    bankAccountHolder: existing.bankAccountHolder ?? '',
                    vatNumber: existing.vatNumber ?? '',
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
              sectionPayout: t('sections.payout'),
              sectionDocuments: t('sections.documents'),
              sectionContact: t('sections.contact'),
              displayNameLabel: t('fields.displayName.label'),
              displayNameHint: t('fields.displayName.hint'),
              bioLabel: t('fields.bio.label'),
              bioHint: t('fields.bio.hint'),
              bioArLabel: t('fields.bioAr.label'),
              bioArHint: t('fields.bioAr.hint'),
              languagesLabel: t('fields.languages.label'),
              languagesHint: t('fields.languages.hint'),
              identityTypeLabel: t('fields.identityType.label'),
              identityTypeNationalId: t('identityType.national_id'),
              identityTypeCr: t('identityType.cr'),
              identityNumberLabel: t('fields.identityNumber.label'),
              identityNumberHint: t('fields.identityNumber.hint'),
              legalNameLabel: t('fields.legalName.label'),
              legalNameHint: t('fields.legalName.hint'),
              dateOfBirthLabel: t('fields.dateOfBirth.label'),
              vatNumberLabel: t('fields.vatNumber.label'),
              vatNumberHint: t('fields.vatNumber.hint'),
              ibanLabel: t('fields.iban.label'),
              ibanHint: t('fields.iban.hint'),
              bankNameLabel: t('fields.bankName.label'),
              bankAccountHolderLabel: t('fields.bankAccountHolder.label'),
              bankAccountHolderHint: t('fields.bankAccountHolder.hint'),
              documentsIntro: t('documents.intro'),
              documentOptional: t('documents.optional'),
              documentUploaded: t('documents.uploaded'),
              documentReplaceHint: t('documents.replaceHint'),
              documentStatuses: {
                pending: t('documentStatus.pending'),
                approved: t('documentStatus.approved'),
                rejected: t('documentStatus.rejected'),
              },
              documentLabels: {
                national_id: t('documentType.national_id'),
                cr_certificate: t('documentType.cr_certificate'),
                tourism_license: t('documentType.tourism_license'),
                signatory_id: t('documentType.signatory_id'),
                vat_certificate: t('documentType.vat_certificate'),
                iban_letter: t('documentType.iban_letter'),
              },
              documentErrors: {
                doc_required: t('errors.fields.docRequired'),
                doc_type: t('errors.fields.docType'),
                doc_size: t('errors.fields.docSize'),
              },
              termsLabel: t('fields.terms.label'),
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
                cooldown: t('errors.cooldown'),
                already_approved: t('errors.alreadyApproved'),
                upload_failed: t('errors.uploadFailed'),
                display_name_short: t('errors.fields.displayNameShort'),
                display_name_long: t('errors.fields.displayNameLong'),
                bio_short: t('errors.fields.bioShort'),
                bio_long: t('errors.fields.bioLong'),
                bio_ar_short: t('errors.fields.bioArShort'),
                bio_ar_long: t('errors.fields.bioArLong'),
                languages_required: t('errors.fields.languagesRequired'),
                identity_invalid: t('errors.fields.identityInvalid'),
                legal_name_short: t('errors.fields.legalNameShort'),
                legal_name_long: t('errors.fields.legalNameLong'),
                dob_required: t('errors.fields.dobRequired'),
                dob_invalid: t('errors.fields.dobInvalid'),
                dob_underage: t('errors.fields.dobUnderage'),
                iban_invalid: t('errors.fields.ibanInvalid'),
                bank_name_short: t('errors.fields.bankNameShort'),
                bank_name_long: t('errors.fields.bankNameLong'),
                account_holder_short: t('errors.fields.accountHolderShort'),
                account_holder_long: t('errors.fields.accountHolderLong'),
                vat_invalid: t('errors.fields.vatInvalid'),
                terms_required: t('errors.fields.termsRequired'),
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
