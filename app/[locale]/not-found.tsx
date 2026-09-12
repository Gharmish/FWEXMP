import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { NotFoundPage } from '@/components/layout/not-found-page';

// P3-4: the tab otherwise falls back to the bare layout title ("Gharmish").
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: 'notFound' });
  return { title: t('metaTitle') };
}

/**
 * Locale-level 404: what the dashboards' notFound() renders (a signed-out
 * visitor to /admin). It sits outside the (site) layout, so it brings its
 * own <main> landmark for the skip link (third-round verification N3).
 */
export default function LocaleNotFound() {
  return (
    <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col">
      <NotFoundPage />
    </main>
  );
}
