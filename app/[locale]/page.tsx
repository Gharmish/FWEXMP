import { getTranslations, setRequestLocale } from 'next-intl/server';
import { cn } from '@/lib/utils';
import type { Locale } from '@/lib/i18n';
import type { Category } from '@/lib/colors';
import { buttonVariants } from '@/components/ui/button';
import { ExperienceCard } from '@/features/experiences/components/experience-card';
import {
  CATEGORIES,
  getExperiences,
  getFeaturedExperiences,
} from '@/features/experiences/lib/sample-data';

// Category accent dots — literal classes so Tailwind v4 detects them.
const CATEGORY_DOT: Record<Category, string> = {
  nature: 'bg-juniper-green',
  heritage: 'bg-al-qatt-red',
  food: 'bg-saffron-gold',
  wellness: 'bg-wadi-mint',
  adventure: 'bg-soudah-sunset',
  family: 'bg-sarawat-blue',
};

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('home');
  const loc = locale as Locale;

  const experiences = getExperiences();
  const featured = getFeaturedExperiences();

  return (
    <div className="flex flex-col">
      {/* Hero — editorial, type-forward, no imagery (BRIEF §3). */}
      <section className="mx-auto w-full max-w-6xl px-6 py-24 sm:py-32">
        <div className="flex max-w-3xl flex-col gap-6">
          <p className="text-sarat-black-600 text-[11px] tracking-[0.2em] uppercase">
            {t('eyebrow')}
          </p>
          <h1 className="font-display text-5xl font-medium tracking-[-0.035em] text-balance sm:text-7xl">
            {t('headline')}
          </h1>
          <p className="text-sarat-black-600 max-w-xl text-lg">{t('intro')}</p>
          <div>
            <a
              href="#experiences"
              className={cn(buttonVariants({ variant: 'primary', size: 'lg' }))}
            >
              {t('cta')}
            </a>
          </div>
        </div>
      </section>

      {/* Category strip */}
      <section className="border-sarat-black/8 [border-top-width:0.5px]">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap gap-x-8 gap-y-3 px-6 py-8">
          {CATEGORIES.map((c) => (
            <span key={c.key} className="flex items-center gap-2 text-sm font-medium">
              <span className={cn('size-2 rounded-full', CATEGORY_DOT[c.key])} aria-hidden />
              {loc === 'ar' ? c.labelAr : c.labelEn}
            </span>
          ))}
        </div>
      </section>

      {/* Originals — featured, dark cards */}
      <section className="mx-auto w-full max-w-6xl px-6 py-20">
        <div className="mb-8 flex flex-col gap-2">
          <h2 className="font-display text-3xl font-medium tracking-[-0.03em]">
            {t('originalsTitle')}
          </h2>
          <p className="text-sarat-black-600 text-base">{t('originalsSub')}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {featured.map((e) => (
            <ExperienceCard key={e.slug} experience={e} locale={loc} />
          ))}
        </div>
      </section>

      {/* All experiences */}
      <section id="experiences" className="mx-auto w-full max-w-6xl scroll-mt-20 px-6 pb-24">
        <h2 className="font-display mb-8 text-3xl font-medium tracking-[-0.03em]">
          {t('allTitle')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {experiences.map((e) => (
            <ExperienceCard key={e.slug} experience={e} locale={loc} />
          ))}
        </div>
      </section>
    </div>
  );
}
