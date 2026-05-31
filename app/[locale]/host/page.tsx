import type { Metadata } from 'next';
import { ArrowRight, Plus } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect, Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Compass } from 'lucide-react';
import { Price } from '@/components/ui/price';
import { getCurrentUser } from '@/features/auth/queries';
import { getHostDashboard } from '@/features/host-dashboard/queries';
import { listMyExperiences } from '@/features/host-experiences/queries';
import type { HostExperienceRow } from '@/features/host-experiences/queries';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === 'ar' ? 'لوحة المضيف' : 'Host dashboard',
    robots: { index: false, follow: false },
  };
}

export default async function HostDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;

  const user = await getCurrentUser();
  if (!user) {
    redirect({ href: '/sign-in?next=/host', locale: loc });
  }

  // Three branches:
  //   1. has hosts row → render dashboard
  //   2. no hosts row but has an application → /host/apply (status page)
  //   3. no anything → /host/apply (the form)
  // (2) and (3) both end at /host/apply because that page handles both.
  const dashboard = await getHostDashboard();
  if (!dashboard) {
    redirect({ href: '/host/apply', locale: loc });
  }

  const [t, experiences] = await Promise.all([
    getTranslations('hostDashboard'),
    listMyExperiences(),
  ]);
  const { host } = dashboard;

  const eyebrowClassName = cn(
    'text-sarat-black-600 text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  return (
    <div className="flex flex-col">
      <section className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-24">
        <div className="flex flex-col gap-5">
          <p className={eyebrowClassName}>{t('eyebrow')}</p>
          <h1 className="font-display text-4xl font-medium tracking-[-0.035em] text-balance sm:text-6xl">
            {t('greeting', { name: host.name })}
          </h1>
          {host.verificationStatus === 'suspended' && (
            <p
              role="status"
              className="border-al-qatt-red/40 bg-al-qatt-red/5 text-sarat-black rounded-card [border-width:0.5px] p-4 text-sm leading-relaxed"
            >
              {t('suspendedBanner')}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {host.verificationStatus === 'verified' && (
              <Badge variant="verified">{t('verifiedBadge')}</Badge>
            )}
            <p className="text-sarat-black-600 text-sm">
              {t('publicProfile')}{' '}
              <Link
                href={`/hosts/${host.slug}`}
                className="text-sarat-black inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
              >
                /hosts/{host.slug}
                <ArrowRight className="size-3.5 shrink-0 rtl:rotate-180" aria-hidden />
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* What's next — honest about the gaps. */}
      <section className="border-sarat-black/8 [border-top-width:0.5px]">
        <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
          <div className="mb-8 flex flex-col gap-2">
            <p className={eyebrowClassName}>{t('whatsNext.eyebrow')}</p>
            <h2 className="font-display text-3xl font-medium tracking-[-0.03em]">
              {t('whatsNext.title')}
            </h2>
          </div>
          <ol className="grid gap-3">
            <li className="border-sarat-black/8 rounded-card flex items-start gap-4 [border-width:0.5px] p-5">
              <span className="text-sarat-black-600 mt-1 text-sm tabular-nums">01</span>
              <div className="flex flex-col gap-1">
                <p className="text-base font-medium">{t('whatsNext.step1Title')}</p>
                <p className="text-sarat-black-600 text-sm leading-relaxed">
                  {t('whatsNext.step1Description')}
                </p>
              </div>
            </li>
            <li className="border-sarat-black/8 rounded-card flex items-start gap-4 [border-width:0.5px] p-5">
              <span className="text-sarat-black-600 mt-1 text-sm tabular-nums">02</span>
              <div className="flex flex-col gap-1">
                <p className="text-base font-medium">{t('whatsNext.step2Title')}</p>
                <p className="text-sarat-black-600 text-sm leading-relaxed">
                  {t('whatsNext.step2Description')}
                </p>
              </div>
            </li>
            <li className="border-sarat-black/8 rounded-card flex items-start gap-4 [border-width:0.5px] p-5">
              <span className="text-sarat-black-600 mt-1 text-sm tabular-nums">03</span>
              <div className="flex flex-col gap-1">
                <p className="text-base font-medium">{t('whatsNext.step3Title')}</p>
                <p className="text-sarat-black-600 text-sm leading-relaxed">
                  {t('whatsNext.step3Description')}
                </p>
              </div>
            </li>
          </ol>
        </div>
      </section>

      {/* Your experiences */}
      <section className="border-sarat-black/8 [border-top-width:0.5px]">
        <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
          <div className="mb-8 flex items-baseline justify-between gap-4">
            <h2 className="font-display text-3xl font-medium tracking-[-0.03em]">
              {t('experiences.title')}
            </h2>
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
            <ul className="border-sarat-black/8 rounded-card flex flex-col divide-y divide-[var(--color-sarat-black)]/8 [border-width:0.5px]">
              {experiences.map((experience) => (
                <ExperienceListRow
                  key={experience.id}
                  experience={experience}
                  locale={loc}
                  copy={{
                    status: t(`experiences.status.${experience.status}`),
                    perPerson: t('experiences.perPerson'),
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Quick actions */}
      <section className="border-sarat-black/8 [border-top-width:0.5px]">
        <div className="mx-auto w-full max-w-6xl px-6 py-12">
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/hosts/${host.slug}`}
              className={cn(buttonVariants({ variant: 'primary', size: 'md' }))}
            >
              {t('actions.viewPublicProfile')}
            </Link>
            <Link
              href="/experiences"
              className={cn(buttonVariants({ variant: 'secondary', size: 'md' }))}
            >
              {t('actions.browseCatalog')}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

const STATUS_TONE: Record<HostExperienceRow['status'], string> = {
  draft: 'bg-sarat-black/8 text-sarat-black',
  pending_review: 'bg-saffron-gold/20 text-sarat-black',
  changes_requested: 'bg-rijal-clay/15 text-rijal-clay',
  live: 'bg-juniper-green/15 text-juniper-green',
  paused: 'bg-saffron-gold/20 text-sarat-black',
  archived: 'bg-rijal-clay/10 text-rijal-clay',
};

function ExperienceListRow({
  experience,
  locale,
  copy,
}: {
  experience: HostExperienceRow;
  locale: Locale;
  copy: { status: string; perPerson: string };
}) {
  return (
    <li>
      <Link
        href={`/host/experiences/${experience.id}`}
        className="hover:bg-sarat-black/[0.02] flex items-center justify-between gap-4 p-5 transition-colors duration-200"
      >
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-3">
            <span className="truncate text-base font-medium">{experience.titleEn}</span>
            <Badge className={STATUS_TONE[experience.status]}>{copy.status}</Badge>
          </div>
          <div className="text-sarat-black-600 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span>{experience.placeName}</span>
            <span aria-hidden>·</span>
            <span>
              <Price amount={experience.priceSar} locale={locale} /> {copy.perPerson}
            </span>
            <span aria-hidden>·</span>
            <span>
              {experience.availabilityWeekdays.length === 0
                ? '—'
                : `${experience.availabilityWeekdays.length}d/wk`}
            </span>
          </div>
        </div>
        <ArrowRight className="text-sarat-black-600 size-4 shrink-0 rtl:rotate-180" aria-hidden />
      </Link>
    </li>
  );
}
