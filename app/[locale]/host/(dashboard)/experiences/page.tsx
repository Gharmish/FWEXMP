import type { Metadata } from 'next';
import { Compass, Plus } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { getMyListingStats, listMyExperiences } from '@/features/host-experiences/queries';
import type { HostExperienceRow } from '@/features/host-experiences/queries';
import {
  HOST_LISTING_STATUS_ORDER,
  HostListingRow,
} from '@/features/host-experiences/components/host-listing-row';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'hostExperiences.index.meta' });
  return {
    title: t('title'),
    robots: { index: false, follow: false },
  };
}

/**
 * The host's listings index — the rail's "Experiences" destination. The
 * layout has already gated auth + host status; `listMyExperiences()`
 * re-scopes to the signed-in host defensively. Rows sort by what needs
 * the host (changes requested → in review → live → paused → draft), and
 * archived listings sit under a fold (2026-08-22 audit P2-5).
 */
export default async function HostExperiencesIndexPage({
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
  const justDeleted = (Array.isArray(sp.deleted) ? sp.deleted[0] : sp.deleted) === '1';

  const [t, tIndex, experiences, stats] = await Promise.all([
    getTranslations('hostDashboard'),
    getTranslations('hostExperiences.index'),
    listMyExperiences(),
    getMyListingStats(),
  ]);

  const rank = (status: HostExperienceRow['status']) => HOST_LISTING_STATUS_ORDER.indexOf(status);
  const sorted = [...experiences].sort((a, b) => rank(a.status) - rank(b.status));
  const active = sorted.filter((e) => e.status !== 'archived');
  const archived = sorted.filter((e) => e.status === 'archived');

  const eyebrowClassName = cn(
    'text-sarat-black-600 font-medium text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  const nextStepFor = (status: HostExperienceRow['status']) => {
    switch (status) {
      case 'changes_requested':
        return tIndex('nextStep.changesRequested');
      case 'pending_review':
        return tIndex('nextStep.pendingReview');
      case 'draft':
        return tIndex('nextStep.draft');
      case 'paused':
        return tIndex('nextStep.paused');
      default:
        return undefined;
    }
  };

  const renderRow = (experience: HostExperienceRow) => {
    const s = stats.get(experience.id);
    return (
      <HostListingRow
        key={experience.id}
        experience={experience}
        stats={s}
        locale={loc}
        copy={{
          status: t(`experiences.status.${experience.status}`),
          perPerson: t('experiences.perPerson'),
          daysPerWeek:
            experience.availabilityWeekdays.length === 0
              ? '—'
              : t('experiences.daysPerWeek', {
                  count: experience.availabilityWeekdays.length,
                }),
          bookings30d: tIndex('bookings30d', { count: s?.bookings30d ?? 0 }),
          noRating: tIndex('noRating'),
          nextStep: nextStepFor(experience.status),
          noPhoto: tIndex('noPhoto'),
        }}
      />
    );
  };

  return (
    <div className="flex w-full flex-col gap-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-3">
          <p className={eyebrowClassName}>{tIndex('eyebrow')}</p>
          <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
            {tIndex('title')}
          </h1>
          <p className="text-sarat-black-600 max-w-2xl text-base leading-relaxed">
            {tIndex('intro')}
          </p>
        </div>
        <Link
          href="/host/experiences/new"
          className={cn(
            buttonVariants({ variant: 'primary', size: 'md' }),
            'inline-flex items-center gap-2',
          )}
        >
          <Plus className="size-4 shrink-0" aria-hidden />
          {t('experiences.newCta')}
        </Link>
      </div>

      {justDeleted && (
        <p
          role="status"
          className="border-sarat-black/8 bg-mist text-sarat-black rounded-card [border-width:0.5px] p-4 text-sm leading-relaxed"
        >
          {tIndex('deletedNotice')}
        </p>
      )}

      {experiences.length === 0 ? (
        <EmptyState
          icon={Compass}
          eyebrow={t('experiences.empty.eyebrow')}
          title={t('experiences.empty.title')}
          description={t('experiences.empty.description')}
          action={
            <Link
              href="/host/experiences/new"
              className={cn(buttonVariants({ variant: 'primary', size: 'lg' }))}
            >
              {t('experiences.newCta')}
            </Link>
          }
        />
      ) : (
        <>
          {active.length > 0 && (
            <ul className="border-sarat-black/8 divide-sarat-black/8 rounded-card divide-hairline flex flex-col [border-width:0.5px]">
              {active.map(renderRow)}
            </ul>
          )}
          {archived.length > 0 && (
            <details className="group flex flex-col gap-4">
              <summary className="text-sarat-black-600 hover:text-sarat-black inline-flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-medium">
                {tIndex('archivedFold', { count: archived.length })}
              </summary>
              <ul className="border-sarat-black/8 divide-sarat-black/8 rounded-card divide-hairline mt-4 flex flex-col [border-width:0.5px]">
                {archived.map(renderRow)}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
