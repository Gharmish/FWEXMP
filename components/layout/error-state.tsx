'use client';

import { useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { Locale } from '@/lib/i18n';
import { buttonVariants } from '@/components/ui/button';
import { MountFade } from '@/components/ui/motion';
import { cn } from '@/lib/utils';
import { reportError } from '@/lib/log';

export interface ErrorStateProps {
  error: Error & { digest?: string };
  retry: () => void;
  /** Sentry surface tag, e.g. `admin-error-boundary`. */
  surface: string;
}

/**
 * Shared body for segment-level `error.tsx` boundaries (admin, host
 * dashboard). Same voice and layout as the locale-level boundary, minus
 * the "browse experiences" escape hatch — inside a dashboard shell the
 * right move is retry, and the rail is still there for navigation.
 */
export function ErrorState({ error, retry, surface }: ErrorStateProps) {
  const locale = useLocale() as Locale;
  const t = useTranslations('error');
  const eyebrowClassName = cn(
    'text-al-qatt-red-800 font-medium text-[11px]',
    locale === 'en' && 'tracking-[0.2em] uppercase',
  );

  useEffect(() => {
    reportError(error, { surface, locale, digest: error.digest });
  }, [error, locale, surface]);

  return (
    <section className="flex w-full flex-1 items-center py-24">
      <MountFade eager className="flex max-w-2xl flex-col gap-6">
        <p className={eyebrowClassName}>{t('eyebrow')}</p>
        <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance">
          {t('title')}
        </h1>
        <p className="text-sarat-black-600 max-w-xl text-lg">{t('description')}</p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => retry()}
            className={cn(buttonVariants({ variant: 'primary', size: 'lg' }))}
          >
            {t('retry')}
          </button>
        </div>
      </MountFade>
    </section>
  );
}
