'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Sheet } from '@/components/ui/sheet';
import { VerifiedSeal } from '@/components/ui/verified-seal';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * "Verified by Gharmish" — the badge as a door, not a sticker. Every
 * rendering is tappable and opens the same four-line receipt of what our
 * team actually checked, with the host's name written into each line.
 *
 * `variant="badge"`: pill lockup for host blocks and profile heroes.
 * `variant="line"`: the checkout trust sentence above the pay button.
 */
const CHECKS = ['identity', 'activity', 'location', 'review'] as const;

export interface VerifiedBadgeProps {
  /** Display name, already localized by the caller. */
  hostName: string;
  locale: Locale;
  /**
   * ISO timestamp of admin approval (host record mint time). Optional —
   * the sheet simply omits the dateline when unknown (sample-data path).
   */
  verifiedAt?: string;
  variant?: 'badge' | 'line';
  className?: string;
}

export function VerifiedBadge({
  hostName,
  locale,
  verifiedAt,
  variant = 'badge',
  className,
}: VerifiedBadgeProps) {
  const t = useTranslations('verifiedBadge');
  const [open, setOpen] = useState(false);

  const verifiedDate = verifiedAt
    ? formatDate(new Date(verifiedAt), locale, 'gregory', { month: 'long', year: 'numeric' })
    : null;

  return (
    <>
      {variant === 'badge' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            'border-sarat-black/8 text-sarat-black hover:border-juniper-green inline-flex min-h-8 items-center gap-1.5 rounded-full border bg-white ps-1.5 pe-3 text-xs font-medium transition-colors duration-200',
            className,
          )}
        >
          <VerifiedSeal className="size-4.5" />
          {t('lockup')}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            'text-sarat-black-600 hover:text-sarat-black inline-flex items-start gap-2 text-start text-sm leading-relaxed transition-colors duration-200',
            className,
          )}
        >
          <VerifiedSeal className="mt-0.5 size-4" />
          <span className="underline-offset-4 hover:underline">
            {t('trustLine', { host: hostName })}
          </span>
        </button>
      )}

      <Sheet open={open} onOpenChange={setOpen} title={t('sheetTitle')}>
        <div className="flex flex-col gap-5">
          <div className="flex items-start gap-3">
            <VerifiedSeal className="size-9" />
            <p className="text-sarat-black-600 text-sm leading-relaxed">{t('subtitle')}</p>
          </div>

          <ul className="flex flex-col gap-4">
            {CHECKS.map((check) => (
              <li key={check} className="flex items-start gap-3">
                <span className="bg-juniper-green mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full">
                  <Check className="size-3 text-white" strokeWidth={3} aria-hidden />
                </span>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sarat-black text-sm font-medium">{t(`${check}Title`)}</span>
                  <span className="text-sarat-black-600 text-sm leading-relaxed">
                    {t(`${check}Body`, { host: hostName })}
                  </span>
                </div>
              </li>
            ))}
          </ul>

          <div className="border-sarat-black/8 flex flex-wrap items-center justify-between gap-2 [border-top-width:0.5px] pt-4">
            {verifiedDate && (
              <span className="text-sarat-black-600 text-xs">
                {t('verifiedOn', { date: verifiedDate })}
              </span>
            )}
            <Link
              href="/trust-and-safety"
              className="text-juniper-green-800 text-xs font-medium underline-offset-4 transition-opacity duration-200 hover:opacity-60"
            >
              {t('how')}
            </Link>
          </div>
        </div>
      </Sheet>
    </>
  );
}
