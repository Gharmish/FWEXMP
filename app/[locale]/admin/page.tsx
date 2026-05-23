import type { Metadata } from 'next';
import { ArrowRight } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';

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
      href: '/admin/analytics',
      title: t('sections.analytics.title'),
      description: t('sections.analytics.description'),
    },
    {
      href: '/admin/hosts',
      title: t('sections.hosts.title'),
      description: t('sections.hosts.description'),
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

      <ul className="grid gap-4 sm:grid-cols-2">
        {sections.map((section) => (
          <li key={section.href}>
            <Link
              href={section.href}
              className="border-sarat-black/8 rounded-card hover:border-sarat-black/20 group flex flex-col gap-3 [border-width:0.5px] p-6 transition-colors duration-200"
            >
              <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
                {section.title}
              </h2>
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
    </div>
  );
}
