import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect, Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { getCurrentUser } from '@/features/auth/queries';
import { getHostDashboard } from '@/features/host-dashboard/queries';
import { getMyExperienceById } from '@/features/host-experiences/queries';
import { ExperienceForm } from '@/app/[locale]/host/experiences/[id]/experience-form';
import { buildExperienceFormCopy } from '@/app/[locale]/host/experiences/[id]/build-form-copy';
import { LifecycleActions } from '@/app/[locale]/host/experiences/[id]/lifecycle-actions';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === 'ar' ? 'تعديل التجربة' : 'Edit experience',
    robots: { index: false, follow: false },
  };
}

const STATUS_TONE: Record<'draft' | 'live' | 'paused' | 'archived', string> = {
  draft: 'bg-sarat-black/8 text-sarat-black',
  live: 'bg-juniper-green/15 text-juniper-green',
  paused: 'bg-saffron-gold/20 text-sarat-black',
  archived: 'bg-rijal-clay/10 text-rijal-clay',
};

export default async function EditExperiencePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;

  const user = await getCurrentUser();
  if (!user) {
    redirect({ href: `/sign-in?next=/host/experiences/${id}`, locale: loc });
    throw new Error('unreachable');
  }

  const dashboard = await getHostDashboard();
  if (!dashboard) {
    redirect({ href: '/host/apply', locale: loc });
    throw new Error('unreachable');
  }

  const experience = await getMyExperienceById(id);
  if (!experience) notFound();

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
      <section className="mx-auto w-full max-w-3xl px-6 py-16 sm:py-20">
        <Link
          href="/host"
          className="text-sarat-black-600 inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium transition-opacity duration-200 hover:opacity-60"
        >
          <ArrowLeft className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
          {t('edit.back')}
        </Link>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <p className={eyebrowClassName}>{t(`status.${experience.status}.eyebrow`)}</p>
          <Badge className={STATUS_TONE[experience.status]}>
            {t(`status.${experience.status}.label`)}
          </Badge>
        </div>

        <h1 className="font-display mt-2 text-4xl font-medium tracking-[-0.035em] text-balance sm:text-5xl">
          {experience.titleEn}
        </h1>
        <p className="text-sarat-black-600 mt-2 text-sm" dir="ltr">
          /experiences/{experience.slug}
        </p>

        <div className="border-sarat-black/8 mt-10 [border-top-width:0.5px] pt-10">
          <LifecycleActions
            experienceId={experience.id}
            status={experience.status}
            locale={loc}
            copy={{
              publish: t('lifecycle.publish'),
              publishPending: t('lifecycle.publishPending'),
              pause: t('lifecycle.pause'),
              pausePending: t('lifecycle.pausePending'),
              republish: t('lifecycle.republish'),
              viewPublic: t('lifecycle.viewPublic'),
              errors: {
                cannot_publish: t('lifecycle.errors.cannotPublish'),
                not_found: t('lifecycle.errors.notFound'),
                forbidden: t('lifecycle.errors.forbidden'),
                no_db: t('lifecycle.errors.noDb'),
                server: t('lifecycle.errors.server'),
                validation: t('lifecycle.errors.validation'),
              },
            }}
          />
        </div>

        <div className="border-sarat-black/8 mt-10 [border-top-width:0.5px] pt-10">
          <h2 className={eyebrowClassName}>{t('edit.formHeading')}</h2>
          <div className="mt-6">
            <ExperienceForm
              mode="edit"
              locale={loc}
              experience={experience}
              copy={buildExperienceFormCopy(tForm)}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
