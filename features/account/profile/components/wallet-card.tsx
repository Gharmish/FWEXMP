import { Wallet } from 'lucide-react';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Price } from '@/components/ui/price';

export interface WalletCardCopy {
  title: string;
  balanceLabel: string;
  note: string;
}

export interface WalletCardProps {
  locale: Locale;
  copy: WalletCardCopy;
}

/**
 * Display-only wallet. BRIEF §8 has no wallet in the domain model and a
 * real stored balance is SAMA-regulated, so this shows a fixed SAR 0 with
 * a "coming soon" note — no ledger, no money movement. Replace with a real
 * balance read only once a licensed wallet exists.
 */
export function WalletCard({ locale, copy }: WalletCardProps) {
  return (
    <Card variant="dark" className="flex flex-col gap-6 p-6 sm:p-8">
      <div className="flex items-center justify-between">
        <span className="font-display text-xl font-medium tracking-[-0.02em]">{copy.title}</span>
        <span className="flex size-10 items-center justify-center rounded-full bg-white/10">
          <Wallet className="size-5 shrink-0" aria-hidden />
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <span
          className={cn(
            'text-[11px] text-white/60',
            // Letter-spacing severs connected Arabic glyphs — EN only.
            locale === 'en' && 'tracking-[0.2em] uppercase',
          )}
        >
          {copy.balanceLabel}
        </span>
        <Price amount={0} locale={locale} className="text-3xl text-white" />
      </div>
      <p className="text-xs leading-relaxed text-white/60">{copy.note}</p>
    </Card>
  );
}
