import type { Metadata } from 'next';
import { ArrowRight, ArrowLeft, Plus } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/format';
import { Price } from '@/components/ui/price';
import {
  isAdminAndDbReady,
  listModerationQueue,
  type ModerationListFilter,
} from '@/features/admin/experience-moderation/queries';
import type { ExperienceStatus } from '@/features/admin/experience-moderation/types';

/** Filter chips shown above the list, in order. */
const FILTERS: ModerationListFilter[] = ['review', 'all', 'live', 'paused', 'draft', 'archived'];

function parseFilter(raw: string | string[] | undefined): ModerationListFilter {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v && (FILTERS as string[]).includes(v) ? (v as ModerationListFilter) : 'review';
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin.meta' });
  return {
    title: t('moderationTitle'),
    robots: { index: false, follow: false },
  };
}

const STATUS_TONE: Partial<Record<ExperienceStatus, string>> = {
  pending_review: 'bg-pending-surface text-pending',
  changes_requested: 'bg-rijal-clay/15 text-rijal-clay',
  live: 'bg-success-surface text-success',
  paused: 'bg-pending-surface text-pending',
  draft: 'bg-sarat-black/8 text-sarat-black',
  archived: 'bg-sarat-black/8 text-sarat-black',
};

export default async function AdminExperienceModerationPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;

  const sp = await searchParams;
  const filter = parseFilter(sp.status);

  const [block, queue, t] = await Promise.all([
    isAdminAndDbReady(),
    listModerationQueue(filter),
    getTranslations('admin'),
  ]);

  const filterLabel = (f: ModerationListFilter): string =>
    f === 'review'
      ? t('experienceModerationList.filter.review')
      : f === 'all'
        ? t('experienceModerationList.filter.all')
        : t(`experienceStatus.${f}`);

  const eyebrowClassName = cn(
    'text-sarat-black-600 font-medium text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        <Link
          href="/admin"
          className="text-sarat-black-600 inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium transition-opacity duration-200 hover:opacity-60"
        >
          <ArrowLeft className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
          {t('backToAdmin')}
        </Link>
        <p className={eyebrowClassName}>{t('experienceModerationList.eyebrow')}</p>
        <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
          {t('experienceModerationList.title')}
        </h1>
        <p className="text-sarat-black-600 max-w-2xl text-base leading-relaxed">
          {t('experienceModerationList.intro')}
        </p>
        <Link
          href="/admin/experiences/new"
          className="bg-sarat-black rounded-button inline-flex min-h-11 items-center gap-2 self-start px-5 text-sm font-medium text-white transition-transform duration-200 hover:-translate-y-px"
        >
          <Plus className="size-4 shrink-0" aria-hidden />
          {t('experienceModerationList.create')}
        </Link>
      </div>

      {block?.reason !== 'no_db' && (
        <nav
          aria-label={t('experienceModerationList.filterLabel')}
          className="flex flex-wrap gap-2"
        >
          {FILTERS.map((f) => {
            const active = f === filter;
            return (
              <Link
                key={f}
                href={`/admin/experience-moderation?status=${f}`}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-button min-h-11 px-4 py-2 text-sm font-medium transition-colors duration-200',
                  active
                    ? 'bg-sarat-black text-white'
                    : 'border-sarat-black/20 text-sarat-black [border-width:0.5px] hover:-translate-y-px',
                )}
              >
                {filterLabel(f)}
              </Link>
            );
          })}
        </nav>
      )}

      {block?.reason === 'no_db' ? (
        <div className="border-sarat-black/8 rounded-card flex flex-col items-start gap-4 [border-width:0.5px] p-10">
          <p className={eyebrowClassName}>{t('noDb.eyebrow')}</p>
          <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
            {t('noDb.title')}
          </h2>
          <p className="text-sarat-black-600 max-w-xl text-base">{t('noDb.description')}</p>
        </div>
      ) : queue.length === 0 ? (
        <div className="border-sarat-black/8 rounded-card flex flex-col items-start gap-4 [border-width:0.5px] p-10">
          <p className={eyebrowClassName}>{t('experienceModerationList.empty.eyebrow')}</p>
          <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
            {t('experienceModerationList.empty.title')}
          </h2>
          <p className="text-sarat-black-600 max-w-xl text-base">
            {t('experienceModerationList.empty.description')}
          </p>
        </div>
      ) : (
        <ul className="border-sarat-black/8 rounded-card flex flex-col divide-y divide-[var(--color-sarat-black)]/8 [border-width:0.5px]">
          {queue.map((row) => (
            <li key={row.id}>
              <Link
                href={`/admin/experience-moderation/${row.id}`}
                className="hover:bg-sarat-black/[0.02] flex items-center justify-between gap-4 p-5 transition-colors duration-200"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="truncate text-base font-medium">{row.titleEn}</span>
                    <Badge
                      className={STATUS_TONE[row.status] ?? 'bg-sarat-black/8 text-sarat-black'}
                    >
                      {t(`experienceStatus.${row.status}`)}
                    </Badge>
                  </div>
                  <div className="text-sarat-black-600 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span>{row.hostName}</span>
                    <span aria-hidden>·</span>
                    <span>{row.city}</span>
                    <span aria-hidden>·</span>
                    <span>
                      <Price amount={row.priceSar} locale={loc} />
                    </span>
                    {row.submittedAt && (
                      <>
                        <span aria-hidden>·</span>
                        <span>
                          {t('experienceModerationList.submittedOn', {
                            date: formatDate(new Date(row.submittedAt), loc),
                          })}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <ArrowRight
                  className="text-sarat-black-600 size-4 shrink-0 rtl:rotate-180"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
