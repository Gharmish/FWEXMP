import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';

/**
 * The locale layout reads cookies (Navbar → getCurrentUser) and is the
 * shell every locale page lives under. Forcing dynamic at the layout
 * level is intentional: Next 16 otherwise streams the prerendered
 * shell BEFORE a child page-level `redirect()` or `notFound()` throws,
 * which makes the framework fall back to a `<meta http-equiv="refresh">`
 * tag in the body instead of a proper 307/404 response.
 *
 * Static gains are minimal — every locale page already opts into
 * dynamic rendering via cookie/searchParams reads — and clean status
 * codes matter more for auth gates than a fractional render saving.
 *
 * force-dynamic alone is NOT sufficient for real 404s: a loading.tsx
 * anywhere above a page is a Suspense boundary whose fallback flushes
 * the 200 shell before the page's async work can throw `notFound()`
 * (Next then streams the not-found UI with a noindex meta into the
 * committed 200 — a soft-404). That's why there is deliberately no
 * loading.tsx at this level and none above the public [slug] pages;
 * loading files below auth-gated segments (admin, host dashboard,
 * wishlist) are fine because those routes never need a crawlable 404.
 */
export const dynamic = 'force-dynamic';
import { preload } from 'react-dom';
import { bricolage } from '@/lib/fonts';
import { routing, localeDirection, type Locale } from '@/lib/i18n';
import { pickClientMessages } from '@/lib/client-messages';
import { ScrollToTop } from '@/components/layout/scroll-to-top';
import { CookieNotice } from '@/components/layout/cookie-notice';
import { MarketingPixels } from '@/components/layout/marketing-pixels';
import { WebVitalsReporter } from '@/features/analytics/web-vitals-reporter';
import { Analytics } from '@vercel/analytics/next';
import { UtmCapture } from '@/features/analytics/utm-capture';
import { MotionProvider } from '@/components/ui/motion';
import { ToastProvider } from '@/components/ui/toast';
import { DirectionProvider } from '@base-ui/react/direction-provider';
import { SITE_URL } from '@/lib/site';
import '../globals.css';

/**
 * Localized brand identity in metadata: the Arabic locale carries the
 * Arabic brand name (غارميش) and tagline instead of inheriting the
 * English strings (2026-08 brand audit). The default social image comes
 * from the file-convention `opengraph-image.tsx` in this segment, so no
 * static image is declared here.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'siteMeta' });
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: t('name'), template: `%s · ${t('name')}` },
    description: t('description'),
    openGraph: {
      title: t('name'),
      description: t('description'),
      url: SITE_URL,
      siteName: t('name'),
      locale: locale === 'ar' ? 'ar_SA' : 'en_US',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: t('name'),
      description: t('description'),
    },
    verification: {
      other: {
        'facebook-domain-verification': '9wb750bssvguoass0jugvtadqj5ecl',
        // Saudi Business Center (eauthenticate.saudibusiness.gov.sa) domain
        // ownership proof for gharmish.com. Must stay in the <head> of the
        // site's home page — the platform re-checks it, so don't remove it
        // after the first successful verification.
        'domain-verification': '8ce735346ed7dd313e0677ac47480a725f4b093969c7acc296b95634fce99673',
      },
    },
  };
}

export const viewport: Viewport = {
  // Brand accent in mobile browser chrome; matches manifest theme_color.
  themeColor: '#F5B800',
  // Lets the layout paint into the notch/home-indicator area so the
  // `env(safe-area-inset-*)` paddings the sticky bars rely on resolve to
  // real values instead of 0 on iOS.
  viewportFit: 'cover',
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Enables static rendering for this locale.
  setRequestLocale(locale);

  const dir = localeDirection[locale as Locale];
  const t = await getTranslations('nav');
  // Only the namespaces every client component may read reach the browser
  // (REACT-01). The admin and host dashboards nest their own provider with
  // their namespaces in a layout that re-renders on navigation — this one
  // does not, so a per-route subset here went stale on the first soft
  // navigation (second-pass verification F5). Server components keep the
  // full catalog. The public shell itself lives in (site)/layout.tsx.
  const clientMessages = pickClientMessages(await getMessages(), 'base');

  // Arabic pages preload the body and heading weights so the H1 paints in
  // the brand face instead of swapping in after the CSS parse (PERF-05).
  // 500 (labels, buttons) rides on the CSS discovery path.
  if (locale === 'ar') {
    for (const weight of [400, 600]) {
      preload(`/fonts/ibm-plex-sans-arabic-${weight}.woff2`, {
        as: 'font',
        type: 'font/woff2',
        crossOrigin: 'anonymous',
      });
    }
  }

  return (
    <html lang={locale} dir={dir} className={`${bricolage.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider messages={clientMessages}>
          <DirectionProvider direction={dir}>
            <MotionProvider>
              <ToastProvider>
                {/* Keyboard bypass-block (WCAG 2.4.1): hidden until focused. */}
                <a
                  href="#main-content"
                  className="bg-sarat-black rounded-button absolute -top-12 z-[60] ms-4 px-4 py-2 text-sm font-medium text-white transition-[top] duration-200 focus:top-4"
                >
                  {t('skipToContent')}
                </a>
                {children}
                <CookieNotice />
                <MarketingPixels />
                <WebVitalsReporter />
                {/* Vercel Web Analytics: cookieless, no cross-site identifier, so
                    it sits outside the consent gate like the first-party
                    analytics_events capture. Site-level visitors/referrers/
                    countries live in the Vercel dashboard (linked from /admin). */}
                <Analytics />
                <UtmCapture />
                {/* useSearchParams consumer — Suspense keeps prerender happy. */}
                <Suspense fallback={null}>
                  <ScrollToTop />
                </Suspense>
              </ToastProvider>
            </MotionProvider>
          </DirectionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
