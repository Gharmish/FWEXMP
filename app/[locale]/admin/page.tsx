import type { Metadata } from 'next';
import { ArrowRight } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { formatInteger } from '@/lib/format';
import { Price } from '@/components/ui/price';
import { getAdminDashboard } from '@/features/admin/dashboard/queries';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === 'ar' ? 'لوحة الإدارة' : 'Admin',
    robots: { index: false, follow: false },
  };
}

export default async function AdminIndexPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;
  const t = await getTranslations('admin');

  const eyebrowClassName = cn(
    'text-sarat-black-600 text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  const dashboard = await getAdminDashboard();

  const kpis = dashboard
    ? [
        {
          label: t('dashboard.kpi.gmv'),
          value: <Price amount={dashboard.gmvAllTimeSar} locale={loc} />,
        },
        {
          label: t('dashboard.kpi.bookings'),
          value: formatInteger(dashboard.bookingsTotal, loc),
          href: '/admin/bookings',
        },
        {
          label: t('dashboard.kpi.activeExperiences'),
          value: formatInteger(dashboard.activeExperiences, loc),
          href: '/admin/experience-moderation?status=live',
        },
        {
          label: t('dashboard.kpi.guests'),
          value: formatInteger(dashboard.guests, loc),
          href: '/admin/guests',
        },
      ]
    : [];

  const queue = dashboard
    ? [
        {
          href: '/admin/host-applications',
          label: t('dashboard.queue.applications'),
          count: dashboard.queue.pendingApplications,
        },
        {
          href: '/admin/experience-moderation',
          label: t('dashboard.queue.pendingReview'),
          count: dashboard.queue.pendingReview,
        },
        {
          href: '/admin/experience-moderation',
          label: t('dashboard.queue.changesRequested'),
          count: dashboard.queue.changesRequested,
        },
        {
          href: '/admin/bookings',
          label: t('dashboard.queue.pendingBookings'),
          count: dashboard.queue.pendingBookings,
        },
        {
          href: '/admin/bookings?view=upcoming',
          label: t('dashboard.queue.upcoming'),
          count: dashboard.queue.upcomingBookings,
        },
      ].filter((item) => item.count > 0)
    : [];

  const sections = [
    {
      href: '/admin/host-applications',
      title: t('sections.hostApplications.title'),
      description: t('sections.hostApplications.description'),
    },
    {
      href: '/admin/experience-moderation',
      title: t('sections.experienceModeration.title'),
      description: t('sections.experienceModeration.description'),
    },
    {
      href: '/admin/bookings',
      title: t('sections.bookings.title'),
      description: t('sections.bookings.description'),
    },
    {
      href: '/admin/payouts',
      title: t('sections.payouts.title'),
      description: t('sections.payouts.description'),
    },
    {
      href: '/admin/reviews',
      title: t('sections.reviews.title'),
      description: t('sections.reviews.description'),
    },
    {
      href: '/admin/analytics',
      title: t('sections.analytics.title'),
      description: t('sections.analytics.description'),
    },
    {
      href: '/admin/hosts',
      title: t('sections.hosts.title'),
      description: t('sections.hosts.description'),
    },
    {
      href: '/admin/guests',
      title: t('sections.guests.title'),
      description: t('sections.guests.description'),
    },
    {
      href: '/admin/activity',
      title: t('sections.activity.title'),
      description: t('sections.activity.description'),
    },
  ];

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        <p className={eyebrowClassName}>{t('eyebrow')}</p>
        <h1 className="font-display text-4xl font-medium tracking-[-0.035em] text-balance sm:text-5xl">
          {t('title')}
        </h1>
        <p className="text-sarat-black-600 max-w-2xl text-base leading-relaxed">{t('intro')}</p>
      </div>

      {/* KPIs */}
      {kpis.length > 0 && (
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((kpi) => {
            const cardClass =
              'border-sarat-black/8 rounded-card flex flex-col gap-1 [border-width:0.5px] p-6';
            const inner = (
              <>
                <dt className={eyebrowClassName}>{kpi.label}</dt>
                <dd className="font-display text-3xl font-medium tracking-[-0.03em]">
                  {kpi.value}
                </dd>
              </>
            );
            return 'href' in kpi && kpi.href ? (
              <Link
                key={kpi.label}
                href={kpi.href}
                className={cn(
                  cardClass,
                  'hover:border-sarat-black/20 transition-colors duration-200',
                )}
              >
                {inner}
              </Link>
            ) : (
              <div key={kpi.label} className={cardClass}>
                {inner}
              </div>
            );
          })}
        </dl>
      )}

      {/* Action queue */}
      {dashboard && (
        <section className="flex flex-col gap-4">
          <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
            {t('dashboard.queueHeading')}
          </h2>
          {queue.length === 0 ? (
            <p className="text-sarat-black-600 text-base">{t('dashboard.queueEmpty')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {queue.map((item, i) => (
                <li key={`${item.href}-${i}`}>
                  <Link
                    href={item.href}
                    className="border-sarat-black/8 rounded-card hover:border-sarat-black/20 group flex items-center justify-between gap-4 [border-width:0.5px] px-6 py-4 transition-colors duration-200"
                  >
                    <span className="flex items-center gap-3">
                      <span className="bg-saffron-gold/20 text-sarat-black inline-flex min-w-8 items-center justify-center rounded-full px-2 py-1 text-sm font-medium">
                        {formatInteger(item.count, loc)}
                      </span>
                      <span className="text-base font-medium">{item.label}</span>
                    </span>
                    <ArrowRight
                      className="text-sarat-black-600 size-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Section navigation */}
      <section className="flex flex-col gap-4">
        <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
          {t('dashboard.manageHeading')}
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {sections.map((section) => (
            <li key={section.href}>
              <Link
                href={section.href}
                className="border-sarat-black/8 rounded-card hover:border-sarat-black/20 group flex flex-col gap-3 [border-width:0.5px] p-6 transition-colors duration-200"
              >
                <h3 className="font-display text-xl font-medium tracking-[-0.02em]">
                  {section.title}
                </h3>
                <p className="text-sarat-black-600 text-base leading-relaxed">
                  {section.description}
                </p>
                <span className="text-sarat-black inline-flex items-center gap-2 text-sm font-medium">
                  {t('open')}
                  <ArrowRight
                    className="size-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
                    aria-hidden
                  />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
