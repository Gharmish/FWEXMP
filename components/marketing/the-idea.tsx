import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/utils';
import type { Locale } from '@/lib/i18n';
import { FadeIn } from '@/components/ui/motion';

/**
 * "The idea" — a brief editorial beat between discovery rows: the brand
 * worldview in one breath (the best parts of a place aren't on the map;
 * its people hold them). Deliberately small — a pause, not a wall of
 * prose — so the homepage keeps its marketplace rhythm. Copy lives in
 * `home.idea`; Server Component, type does the work (no imagery, no
 * icons — restraint pillar, BRIEF §3).
 */
export interface TheIdeaProps {
  locale: Locale;
}

export async function TheIdea({ locale }: TheIdeaProps) {
  const t = await getTranslations('home.idea');
  const eyebrowClassName = cn(
    'text-sarat-black-600 font-medium text-[11px]',
    locale === 'en' && 'tracking-[0.2em] uppercase',
  );

  return (
    <section className="border-sarat-black/8 [border-top-width:0.5px]">
      <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
        <FadeIn className="flex max-w-2xl flex-col gap-4">
          <p className={eyebrowClassName}>{t('eyebrow')}</p>
          <h2 className="font-display text-3xl font-medium tracking-[-0.03em] text-balance sm:text-4xl">
            {t('title')}
          </h2>
          <p className="text-sarat-black-600 max-w-[60ch] text-lg leading-relaxed">{t('body')}</p>
        </FadeIn>
      </div>
    </section>
  );
}
