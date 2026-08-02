import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Price } from '@/components/ui/price';
import { isAdminAndDbReady } from '@/features/admin/guard';
import { getPromoCodesForAdmin } from '@/features/promo-codes/queries';
import { CreatePromoForm } from '@/app/[locale]/admin/promo-codes/create-promo-form';
import { PromoActiveToggle } from '@/app/[locale]/admin/promo-codes/promo-active-toggle';
import { notFound } from 'next/navigation';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin.meta' });
  return {
    title: t('promoCodesTitle'),
    robots: { index: false, follow: false },
  };
}

export default async function AdminPromoCodesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;
  const t = await getTranslations('admin');
  const eyebrowClassName = cn(
    'text-sarat-black-600 font-medium text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  const backLink = (
    <Link
      href="/admin"
      className="text-sarat-black-600 inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium transition-opacity duration-200 hover:opacity-60"
    >
      <ArrowLeft className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
      {t('backToAdmin')}
    </Link>
  );

  const block = await isAdminAndDbReady();
  if (block?.reason === 'not_admin') notFound();
  if (block?.reason === 'no_db') {
    return (
      <div className="flex flex-col gap-10">
        {backLink}
        <div className="border-sarat-black/8 rounded-card flex flex-col items-start gap-4 [border-width:0.5px] p-10">
          <p className={eyebrowClassName}>{t('noDb.eyebrow')}</p>
          <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
            {t('noDb.title')}
          </h2>
          <p className="text-sarat-black-600 max-w-xl text-base">{t('noDb.description')}</p>
        </div>
      </div>
    );
  }

  const codes = await getPromoCodesForAdmin();

  const createCopy = {
    codeLabel: t('promoCodes.form.codeLabel'),
    codeHint: t('promoCodes.form.codeHint'),
    labelLabel: t('promoCodes.form.labelLabel'),
    labelHint: t('promoCodes.form.labelHint'),
    typeLabel: t('promoCodes.form.typeLabel'),
    typePercent: t('promoCodes.form.typePercent'),
    typeFixed: t('promoCodes.form.typeFixed'),
    valueLabel: t('promoCodes.form.valueLabel'),
    minTotalLabel: t('promoCodes.form.minTotalLabel'),
    minTotalHint: t('promoCodes.form.minTotalHint'),
    maxRedemptionsLabel: t('promoCodes.form.maxRedemptionsLabel'),
    maxRedemptionsHint: t('promoCodes.form.maxRedemptionsHint'),
    maxPerGuestLabel: t('promoCodes.form.maxPerGuestLabel'),
    maxPerGuestHint: t('promoCodes.form.maxPerGuestHint'),
    startsAtLabel: t('promoCodes.form.startsAtLabel'),
    endsAtLabel: t('promoCodes.form.endsAtLabel'),
    optional: t('promoCodes.form.optional'),
    submit: t('promoCodes.form.submit'),
    submitPending: t('promoCodes.form.submitPending'),
    success: t('promoCodes.form.success'),
    fieldInvalid: t('promoCodes.form.fieldInvalid'),
    codeTaken: t('promoCodes.form.codeTaken'),
    formServer: t('promoCodes.form.formServer'),
    formForbidden: t('promoCodes.form.formForbidden'),
    formValidation: t('promoCodes.form.formValidation'),
  };

  const toggleCopy = {
    activate: t('promoCodes.activate'),
    deactivate: t('promoCodes.deactivate'),
    pending: t('promoCodes.saving'),
    formServer: t('promoCodes.formServer'),
    formForbidden: t('promoCodes.formForbidden'),
  };

  const panelClass =
    'border-sarat-black/8 rounded-card flex flex-col gap-6 [border-width:0.5px] p-6 sm:p-8';

  const discountText = (row: (typeof codes)[number]) =>
    row.discountType === 'percent' ? (
      <span className="tabular-nums">
        {t('promoCodes.percentValue', { pct: row.discountValue })}
      </span>
    ) : (
      <Price amount={row.discountValue} locale={loc} />
    );

  const windowText = (startsAt: string | null, endsAt: string | null) => {
    if (!startsAt && !endsAt) return t('promoCodes.noWindow');
    const start = startsAt ? formatDate(new Date(startsAt), loc) : t('promoCodes.openStart');
    const end = endsAt ? formatDate(new Date(endsAt), loc) : t('promoCodes.openEnd');
    return `${start} → ${end}`;
  };

  const now = new Date().getTime();
  const isExpired = (endsAt: string | null) => Boolean(endsAt && new Date(endsAt).getTime() <= now);
  const isScheduled = (startsAt: string | null) =>
    Boolean(startsAt && new Date(startsAt).getTime() > now);

  return (
    <div className="flex flex-col gap-10">
      {backLink}

      <div className="flex flex-col gap-4">
        <p className={eyebrowClassName}>{t('promoCodes.eyebrow')}</p>
        <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
          {t('sections.promoCodes.title')}
        </h1>
        <p className="text-sarat-black-600 max-w-2xl text-base leading-relaxed">
          {t('promoCodes.intro')}
        </p>
      </div>

      {/* Existing codes */}
      <section className={panelClass} aria-labelledby="promo-list">
        <div className="flex flex-col gap-1">
          <h2 id="promo-list" className="text-xl font-medium tracking-[-0.025em]">
            {t('promoCodes.listTitle')}
          </h2>
          <p className="text-sarat-black-600 text-sm">{t('promoCodes.listHint')}</p>
        </div>

        {codes.length === 0 ? (
          <p className="text-sarat-black-600 text-sm">{t('promoCodes.empty')}</p>
        ) : (
          <ul className="flex flex-col gap-6">
            {codes.map((row) => {
              const expired = isExpired(row.endsAt);
              const scheduled = isScheduled(row.startsAt);
              const live = row.active && !expired && !scheduled;
              return (
                <li
                  key={row.id}
                  className="border-sarat-black/8 flex flex-col gap-3 border-b [border-bottom-width:0.5px] pb-6 last:border-b-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-display text-lg font-medium tracking-[0.04em]" dir="ltr">
                      {row.code}
                    </span>
                    <Badge variant={live ? 'verified' : 'neutral'}>
                      {!row.active
                        ? t('promoCodes.inactiveBadge')
                        : expired
                          ? t('promoCodes.expiredBadge')
                          : scheduled
                            ? t('promoCodes.scheduledBadge')
                            : t('promoCodes.liveBadge')}
                    </Badge>
                    <span className="text-sarat-black-600 ms-auto">
                      <PromoActiveToggle
                        promoCodeId={row.id}
                        active={row.active}
                        locale={loc}
                        copy={toggleCopy}
                      />
                    </span>
                  </div>

                  {row.label && <p className="text-sarat-black-600 text-sm">{row.label}</p>}

                  <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-sarat-black-600 text-xs">
                        {t('promoCodes.discountLabel')}
                      </dt>
                      <dd className="text-base font-medium">{discountText(row)}</dd>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-sarat-black-600 text-xs">{t('promoCodes.minLabel')}</dt>
                      <dd className="text-base font-medium">
                        {row.minTotalSar != null ? (
                          <Price amount={row.minTotalSar} locale={loc} />
                        ) : (
                          '—'
                        )}
                      </dd>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-sarat-black-600 text-xs">
                        {t('promoCodes.redemptionsLabel')}
                      </dt>
                      <dd className="text-base font-medium tabular-nums">
                        {row.maxRedemptions != null
                          ? `${row.redemptions} / ${row.maxRedemptions}`
                          : `${row.redemptions} / ∞`}
                        {row.maxRedemptionsPerGuest != null && (
                          <span className="text-sarat-black-600 ms-1 text-xs font-normal">
                            {t('promoCodes.perGuestCap', { count: row.maxRedemptionsPerGuest })}
                          </span>
                        )}
                      </dd>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-sarat-black-600 text-xs">
                        {t('promoCodes.fundedLabel')}
                      </dt>
                      <dd className="text-base font-medium">
                        <Price amount={row.discountFundedSar} locale={loc} />
                      </dd>
                    </div>
                  </dl>

                  <p className="text-sarat-black-600 text-xs" dir="ltr">
                    {windowText(row.startsAt, row.endsAt)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Create */}
      <section className={panelClass} aria-labelledby="promo-create">
        <div className="flex flex-col gap-1">
          <h2 id="promo-create" className="text-xl font-medium tracking-[-0.025em]">
            {t('promoCodes.createTitle')}
          </h2>
          <p className="text-sarat-black-600 text-sm">{t('promoCodes.createHint')}</p>
        </div>
        <CreatePromoForm locale={loc} copy={createCopy} />
      </section>
    </div>
  );
}
