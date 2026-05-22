import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';

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
 */
export const dynamic = 'force-dynamic';
import { bricolage, ibmPlexArabic } from '@/lib/fonts';
import { routing, localeDirection, type Locale } from '@/lib/i18n';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from '@/lib/site';
import '../globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  openGraph: {
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

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${bricolage.variable} ${ibmPlexArabic.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider>
          <Navbar />
          <main className="flex flex-1 flex-col">{children}</main>
          <Footer />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
