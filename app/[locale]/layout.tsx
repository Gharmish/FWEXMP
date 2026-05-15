import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { bricolage, ibmPlexArabic } from '@/lib/fonts';
import { routing, localeDirection, type Locale } from '@/lib/i18n';
import '../globals.css';

export const metadata: Metadata = {
  title: 'Gharmish',
  description: 'Experiences hosted by the people who know Asir best.',
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
          <main className="flex flex-1 flex-col">{children}</main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
