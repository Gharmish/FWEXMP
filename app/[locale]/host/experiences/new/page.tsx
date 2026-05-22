import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { getCurrentUser } from '@/features/auth/queries';
import { getHostDashboard } from '@/features/host-dashboard/queries';
import { ExperienceForm } from '@/app/[locale]/host/experiences/[id]/experience-form';
import { buildExperienceFormCopy } from '@/app/[locale]/host/experiences/[id]/build-form-copy';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === 'ar' ? 'تجربة جديدة' : 'New experience',
    robots: { index: false, follow: false },
  };
}

export default async function NewExperiencePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;

  const user = await getCurrentUser();
  if (!user) {
    redirect({ href: '/sign-in?next=/host/experiences/new', locale: loc });
    throw new Error('unreachable');
  }

  const dashboard = await getHostDashboard();
  if (!dashboard) {
    redirect({ href: '/host/apply', locale: loc });
    throw new Error('unreachable');
  }

  const [t, tForm] = await Promise.all([
    getTranslations('hostExperiences'),
    getTranslations('hostExperiences.form'),
  ]);
  const eyebrowClassName = cn(
    'text-sarat-black-600 text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  return (
    <div className="flex flex-col">
      <section className="mx-auto w-full max-w-3xl px-6 py-20 sm:py-24">
        <div className="flex flex-col gap-4">
          <p className={eyebrowClassName}>{t('new.eyebrow')}</p>
          <h1 className="font-display text-4xl font-medium tracking-[-0.035em] text-balance sm:text-5xl">
            {t('new.title')}
          </h1>
          <p className="text-sarat-black-600 max-w-2xl text-base leading-relaxed">
            {t('new.intro')}
          </p>
          <p className="text-sarat-black-600 max-w-2xl text-sm leading-relaxed">
            {t('new.arabicNotice')}
          </p>
        </div>

        <div className="border-sarat-black/8 mt-12 [border-top-width:0.5px] pt-12">
          <ExperienceForm mode="create" locale={loc} copy={buildExperienceFormCopy(tForm)} />
        </div>
      </section>
    </div>
  );
}
