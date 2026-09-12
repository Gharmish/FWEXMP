'use client';

import { useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { buttonVariants } from '@/components/ui/button';
import { MountFade } from '@/components/ui/motion';
import { cn } from '@/lib/utils';
import { reportError } from '@/lib/log';

export interface ErrorPageProps {
  error: Error & { digest?: string };
  retry: () => void;
  /** Where the boundary sits — reported with the error. */
  surface: string;
}

/**
 * The branded error body. Rendered inside the (site) layout's <main> for
 * public pages, and inside its own <main> by the locale-level boundary
 * (third-round verification N3).
 */
export function ErrorPage({ error, retry, surface }: ErrorPageProps) {
  const locale = useLocale() as Locale;
  const t = useTranslations('error');
  const eyebrowClassName = cn('text-al-qatt-red-800 text-eyebrow');

  useEffect(() => {
    reportError(error, { surface, locale, digest: error.digest });
  }, [error, locale, surface]);

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-1 items-center px-6 py-24">
      <MountFade eager className="flex max-w-2xl flex-col gap-6">
        <p className={eyebrowClassName}>{t('eyebrow')}</p>
        <h1 className="text-h1-lg">{t('title')}</h1>
        <p className="text-sarat-black-600 max-w-xl text-lg">{t('description')}</p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => retry()}
            className={cn(buttonVariants({ variant: 'primary', size: 'lg' }))}
          >
            {t('retry')}
          </button>
          <Link
            href="/experiences"
            className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }))}
          >
            {t('experiences')}
          </Link>
        </div>
      </MountFade>
    </section>
  );
}
