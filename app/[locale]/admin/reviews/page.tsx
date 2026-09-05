import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft, Star } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { isAdminAndDbReady, listReviewsForAdmin } from '@/features/admin/reviews/queries';
import { ModerateButton } from '@/app/[locale]/admin/reviews/moderate-button';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin.meta' });
  return {
    title: t('reviewsTitle'),
    robots: { index: false, follow: false },
  };
}

export default async function AdminReviewsPage({
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
      <div className="flex flex-col gap-12">
        {backLink}
        <div className="border-sarat-black/8 rounded-card flex flex-col items-start gap-4 [border-width:0.5px] p-12">
          <p className={eyebrowClassName}>{t('noDb.eyebrow')}</p>
          <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
            {t('noDb.title')}
          </h2>
          <p className="text-sarat-black-600 max-w-xl text-base">{t('noDb.description')}</p>
        </div>
      </div>
    );
  }

  const rows = await listReviewsForAdmin();

  return (
    <div className="flex flex-col gap-12">
      {backLink}
      <div className="flex flex-col gap-4">
        <p className={eyebrowClassName}>{t('reviewsList.eyebrow')}</p>
        <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
          {t('reviewsList.title')}
        </h1>
        <p className="text-sarat-black-600 max-w-2xl text-base leading-relaxed">
          {t('reviewsList.intro')}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="border-sarat-black/8 rounded-card flex flex-col items-start gap-2 [border-width:0.5px] p-12">
          <p className={eyebrowClassName}>{t('reviewsList.empty.eyebrow')}</p>
          <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
            {t('reviewsList.empty.title')}
          </h2>
          <p className="text-sarat-black-600 max-w-xl text-base">
            {t('reviewsList.empty.description')}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => {
            const text = loc === 'ar' ? (row.textAr ?? row.textEn) : (row.textEn ?? row.textAr);
            return (
              <li
                key={row.id}
                className={cn(
                  'border-sarat-black/8 rounded-card flex flex-col gap-3 [border-width:0.5px] p-6',
                  row.hidden && 'opacity-60',
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-saffron-gold inline-flex items-center gap-1"
                        aria-label={t('reviewsList.ratingValue', { rating: row.rating })}
                      >
                        {Array.from({ length: row.rating }).map((_, i) => (
                          <Star key={i} className="size-4 fill-current" aria-hidden />
                        ))}
                      </span>
                      {row.hidden && (
                        <Badge className="bg-rijal-clay/15 text-rijal-clay">
                          {t('reviewsList.hiddenBadge')}
                        </Badge>
                      )}
                    </div>
                    <div className="text-sarat-black-600 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <span>{row.guestName}</span>
                      <span aria-hidden>·</span>
                      <Link
                        href={`/experiences/${row.experienceSlug}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {row.experienceTitleEn}
                      </Link>
                      <span aria-hidden>·</span>
                      <span>{formatDate(new Date(row.createdAt), loc)}</span>
                    </div>
                  </div>
                  <ModerateButton
                    reviewId={row.id}
                    hidden={row.hidden}
                    hideLabel={t('reviewsList.hide')}
                    unhideLabel={t('reviewsList.unhide')}
                    pendingLabel={t('reviewsList.moderating')}
                    errorLabel={t('reviewsList.moderateError')}
                  />
                </div>
                <p className="text-base leading-relaxed whitespace-pre-line">
                  {text ? (
                    text
                  ) : (
                    <span className="text-sarat-black-600 italic">{t('reviewsList.noText')}</span>
                  )}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
