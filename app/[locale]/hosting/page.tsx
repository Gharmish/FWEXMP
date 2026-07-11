import type { Metadata } from 'next';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { FadeIn } from '@/components/ui/motion';
import { JsonLd } from '@/components/seo/json-ld';
import { getPlatformSettings } from '@/lib/platform-settings';

/**
 * Public, indexable host-recruitment landing page. Unlike `/host/apply`
 * (the auth-gated application form, `noindex`), this page is the crawlable
 * marketing surface: who can host, how the partnership works, what applying
 * involves, what documents to prepare, payouts, liability, and an FAQ. It
 * closes with a CTA into the gated form.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale, namespace: 'hosting' });
  return { title: t('meta.title'), description: t('meta.description') };
}

/** FAQ keys reused from the host-facing help entries so answers never drift. */
const FAQ_KEYS = ['becomeHost', 'requestWindow', 'payout', 'hostCancel', 'editListing'] as const;

export default async function HostingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;

  const [t, tFaq, settings] = await Promise.all([
    getTranslations('hosting'),
    getTranslations('helpFaq'),
    getPlatformSettings(),
  ]);
  const faqValues = { approvalHours: settings.approvalWindowHours };

  const eyebrowClassName = cn(
    'text-sarat-black-600 text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );
  const darkEyebrowClassName = cn(
    'text-saffron-gold text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  const stageKeys = ['apply', 'review', 'build', 'earn'] as const;
  const audienceKeys = ['individuals', 'companies'] as const;
  const pillarKeys = ['photography', 'training', 'distribution'] as const;
  const documentKeys = ['identity', 'licence', 'vat', 'iban'] as const;

  // Same strings as the visible FAQ so rich results can't drift from copy.
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_KEYS.map((key) => ({
      '@type': 'Question',
      name: tFaq(`items.${key}.q`, faqValues),
      acceptedAnswer: {
        '@type': 'Answer',
        text: tFaq(`items.${key}.a`, faqValues),
      },
    })),
  };

  return (
    <>
      <JsonLd data={faqJsonLd} />
      <div className="flex flex-col">
        {/* Hero */}
        <section className="mx-auto w-full max-w-3xl px-6 pt-20 pb-16 sm:pt-24">
          <FadeIn className="flex flex-col gap-5">
            <p className={eyebrowClassName}>{t('hero.eyebrow')}</p>
            <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-6xl">
              {t('hero.title')}
            </h1>
            <p className="text-sarat-black-600 max-w-2xl text-lg leading-relaxed">
              {t('hero.intro')}
            </p>
            <p className="text-sarat-black-600 max-w-2xl text-sm leading-relaxed">
              {t('hero.meta')}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Link
                href="/host/apply"
                className={cn(buttonVariants({ variant: 'primary', size: 'lg' }))}
              >
                {t('hero.primaryCta')}
              </Link>
              <Link
                href="/experiences"
                className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }))}
              >
                {t('hero.secondaryCta')}
              </Link>
            </div>
          </FadeIn>
        </section>

        {/* Who can host */}
        <section className="mx-auto w-full max-w-3xl px-6 py-14">
          <div className="border-sarat-black/8 flex flex-col gap-6 [border-top-width:0.5px] pt-12">
            <h2 className="font-display text-2xl font-medium tracking-[-0.025em] sm:text-3xl">
              {t('audience.heading')}
            </h2>
            <p className="text-sarat-black-600 max-w-2xl text-base leading-relaxed">
              {t('audience.intro')}
            </p>
            <div className="mt-2 grid gap-5 sm:grid-cols-2">
              {audienceKeys.map((key) => (
                <div
                  key={key}
                  className="border-sarat-black/8 rounded-card flex flex-col gap-2 [border-width:0.5px] p-6"
                >
                  <h3 className="text-base font-medium">{t(`audience.${key}.title`)}</h3>
                  <p className="text-sarat-black-600 text-sm leading-relaxed">
                    {t(`audience.${key}.body`)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How the partnership works */}
        <section className="mx-auto w-full max-w-3xl px-6 py-14">
          <div className="border-sarat-black/8 flex flex-col gap-6 [border-top-width:0.5px] pt-12">
            <h2 className="font-display text-2xl font-medium tracking-[-0.025em] sm:text-3xl">
              {t('partnership.heading')}
            </h2>
            <p className="text-sarat-black-600 max-w-2xl text-base leading-relaxed">
              {t('partnership.intro')}
            </p>
            <dl className="mt-2 grid gap-x-8 gap-y-6 sm:grid-cols-3">
              {pillarKeys.map((key) => (
                <div key={key} className="flex flex-col gap-1.5">
                  <dt className="text-base font-medium">{t(`partnership.${key}.title`)}</dt>
                  <dd className="text-sarat-black-600 text-sm leading-relaxed">
                    {t(`partnership.${key}.body`)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* How applying works — numbered stages */}
        <section className="mx-auto w-full max-w-3xl px-6 py-14">
          <div className="border-sarat-black/8 flex flex-col gap-6 [border-top-width:0.5px] pt-12">
            <h2 className="font-display text-2xl font-medium tracking-[-0.025em] sm:text-3xl">
              {t('stages.heading')}
            </h2>
            <ol className="flex list-none flex-col gap-6">
              {stageKeys.map((key, i) => (
                <li key={key} className="flex items-start gap-4">
                  <span
                    className="border-sarat-black/8 text-sarat-black flex size-8 shrink-0 items-center justify-center rounded-full [border-width:0.5px] text-sm font-medium"
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                  <div className="flex flex-col gap-1 pt-1">
                    <h3 className="text-base font-medium">{t(`stages.${key}.title`)}</h3>
                    <p className="text-sarat-black-600 text-sm leading-relaxed">
                      {t(`stages.${key}.body`, faqValues)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* What you'll need — documents */}
        <section className="mx-auto w-full max-w-3xl px-6 py-14">
          <div className="border-sarat-black/8 flex flex-col gap-6 [border-top-width:0.5px] pt-12">
            <h2 className="font-display text-2xl font-medium tracking-[-0.025em] sm:text-3xl">
              {t('documents.heading')}
            </h2>
            <p className="text-sarat-black-600 max-w-2xl text-base leading-relaxed">
              {t('documents.intro')}
            </p>
            <ul className="mt-2 flex flex-col gap-4">
              {documentKeys.map((key) => (
                <li
                  key={key}
                  className="border-sarat-black/8 flex flex-col gap-1 [border-bottom-width:0.5px] pb-4"
                >
                  <span className="text-base font-medium">{t(`documents.${key}.title`)}</span>
                  <span className="text-sarat-black-600 text-sm leading-relaxed">
                    {t(`documents.${key}.body`)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-sarat-black-600 max-w-2xl text-sm leading-relaxed">
              {t('documents.privacy')}
            </p>
          </div>
        </section>

        {/* Payouts & liability */}
        <section className="mx-auto w-full max-w-3xl px-6 py-14">
          <div className="border-sarat-black/8 flex flex-col gap-6 [border-top-width:0.5px] pt-12">
            <h2 className="font-display text-2xl font-medium tracking-[-0.025em] sm:text-3xl">
              {t('payout.heading')}
            </h2>
            <div className="text-sarat-black-600 flex flex-col gap-3 text-base leading-relaxed">
              <p>{t('payout.revenueShare')}</p>
              <p>{t('payout.payouts')}</p>
              <p>{t('payout.liability')}</p>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto w-full max-w-3xl px-6 py-14">
          <div className="border-sarat-black/8 flex flex-col gap-6 [border-top-width:0.5px] pt-12">
            <h2 className="font-display text-2xl font-medium tracking-[-0.025em] sm:text-3xl">
              {t('faq.heading')}
            </h2>
            <div className="border-sarat-black/8 flex flex-col [border-top-width:0.5px]">
              {FAQ_KEYS.map((key) => (
                <details
                  key={key}
                  className="border-sarat-black/8 group [border-bottom-width:0.5px]"
                >
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 py-5 text-lg font-medium [&::-webkit-details-marker]:hidden">
                    {tFaq(`items.${key}.q`, faqValues)}
                    <ChevronDown
                      className="text-sarat-black-600 size-5 shrink-0 transition-transform duration-200 group-open:rotate-180"
                      aria-hidden
                    />
                  </summary>
                  <p className="text-sarat-black-600 pb-6 text-base leading-relaxed">
                    {tFaq(`items.${key}.a`, faqValues)}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Closing CTA band — Originals treatment, pointed at hosts. */}
        <section className="bg-sarat-black text-white">
          <FadeIn className="mx-auto flex w-full max-w-3xl flex-col items-start gap-6 px-6 py-20">
            <p className={darkEyebrowClassName}>{t('cta.eyebrow')}</p>
            <h2 className="font-display max-w-2xl text-3xl font-medium tracking-[-0.03em] text-balance sm:text-4xl">
              {t('cta.title')}
            </h2>
            <p className="max-w-xl text-lg leading-relaxed text-white/70">{t('cta.body')}</p>
            <Link
              href="/host/apply"
              className={cn(buttonVariants({ variant: 'premium', size: 'lg' }), 'mt-2 gap-2')}
            >
              {t('cta.button')}
              <ArrowRight className="size-5 shrink-0 rtl:rotate-180" aria-hidden />
            </Link>
          </FadeIn>
        </section>
      </div>
    </>
  );
}
