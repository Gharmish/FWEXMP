import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import {
  getAdminExperienceForEdit,
  getExperienceMoments,
  isAdminAndDbReady,
} from '@/features/admin/experiences/queries';
import {
  AddMomentForm,
  MomentCard,
  type MomentsCopy,
} from '@/app/[locale]/admin/experiences/[id]/moments/moments-editor';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin.meta' });
  return {
    title: t('momentsTitle'),
    robots: { index: false, follow: false },
  };
}

export default async function AdminMomentsPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;
  const t = await getTranslations('admin');
  const eyebrowClassName = cn(
    'text-sarat-black-600 font-medium text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  const block = await isAdminAndDbReady();
  if (block?.reason === 'not_admin') notFound();
  if (block?.reason === 'no_db') {
    return (
      <div className="flex flex-col gap-6">
        <p className={eyebrowClassName}>{t('noDb.eyebrow')}</p>
        <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">{t('noDb.title')}</h2>
        <p className="text-sarat-black-600 max-w-xl text-base">{t('noDb.description')}</p>
      </div>
    );
  }

  const [experience, moments, tM] = await Promise.all([
    getAdminExperienceForEdit(id),
    getExperienceMoments(id),
    getTranslations('admin.moments'),
  ]);
  if (!experience) notFound();

  const copy: MomentsCopy = {
    timeOfDay: tM('timeOfDay'),
    titleEn: tM('titleEn'),
    descriptionEn: tM('descriptionEn'),
    titleAr: tM('titleAr'),
    descriptionAr: tM('descriptionAr'),
    arHint: tM('arHint'),
    save: tM('save'),
    saving: tM('saving'),
    add: tM('add'),
    adding: tM('adding'),
    addHeading: tM('addHeading'),
    moveUp: tM('moveUp'),
    moveDown: tM('moveDown'),
    moving: tM('moving'),
    deleteLabel: tM('delete'),
    deleting: tM('deleting'),
    deleteConfirm: tM('deleteConfirm'),
    fieldInvalid: tM('fieldInvalid'),
    error: tM('error'),
  };

  return (
    <div className="flex flex-col gap-12">
      <div className="flex flex-col gap-4">
        <Link
          href={`/admin/experiences/${id}/edit`}
          className="text-sarat-black-600 inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium transition-opacity duration-200 hover:opacity-60"
        >
          <ArrowLeft className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
          {tM('back')}
        </Link>
        <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
          {tM('heading')}
        </h1>
        <p className="text-sarat-black-600 text-base">{experience.titleEn}</p>
        <p className="text-sarat-black-600 max-w-2xl text-base leading-relaxed">{tM('intro')}</p>
      </div>

      {moments.length > 0 && (
        <ol className="flex flex-col gap-4">
          {moments.map((moment, index) => (
            <MomentCard
              key={moment.id}
              moment={moment}
              experienceId={id}
              index={index}
              isFirst={index === 0}
              isLast={index === moments.length - 1}
              copy={copy}
            />
          ))}
        </ol>
      )}

      <AddMomentForm experienceId={id} copy={copy} />
    </div>
  );
}
