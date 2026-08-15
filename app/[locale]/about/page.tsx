import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowRight, Mail, MessageCircle } from 'lucide-react';
import type { Locale } from '@/lib/i18n';
import { Link, routing } from '@/lib/i18n';
import { SITE_URL, SITE_NAME, SUPPORT_EMAIL } from '@/lib/site';
import { supportWhatsappE164 } from '@/lib/env';
import { whatsappLink } from '@/lib/whatsapp';
import { JsonLd } from '@/components/seo/json-ld';

/**
 * The canonical, linkable brand story (2026-08-15 marketing audit: the
 * narrative lived only as home-page sections, so a journalist, partner,
 * or curious guest had no About URL to land on — and the company had no
 * public contact surface at all). Story copy follows the 2026-08-14
 * brand-narrative split: the belief is place-agnostic, Chapter One is
 * Aseer.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'about' });
  const path = (l: string) => `${SITE_URL}/${l}/about`;
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: {
      canonical: path(locale),
      languages: {
        ...Object.fromEntries(routing.locales.map((l) => [l, path(l)])),
        'x-default': path('ar'),
      },
    },
    openGraph: {
      title: t('metaTitle'),
      description: t('metaDescription'),
      url: path(locale),
      type: 'website',
      images: [{ url: `${SITE_URL}/${locale}/opengraph-image`, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: t('metaTitle'),
      description: t('metaDescription'),
      images: [`${SITE_URL}/${locale}/opengraph-image`],
    },
  };
}

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;
  const t = await getTranslations({ locale, namespace: 'about' });
  const whatsapp = supportWhatsappE164();
  const whatsappHref = whatsapp ? whatsappLink(whatsapp) : null;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'AboutPage',
    name: t('metaTitle'),
    url: `${SITE_URL}/${loc}/about`,
    mainEntity: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL,
      email: SUPPORT_EMAIL,
      areaServed: 'Aseer, Saudi Arabia',
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        email: SUPPORT_EMAIL,
      },
    },
  };

  return (
    <article className="mx-auto w-full max-w-3xl px-6 py-12">
      <JsonLd data={jsonLd} />
      <header className="flex flex-col gap-4">
        <span className="text-saffron-gold-700 text-[11px] font-medium tracking-[0.2em] uppercase">
          {t('eyebrow')}
        </span>
        <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
          {t('title')}
        </h1>
      </header>

      <div className="text-sarat-black-600 mt-8 flex flex-col gap-5 text-base leading-relaxed">
        <p>{t('story1')}</p>
        <p>{t('story2')}</p>
        <p>{t('story3')}</p>
      </div>

      <section
        aria-label={t('contactHeading')}
        className="border-sarat-black/8 mt-12 flex flex-col gap-4 [border-top-width:0.5px] pt-8"
      >
        <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
          {t('contactHeading')}
        </h2>
        <p className="text-sarat-black-600 text-base leading-relaxed">{t('contactBody')}</p>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="inline-flex min-h-11 items-center gap-2 text-sm font-medium transition-opacity duration-200 hover:opacity-60"
          >
            <Mail className="size-4 shrink-0" aria-hidden />
            <span dir="ltr">{SUPPORT_EMAIL}</span>
          </a>
          {whatsappHref && (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-2 text-sm font-medium transition-opacity duration-200 hover:opacity-60"
            >
              <MessageCircle className="size-4 shrink-0" aria-hidden />
              {t('contactWhatsapp')}
            </a>
          )}
        </div>
      </section>

      <Link
        href="/experiences"
        className="mt-12 inline-flex min-h-11 items-center gap-2 text-sm font-medium underline underline-offset-4 transition-opacity duration-200 hover:opacity-60"
      >
        {t('exploreCta')}
        <ArrowRight className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
      </Link>
    </article>
  );
}
