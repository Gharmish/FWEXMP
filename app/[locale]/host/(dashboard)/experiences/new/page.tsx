import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { getCurrentUser } from '@/features/auth/queries';
import { getHostDashboard } from '@/features/host-dashboard/queries';
import { NewExperienceForm } from '@/app/[locale]/host/(dashboard)/experiences/new/new-experience-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'hostExperiences.new.meta' });
  return {
    title: t('title'),
    robots: { index: false, follow: false },
  };
}

/**
 * Step one of a new listing — name + category, nothing else. The
 * draft row is created on submit and the host lands on the edit page
 * where each section (details, photos, timeline, calendar) saves on
 * its own.
 */
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
  }

  const dashboard = await getHostDashboard();
  if (!dashboard) {
    redirect({ href: '/host/apply', locale: loc });
  }

  const [t, tForm] = await Promise.all([
    getTranslations('hostExperiences'),
    getTranslations('hostExperiences.form'),
  ]);
  const eyebrowClassName = cn(
    'text-sarat-black-600 font-medium text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  return (
    <div className="flex flex-col">
      <section className="mx-auto w-full max-w-2xl">
        <div className="flex flex-col gap-4">
          <p className={eyebrowClassName}>{t('new.eyebrow')}</p>
          <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
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
          <NewExperienceForm
            locale={loc}
            copy={{
              titleLabel: tForm('titleLabel'),
              titleHint: t('new.titleHint'),
              titleArLabel: tForm('titleArLabel'),
              titleArHint: t('new.titleArHint'),
              categoryLabel: tForm('categoryLabel'),
              categories: {
                nature: tForm('categories.nature'),
                heritage: tForm('categories.heritage'),
                food: tForm('categories.food'),
                wellness: tForm('categories.wellness'),
                adventure: tForm('categories.adventure'),
                family: tForm('categories.family'),
                women_only: tForm('categories.women_only'),
              },
              submit: tForm('submitCreate'),
              submitPending: tForm('submitCreatePending'),
              errors: {
                validation: tForm('errors.validation'),
                server: tForm('errors.server'),
                forbidden: tForm('errors.forbidden'),
                noDb: tForm('errors.noDb'),
                titleEither: tForm('errors.fields.titleEither'),
                titleShort: tForm('errors.fields.titleShort'),
                titleLong: tForm('errors.fields.titleLong'),
                titleArInvalid: tForm('errors.fields.titleArInvalid'),
              },
            }}
          />
        </div>
      </section>
    </div>
  );
}
