import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  locale: Locale;
  /**
   * `filtered` (default): no matches for the active criteria — offer the
   * reset link. `catalogEmpty`: nothing is live at all, where a "clear
   * filters" CTA would just reload the same empty page.
   */
  variant?: 'filtered' | 'catalogEmpty';
}

/**
 * Empty state for the filtered experiences grid. Server component — the
 * "clear filters" action is a plain link back to the bare catalogue URL
 * (no search params), which resets every facet without needing client
 * state. The rail still owns the interactive per-facet reset.
 */
export function EmptyState({ locale, variant = 'filtered' }: EmptyStateProps) {
  const t = useTranslations('experiencesIndex.empty');
  const tf = useTranslations('experiencesIndex');
  const eyebrowClassName = cn(
    'text-sarat-black-600 text-[11px]',
    locale === 'en' && 'tracking-[0.2em] uppercase',
  );
  const catalogEmpty = variant === 'catalogEmpty';

  return (
    <div className="border-sarat-black/8 rounded-card flex flex-col items-start gap-4 [border-width:0.5px] p-10">
      <p className={eyebrowClassName}>{t('eyebrow')}</p>
      <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
        {catalogEmpty ? t('noneTitle') : t('title')}
      </h2>
      <p className="text-sarat-black-600 max-w-xl text-base">
        {catalogEmpty ? t('noneDescription') : t('description')}
      </p>
      {!catalogEmpty && (
        <Link href="/experiences" className={cn(buttonVariants({ variant: 'secondary' }), 'mt-2')}>
          {tf('reset')}
        </Link>
      )}
    </div>
  );
}
