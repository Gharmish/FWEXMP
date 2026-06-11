'use client';

import { useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { reportError } from '@/lib/log';

export default function LocaleError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations('error');
  const eyebrowClassName = cn(
    'text-al-qatt-red-800 text-[11px]',
    locale === 'en' && 'tracking-[0.2em] uppercase',
  );

  useEffect(() => {
    reportError(error, { surface: 'locale-error-boundary', locale, digest: error.digest });
  }, [error, locale]);

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-1 items-center px-6 py-24">
      <div className="flex max-w-2xl flex-col gap-6">
        <p className={eyebrowClassName}>{t('eyebrow')}</p>
        <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-6xl">
          {t('title')}
        </h1>
        <p className="text-sarat-black-600 max-w-xl text-lg">{t('description')}</p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => unstable_retry()}
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
      </div>
    </section>
  );
}
