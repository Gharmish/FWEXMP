import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Price } from '@/components/ui/price';
import { CopyButton } from '@/components/ui/copy-button';
import { formatDate } from '@/lib/format';
import { BookingStatusBadge } from '@/features/bookings/components/booking-status-badge';
import { maskIban, maskIdentityNumber } from '@/features/admin/hosts/lib/mask';
import { getUserDetailForAdmin, isAdminAndDbReady } from '@/features/admin/users/queries';
import { UserRoleChips } from '@/features/admin/users/components/user-role-chips';
import { GuestEditForm } from '@/features/admin/users/components/guest-edit-form';
import { HostEditForm } from '@/features/admin/users/components/host-edit-form';
import type { UserRole } from '@/features/admin/users/types';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === 'ar' ? 'ملف المستخدم' : 'User profile',
    robots: { index: false, follow: false },
  };
}

const HOST_STATUS_TONE: Record<string, string> = {
  verified: 'bg-juniper-green/15 text-juniper-green',
  pending: 'bg-saffron-gold/20 text-sarat-black',
  suspended: 'bg-al-qatt-red/15 text-al-qatt-red',
};
const EXP_STATUS_TONE: Record<string, string> = {
  draft: 'bg-sarat-black/8 text-sarat-black',
  pending_review: 'bg-saffron-gold/20 text-sarat-black',
  changes_requested: 'bg-rijal-clay/15 text-rijal-clay',
  live: 'bg-juniper-green/15 text-juniper-green',
  paused: 'bg-saffron-gold/20 text-sarat-black',
  archived: 'bg-sarat-black/8 text-sarat-black',
};
const DOC_STATUS_TONE: Record<string, string> = {
  pending: 'bg-saffron-gold/20 text-sarat-black',
  approved: 'bg-juniper-green/15 text-juniper-green',
  rejected: 'bg-al-qatt-red/15 text-al-qatt-red',
};

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ locale: string; key: string }>;
}) {
  const { locale, key } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;
  const t = await getTranslations('admin');
  const eyebrow = cn(
    'text-sarat-black-600 text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  const block = await isAdminAndDbReady();
  if (block?.reason === 'not_admin') notFound();

  const user = block?.reason === 'no_db' ? undefined : await getUserDetailForAdmin(key);
  if (!user) notFound();

  const roleLabels: Record<UserRole, string> = {
    admin: t('users.roles.admin'),
    host: t('users.roles.host'),
    applicant: t('users.roles.applicant'),
    guest: t('users.roles.guest'),
  };

  const sectionHeading = 'font-display text-2xl font-medium tracking-[-0.025em]';
  const factGrid =
    'border-sarat-black/8 rounded-card grid gap-5 [border-width:0.5px] p-6 sm:grid-cols-2';

  const fact = (label: string, value: ReactNode, dir?: 'ltr') => (
    <div className="flex flex-col gap-1">
      <dt className={eyebrow}>{label}</dt>
      <dd className="text-base font-medium" dir={dir}>
        {value}
      </dd>
    </div>
  );

  return (
    <div className="flex flex-col gap-10">
      <Link
        href="/admin/users"
        className="text-sarat-black-600 inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium transition-opacity duration-200 hover:opacity-60"
      >
        <ArrowLeft className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
        {t('users.back')}
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-3">
        <p className={eyebrow}>{t('users.detail.eyebrow')}</p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
            {user.name}
          </h1>
          <UserRoleChips roles={user.roles} labels={roleLabels} />
        </div>
        <p className="text-sarat-black-600 text-sm">
          {t('users.joinedOn', { date: formatDate(new Date(user.createdAt), loc) })}
          {user.authUserId ? '' : ` · ${t('users.detail.noAccount')}`}
        </p>
      </div>

      {/* ---------------- GUEST FACET ---------------- */}
      {user.guest && (
        <section className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className={sectionHeading}>{t('users.detail.guestHeading')}</h2>
            {user.guest.suspendedAt && (
              <Badge className="bg-al-qatt-red/15 text-al-qatt-red">
                {t('users.detail.suspended')}
              </Badge>
            )}
          </div>

          <dl className={factGrid}>
            {fact(t('users.detail.phone'), user.guest.phone ?? '—', 'ltr')}
            {fact(t('users.detail.email'), user.guest.email ?? '—', 'ltr')}
            {fact(t('users.detail.language'), user.guest.preferredLanguage.toUpperCase())}
            {fact(
              t('users.detail.totalSpent'),
              <Price amount={user.guest.spentSar} locale={loc} />,
            )}
            {fact(t('users.detail.bookings'), user.guest.bookingsCount)}
            {fact(t('users.detail.saved'), user.guest.savedCount)}
          </dl>

          <GuestEditForm
            personKey={user.key}
            guest={user.guest}
            copy={{
              toggle: t('users.edit.guestToggle'),
              name: t('users.edit.name'),
              email: t('users.edit.email'),
              phone: t('users.edit.phone'),
              language: t('users.edit.language'),
              billing: t('users.edit.billing'),
              street1: t('users.edit.street1'),
              city: t('users.edit.city'),
              state: t('users.edit.state'),
              postcode: t('users.edit.postcode'),
              country: t('users.edit.country'),
              save: t('users.edit.save'),
              saving: t('users.edit.saving'),
              saved: t('users.edit.saved'),
              errors: {
                forbidden: t('users.edit.errors.forbidden'),
                no_db: t('users.edit.errors.noDb'),
                not_found: t('users.edit.errors.notFound'),
                validation: t('users.edit.errors.validation'),
                phone_taken: t('users.edit.errors.phoneTaken'),
                iban_invalid: t('users.edit.errors.ibanInvalid'),
                server: t('users.edit.errors.server'),
              },
            }}
          />

          {/* Bookings */}
          <div className="flex flex-col gap-3">
            <h3 className={eyebrow}>{t('users.detail.bookingsHeading')}</h3>
            {user.guest.bookings.length === 0 ? (
              <p className="text-sarat-black-600 text-sm">{t('users.detail.noBookings')}</p>
            ) : (
              <ul className="border-sarat-black/8 rounded-card flex flex-col divide-y divide-[var(--color-sarat-black)]/8 [border-width:0.5px]">
                {user.guest.bookings.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <Link
                          href={`/admin/bookings/${b.id}`}
                          className="text-base font-medium underline-offset-4 hover:underline"
                        >
                          {b.experienceTitleEn}
                        </Link>
                        <BookingStatusBadge
                          status={b.status}
                          label={t(`bookingStatus.${b.status}`)}
                        />
                      </div>
                      <span className="text-sarat-black-600 text-sm">
                        {formatDate(new Date(b.date), loc)} · {b.reference}
                        {b.promoCode ? ` · ${b.promoCode}` : ''}
                      </span>
                    </div>
                    <span className="text-base font-medium">
                      <Price amount={b.totalAmountSar} locale={loc} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Reviews */}
          <div className="flex flex-col gap-3">
            <h3 className={eyebrow}>{t('users.detail.reviewsHeading')}</h3>
            {user.guest.reviews.length === 0 ? (
              <p className="text-sarat-black-600 text-sm">{t('users.detail.noReviews')}</p>
            ) : (
              <ul className="border-sarat-black/8 rounded-card flex flex-col divide-y divide-[var(--color-sarat-black)]/8 [border-width:0.5px]">
                {user.guest.reviews.map((r) => (
                  <li key={r.id} className="flex flex-col gap-1 p-5">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-base font-medium">
                        {t('users.detail.ratingValue', { rating: r.rating })}
                      </span>
                      <Link
                        href={`/experiences/${r.experienceSlug}`}
                        className="text-sarat-black-600 text-sm underline-offset-4 hover:underline"
                      >
                        {r.experienceTitleEn}
                      </Link>
                      {r.hidden && (
                        <Badge className="bg-al-qatt-red/15 text-al-qatt-red">
                          {t('users.detail.reviewHidden')}
                        </Badge>
                      )}
                    </div>
                    {r.textEn && <p className="text-sm leading-relaxed">{r.textEn}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Disputes */}
          <div className="flex flex-col gap-3">
            <h3 className={eyebrow}>{t('users.detail.disputesHeading')}</h3>
            {user.guest.disputes.length === 0 ? (
              <p className="text-sarat-black-600 text-sm">{t('users.detail.noDisputes')}</p>
            ) : (
              <ul className="border-sarat-black/8 rounded-card flex flex-col divide-y divide-[var(--color-sarat-black)]/8 [border-width:0.5px]">
                {user.guest.disputes.map((d) => (
                  <li key={d.id} className="flex flex-col gap-1 p-5">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-mono text-sm" dir="ltr">
                        {d.bookingReference}
                      </span>
                      <Badge
                        className={
                          d.status === 'open'
                            ? 'bg-saffron-gold/20 text-sarat-black'
                            : 'bg-juniper-green/15 text-juniper-green'
                        }
                      >
                        {t(`users.detail.disputeStatus.${d.status}`)}
                      </Badge>
                      <span className="text-sarat-black-600 text-sm">
                        {formatDate(new Date(d.createdAt), loc)}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed">{d.message}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* ---------------- HOST FACET ---------------- */}
      {user.host && (
        <section className="border-sarat-black/8 flex flex-col gap-5 [border-top-width:0.5px] pt-10">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className={sectionHeading}>{t('users.detail.hostHeading')}</h2>
            <Badge className={HOST_STATUS_TONE[user.host.verificationStatus]}>
              {t(`hostStatus.${user.host.verificationStatus}`)}
            </Badge>
            <Link
              href={`/admin/hosts/${user.host.id}`}
              className="text-sarat-black-600 text-sm underline-offset-4 hover:underline"
            >
              {t('users.detail.openHostAdmin')}
            </Link>
          </div>

          <dl className={factGrid}>
            {fact(t('users.detail.slug'), user.host.slug, 'ltr')}
            {fact(t('users.detail.cityRegion'), `${user.host.city} · ${user.host.region}`)}
            {fact(t('users.detail.revenue'), <Price amount={user.host.revenueSar} locale={loc} />)}
            {fact(t('users.detail.liveBookings'), user.host.liveBookings)}
            {user.host.languages.length > 0 &&
              fact(t('users.detail.languages'), user.host.languages.join(' · '))}
            {user.host.contactEmail && fact(t('users.detail.email'), user.host.contactEmail, 'ltr')}
            {user.host.nationalId &&
              fact(
                t('users.detail.nationalId'),
                <span className="font-mono" dir="ltr">
                  {maskIdentityNumber(user.host.nationalId)}
                </span>,
              )}
            {user.host.crNumber &&
              fact(
                t('users.detail.crNumber'),
                <span className="font-mono" dir="ltr">
                  {maskIdentityNumber(user.host.crNumber)}
                </span>,
              )}
            <div className="flex flex-col gap-1">
              <dt className={eyebrow}>{t('users.detail.payoutIban')}</dt>
              {user.host.payoutIban ? (
                <dd className="inline-flex items-center gap-1 font-mono text-base font-medium">
                  <span dir="ltr">{maskIban(user.host.payoutIban)}</span>
                  <CopyButton value={user.host.payoutIban} label={t('payoutsList.copyIban')} />
                </dd>
              ) : (
                <dd className="text-warning text-base font-medium">{t('users.detail.noIban')}</dd>
              )}
            </div>
          </dl>

          <HostEditForm
            personKey={user.key}
            host={user.host}
            copy={{
              toggle: t('users.edit.hostToggle'),
              name: t('users.edit.name'),
              bioEn: t('users.edit.bioEn'),
              bioAr: t('users.edit.bioAr'),
              contactEmail: t('users.edit.contactEmail'),
              city: t('users.edit.city'),
              region: t('users.edit.region'),
              languages: t('users.edit.languages'),
              nationalId: t('users.detail.nationalId'),
              crNumber: t('users.detail.crNumber'),
              payoutIban: t('users.detail.payoutIban'),
              identityHint: t('users.edit.identityHint'),
              save: t('users.edit.save'),
              saving: t('users.edit.saving'),
              saved: t('users.edit.saved'),
              errors: {
                forbidden: t('users.edit.errors.forbidden'),
                no_db: t('users.edit.errors.noDb'),
                not_found: t('users.edit.errors.notFound'),
                validation: t('users.edit.errors.validation'),
                phone_taken: t('users.edit.errors.phoneTaken'),
                iban_invalid: t('users.edit.errors.ibanInvalid'),
                server: t('users.edit.errors.server'),
              },
            }}
          />

          {/* Experiences */}
          <div className="flex flex-col gap-3">
            <h3 className={eyebrow}>{t('users.detail.experiencesHeading')}</h3>
            {user.host.experiences.length === 0 ? (
              <p className="text-sarat-black-600 text-sm">{t('users.detail.noExperiences')}</p>
            ) : (
              <ul className="border-sarat-black/8 rounded-card flex flex-col divide-y divide-[var(--color-sarat-black)]/8 [border-width:0.5px]">
                {user.host.experiences.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-4 p-4">
                    <Link
                      href={`/experiences/${e.slug}`}
                      className="truncate text-base font-medium underline-offset-4 hover:underline"
                    >
                      {e.titleEn}
                    </Link>
                    <Badge className={EXP_STATUS_TONE[e.status]}>
                      {t(`experienceStatus.${e.status}`)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Payouts */}
          {user.host.payouts.length > 0 && (
            <div className="flex flex-col gap-3">
              <h3 className={eyebrow}>{t('users.detail.payoutsHeading')}</h3>
              <ul className="border-sarat-black/8 rounded-card flex flex-col divide-y divide-[var(--color-sarat-black)]/8 [border-width:0.5px]">
                {user.host.payouts.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-4 p-4">
                    <span className="text-sarat-black-600 text-sm">
                      {formatDate(new Date(p.createdAt), loc)} ·{' '}
                      {t('users.detail.payoutBookings', { count: p.bookingCount })}
                      {p.bankReference ? ` · ${p.bankReference}` : ''}
                    </span>
                    <span className="text-base font-medium">
                      <Price amount={p.amountSar} locale={loc} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* IBAN history */}
          {user.host.ibanEvents.length > 0 && (
            <div className="flex flex-col gap-3">
              <h3 className={eyebrow}>{t('users.detail.ibanHistoryHeading')}</h3>
              <ol className="flex flex-col gap-2">
                {user.host.ibanEvents.map((e) => (
                  <li key={e.id} className="text-sarat-black-600 flex flex-wrap gap-2 text-sm">
                    <span className="font-mono" dir="ltr">
                      {(e.previousIbanMasked ?? '—') + ' → ' + e.newIbanMasked}
                    </span>
                    <span>·</span>
                    <span>{formatDate(new Date(e.createdAt), loc)}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Status history */}
          {user.host.statusEvents.length > 0 && (
            <div className="border-sarat-black/8 rounded-card flex flex-col gap-4 [border-width:0.5px] p-6">
              <h3 className={eyebrow}>{t('users.detail.statusHistoryHeading')}</h3>
              <ol className="flex flex-col gap-4">
                {user.host.statusEvents.map((e) => (
                  <li key={e.id} className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <Badge
                        className={
                          e.event === 'suspended'
                            ? 'bg-al-qatt-red/15 text-al-qatt-red'
                            : 'bg-juniper-green/15 text-juniper-green'
                        }
                      >
                        {t(`hostStatusEvent.${e.event}`)}
                      </Badge>
                      <span className="text-sarat-black-600 text-sm">
                        {formatDate(new Date(e.createdAt), loc)}
                      </span>
                    </div>
                    {e.reviewerNotes && (
                      <p className="text-sm leading-relaxed whitespace-pre-line">
                        {e.reviewerNotes}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      )}

      {/* ---------------- APPLICATION FACET ---------------- */}
      {user.application && (
        <section className="border-sarat-black/8 flex flex-col gap-5 [border-top-width:0.5px] pt-10">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className={sectionHeading}>{t('users.detail.applicationHeading')}</h2>
            <Badge
              className={
                HOST_STATUS_TONE[
                  user.application.status === 'approved'
                    ? 'verified'
                    : user.application.status === 'rejected'
                      ? 'suspended'
                      : 'pending'
                ]
              }
            >
              {t(`users.detail.appStatus.${user.application.status}`)}
            </Badge>
            <Link
              href={`/admin/host-applications`}
              className="text-sarat-black-600 text-sm underline-offset-4 hover:underline"
            >
              {t('users.detail.openApplicationAdmin')}
            </Link>
          </div>

          <dl className={factGrid}>
            {fact(
              t('users.detail.identityType'),
              t(`users.detail.identityTypeValue.${user.application.identityType}`),
            )}
            {user.application.legalName &&
              fact(t('users.detail.legalName'), user.application.legalName)}
            {user.application.iban &&
              fact(
                t('users.detail.payoutIban'),
                <span className="font-mono" dir="ltr">
                  {maskIban(user.application.iban)}
                </span>,
              )}
            {user.application.vatNumber &&
              fact(
                t('users.detail.vatNumber'),
                <span dir="ltr">{user.application.vatNumber}</span>,
              )}
          </dl>

          {user.application.documents.length > 0 && (
            <div className="flex flex-col gap-3">
              <h3 className={eyebrow}>{t('users.detail.documentsHeading')}</h3>
              <ul className="flex flex-wrap gap-2">
                {user.application.documents.map((d) => (
                  <li key={d.type}>
                    <Badge className={DOC_STATUS_TONE[d.status]}>
                      {t(`documentType.${d.type}`)} · {t(`documents.status.${d.status}`)}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {user.application.reviewerNotes && (
            <p className="text-sm leading-relaxed whitespace-pre-line">
              {user.application.reviewerNotes}
            </p>
          )}
        </section>
      )}

      {/* ---------------- ADMIN EDIT AUDIT ---------------- */}
      <section className="border-sarat-black/8 flex flex-col gap-4 [border-top-width:0.5px] pt-10">
        <h2 className={sectionHeading}>{t('users.detail.auditHeading')}</h2>
        {user.profileEdits.length === 0 ? (
          <p className="text-sarat-black-600 text-sm">{t('users.detail.auditEmpty')}</p>
        ) : (
          <ol className="border-sarat-black/8 rounded-card flex flex-col divide-y divide-[var(--color-sarat-black)]/8 [border-width:0.5px]">
            {user.profileEdits.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-medium">{t(`users.field.${e.field}`)}</span>
                  <span className="text-sarat-black-600 text-sm" dir="ltr">
                    {(e.previousValue ?? '—') + ' → ' + (e.newValue ?? '—')}
                  </span>
                </div>
                <span className="text-sarat-black-600 shrink-0 text-sm">
                  {formatDate(new Date(e.createdAt), loc)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
