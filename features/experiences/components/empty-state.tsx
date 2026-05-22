import { useTranslations } from 'next-intl';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  locale: Locale;
}

/**
 * Empty state for the filtered experiences grid. Server component —
 * the FilterBar owns the reset action because it already holds the
 * canonical criteria.
 */
export function EmptyState({ locale }: EmptyStateProps) {
  const t = useTranslations('experiencesIndex.empty');
  const eyebrowClassName = cn(
    'text-sarat-black-600 text-[11px]',
    locale === 'en' && 'tracking-[0.2em] uppercase',
  );

  return (
    <div className="border-sarat-black/8 rounded-card flex flex-col items-start gap-4 [border-width:0.5px] p-10">
      <p className={eyebrowClassName}>{t('eyebrow')}</p>
      <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">{t('title')}</h2>
      <p className="text-sarat-black-600 max-w-xl text-base">{t('description')}</p>
    </div>
  );
}
