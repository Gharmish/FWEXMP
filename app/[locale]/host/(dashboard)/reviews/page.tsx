import type { Metadata } from 'next';
import { Star } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect, Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { pickLocalized } from '@/lib/ar-placeholder';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate } from '@/lib/format';
import { getHostDashboard } from '@/features/host-dashboard/queries';
import {
  getHostReviewAggregate,
  HOST_REVIEWS_PAGE_SIZE,
  listReviewsForHost,
} from '@/features/reviews/queries';
import { RatingSummary } from '@/features/reviews/components/rating-summary';
import { HostReplyForm } from '@/app/[locale]/host/(dashboard)/reviews/host-reply-form';

/** Hosts may edit a reply this long after posting it. */
const REPLY_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

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

export default async function HostReviewsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;

  const dashboard = await getHostDashboard();
  if (!dashboard) {
    redirect({ href: '/host/apply', locale: loc });
  }

  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);

  const [t, reviewPage, aggregate] = await Promise.all([
    getTranslations('hostReviews'),
    listReviewsForHost({ page: page - 1, pageSize: HOST_REVIEWS_PAGE_SIZE }),
    getHostReviewAggregate(),
  ]);
  const { rows, total, unreplied } = reviewPage;
  const pages = Math.max(1, Math.ceil(total / HOST_REVIEWS_PAGE_SIZE));

  const eyebrowClassName = cn(
    'text-sarat-black-600 font-medium text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  const replyCopy = {
    label: t('reply.label'),
    placeholder: t('reply.placeholder'),
    submit: t('reply.submit'),
    pending: t('reply.pending'),
    success: t('reply.success'),
    edit: t('reply.edit'),
    editLabel: t('reply.editLabel'),
    editSubmit: t('reply.editSubmit'),
    editSuccess: t('reply.editSuccess'),
    cancelEdit: t('reply.cancelEdit'),
    errors: {
      forbidden: t('reply.errors.forbidden'),
      no_db: t('reply.errors.noDb'),
      not_found: t('reply.errors.notFound'),
      already_replied: t('reply.errors.alreadyReplied'),
      expired: t('reply.errors.expired'),
      validation: t('reply.errors.validation'),
      server: t('reply.errors.server'),
    },
  };

  const pageHref = (p: number) => (p > 1 ? `/host/reviews?page=${p}` : '/host/reviews');

  return (
    <div className="flex w-full max-w-4xl flex-col gap-10">
      <div className="flex flex-col gap-4">
        <p className={eyebrowClassName}>{t('eyebrow')}</p>
        <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
          {t('title')}
        </h1>
        <p className="text-sarat-black-600 max-w-2xl text-base leading-relaxed">{t('intro')}</p>
        {unreplied > 0 && (
          <p
            role="status"
            className="border-saffron-gold/50 bg-saffron-gold/10 text-sarat-black rounded-card [border-width:0.5px] p-4 text-sm leading-relaxed"
          >
            {t('awaitingReply', { count: unreplied })}
          </p>
        )}
      </div>

      {total === 0 ? (
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
              const editable =
                row.hostReply !== null &&
                row.hostRepliedAt !== null &&
                new Date(row.hostRepliedAt).getTime() + REPLY_EDIT_WINDOW_MS > Date.now();
              return (
                <li
                  key={row.id}
                  className={cn(
                    'border-sarat-black/8 rounded-card flex flex-col gap-3 [border-width:0.5px] p-6',
                    row.hostReply === null && 'border-saffron-gold/50',
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-col gap-1">
                      <Link
                        href={`/experiences/${row.experienceSlug}`}
                        className="text-sarat-black inline-flex min-h-11 items-center text-base font-medium underline-offset-4 hover:underline"
                      >
                        {pickLocalized(loc, row.experienceTitleEn, row.experienceTitleAr)}
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
                      {editable && (
                        <HostReplyForm
                          reviewId={row.id}
                          locale={loc}
                          copy={replyCopy}
                          existingReply={row.hostReply}
                        />
                      )}
                    </div>
                  ) : (
                    <HostReplyForm reviewId={row.id} locale={loc} copy={replyCopy} />
                  )}
                </li>
              );
            })}
          </ul>
          {pages > 1 && (
            <nav aria-label={t('title')} className="flex items-center justify-between gap-4">
              {page > 1 ? (
                <Link
                  href={pageHref(page - 1)}
                  className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}
                >
                  {t('pagination.prev')}
                </Link>
              ) : (
                <span />
              )}
              <span className="text-sarat-black-600 text-sm tabular-nums">
                {t('pagination.pageOf', { page, pages })}
              </span>
              {page < pages ? (
                <Link
                  href={pageHref(page + 1)}
                  className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}
                >
                  {t('pagination.next')}
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
