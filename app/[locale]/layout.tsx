import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';

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
import { bricolage, ibmPlexArabic } from '@/lib/fonts';
import { routing, localeDirection, type Locale } from '@/lib/i18n';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';
import { CookieNotice } from '@/components/layout/cookie-notice';
import { MarketingPixels } from '@/components/layout/marketing-pixels';
import { UtmCapture } from '@/features/analytics/utm-capture';
import { MotionProvider } from '@/components/ui/motion';
import { ToastProvider } from '@/components/ui/toast';
import { DirectionProvider } from '@base-ui/react/direction-provider';
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from '@/lib/site';
import '../globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  openGraph: {
    images: [{ url: `${SITE_URL}/images/gharmish-og.png`, width: 1200, height: 630 }],
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: SITE_NAME,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
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

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${bricolage.variable} ${ibmPlexArabic.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider>
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
                <Navbar />
                <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col">
                  {children}
                </main>
                <Footer />
                <CookieNotice />
                <MarketingPixels />
                <UtmCapture />
              </ToastProvider>
            </MotionProvider>
          </DirectionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
