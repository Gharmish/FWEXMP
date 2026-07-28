import type { Metadata } from 'next';
import { Star } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect, Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate } from '@/lib/format';
import { getCurrentUser } from '@/features/auth/queries';
import { getHostDashboard } from '@/features/host-dashboard/queries';
import { getHostReviewAggregate, listReviewsForHost } from '@/features/reviews/queries';
import { RatingSummary } from '@/features/reviews/components/rating-summary';
import { HostReplyForm } from '@/app/[locale]/host/(dashboard)/reviews/host-reply-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'hostReviews.meta' });
  return {
    title: t('title'),
    robots: { index: false, follow: false },
  };
}

export default async function HostReviewsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;

  const user = await getCurrentUser();
  if (!user) {
    redirect({ href: '/sign-in?next=/host/reviews', locale: loc });
  }
  const dashboard = await getHostDashboard();
  if (!dashboard) {
    redirect({ href: '/host/apply', locale: loc });
  }

  const [t, rows, aggregate] = await Promise.all([
    getTranslations('hostReviews'),
    listReviewsForHost(),
    getHostReviewAggregate(),
  ]);

  const eyebrowClassName = cn(
    'text-sarat-black-600 text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  const replyCopy = {
    label: t('reply.label'),
    placeholder: t('reply.placeholder'),
    submit: t('reply.submit'),
    pending: t('reply.pending'),
    success: t('reply.success'),
    errors: {
      forbidden: t('reply.errors.forbidden'),
      no_db: t('reply.errors.noDb'),
      not_found: t('reply.errors.notFound'),
      already_replied: t('reply.errors.alreadyReplied'),
      validation: t('reply.errors.validation'),
      server: t('reply.errors.server'),
    },
  };

  return (
    <div className="flex w-full max-w-4xl flex-col gap-10">
      <div className="flex flex-col gap-4">
        <p className={eyebrowClassName}>{t('eyebrow')}</p>
        <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
          {t('title')}
        </h1>
        <p className="text-sarat-black-600 max-w-2xl text-base leading-relaxed">{t('intro')}</p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Star}
          eyebrow={t('empty.eyebrow')}
          title={t('empty.title')}
          description={t('empty.description')}
        />
      ) : (
        <>
          {/* Average + 1–5 histogram — the same aggregate block guests
              see on the public detail page, scoped to this host. */}
          <div className="border-sarat-black/8 rounded-card [border-width:0.5px] p-6">
            <RatingSummary aggregate={aggregate} locale={loc} />
          </div>
          <ul className="flex flex-col gap-6">
            {rows.map((row) => {
              const text = loc === 'ar' ? (row.textAr ?? row.textEn) : (row.textEn ?? row.textAr);
              return (
                <li
                  key={row.id}
                  className="border-sarat-black/8 rounded-card flex flex-col gap-3 [border-width:0.5px] p-6"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-col gap-1">
                      <Link
                        href={`/experiences/${row.experienceSlug}`}
                        className="text-sarat-black text-base font-medium underline-offset-4 hover:underline"
                      >
                        {loc === 'ar' ? row.experienceTitleAr : row.experienceTitleEn}
                      </Link>
                      <p className="text-sarat-black-600 text-sm">
                        {row.guestName} · {formatDate(new Date(row.createdAt), loc)}
                      </p>
                    </div>
                    <div
                      className="flex items-center gap-1"
                      aria-label={t('ratingLabel', { rating: row.rating })}
                    >
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Star
                          key={i}
                          className={cn(
                            'size-4 fill-current',
                            i <= row.rating ? 'text-saffron-gold' : 'text-sarat-black/20',
                          )}
                          aria-hidden
                        />
                      ))}
                    </div>
                  </div>
                  {text && (
                    <p className="text-sarat-black max-w-2xl text-base leading-relaxed">{text}</p>
                  )}
                  {row.hostReply ? (
                    <div className="border-sarat-black/8 bg-sarat-black/[0.02] rounded-input flex flex-col gap-1 [border-width:0.5px] p-4">
                      <p className={eyebrowClassName}>{t('yourReply')}</p>
                      <p className="text-sarat-black text-base leading-relaxed whitespace-pre-line">
                        {row.hostReply}
                      </p>
                    </div>
                  ) : (
                    <HostReplyForm reviewId={row.id} locale={loc} copy={replyCopy} />
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
