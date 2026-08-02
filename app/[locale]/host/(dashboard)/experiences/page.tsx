import type { Metadata } from 'next';
import { Compass, Plus } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { listMyExperiences } from '@/features/host-experiences/queries';
import { ExperienceListRow } from '@/features/host-experiences/components/experience-list-row';

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
 * re-scopes to the signed-in host defensively.
 */
export default async function HostExperiencesIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;

  const [t, tIndex, experiences] = await Promise.all([
    getTranslations('hostDashboard'),
    getTranslations('hostExperiences.index'),
    listMyExperiences(),
  ]);

  const eyebrowClassName = cn(
    'text-sarat-black-600 font-medium text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  return (
    <div className="flex w-full flex-col gap-10">
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
        <ul className="border-sarat-black/8 divide-sarat-black/8 rounded-card flex flex-col divide-y [border-width:0.5px]">
          {experiences.map((experience) => (
            <ExperienceListRow
              key={experience.id}
              experience={experience}
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
                commissionShare: t('experiences.commissionShare', {
                  pct: experience.commissionBps / 100,
                }),
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
