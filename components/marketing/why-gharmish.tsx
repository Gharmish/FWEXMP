import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/utils';
import type { Locale } from '@/lib/i18n';
import { Draw, FadeIn, Stagger, StaggerItem } from '@/components/ui/motion';

/**
 * "Why Gharmish" — the brand's trust band, mapping the three brief pillars
 * (Authenticity, Partnership, Restraint) to guest-facing promises. Set as
 * an editorial numbered manifesto: a drawn hairline rule and a ghost
 * numeral over each promise — type does the work, no icon clip-art
 * (restraint pillar, BRIEF §3). Server Component; copy comes from the
 * `home.whyGharmish` catalogue so both locales stay in next-intl.
 */
export interface WhyGharmishProps {
  locale: Locale;
}

export async function WhyGharmish({ locale }: WhyGharmishProps) {
  const t = await getTranslations('home.whyGharmish');
  // Arabic reads one type-scale step up (BRIEF §3): 11px + tracking is an
  // EN small-caps treatment — Arabic gets 13px with no added tracking.
  const eyebrowClassName = cn(
    'text-sarat-black-600 font-medium',
    locale === 'en' ? 'text-[11px] tracking-[0.2em] uppercase' : 'text-[13px]',
  );

  const pillars = [
    { title: t('rootedTitle'), body: t('rootedBody') },
    { title: t('hostedTitle'), body: t('hostedBody') },
    { title: t('qualityTitle'), body: t('qualityBody') },
  ];

  return (
    <section className="border-sarat-black/8 bg-mist [border-top-width:0.5px]">
      <div className="mx-auto w-full max-w-6xl px-6 py-20">
        <FadeIn className="mb-12 flex flex-col gap-2">
          <p className={eyebrowClassName}>{t('eyebrow')}</p>
          <h2 className="font-display text-3xl font-medium tracking-[-0.03em] sm:text-4xl">
            {t('title')}
          </h2>
        </FadeIn>
        <Stagger>
          <ol className="grid gap-10 sm:grid-cols-3 sm:gap-8">
            {pillars.map(({ title, body }, i) => (
              <li key={title}>
                <StaggerItem className="flex h-full flex-col gap-4">
                  {/* Rule draws from inline-start; numerals stay Latin in
                      both locales (BRIEF §4). */}
                  <Draw axis="x" delay={i * 0.1}>
                    <span className="bg-sarat-black/15 block h-px w-full" />
                  </Draw>
                  <span
                    aria-hidden
                    className="font-display text-sarat-black-200 text-5xl font-medium tracking-[-0.03em]"
                    dir="ltr"
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3 className="text-lg font-medium">{title}</h3>
                  <p className="text-sarat-black-600 max-w-[40ch] text-base leading-relaxed rtl:text-lg">
                    {body}
                  </p>
                </StaggerItem>
              </li>
            ))}
          </ol>
        </Stagger>
      </div>
    </section>
  );
}
