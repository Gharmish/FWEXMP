import { Wallet } from 'lucide-react';
import type { Locale } from '@/lib/i18n';
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
    <Card variant="dark" className="flex flex-col gap-4 p-6">
      <div className="text-fog-white/70 inline-flex items-center gap-2 text-sm">
        <Wallet className="size-5 shrink-0" aria-hidden />
        {copy.title}
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-fog-white/70 text-[11px] tracking-[0.2em] uppercase">
          {copy.balanceLabel}
        </span>
        <Price amount={0} locale={locale} className="text-fog-white" />
      </div>
      <p className="text-fog-white/60 text-xs leading-relaxed">{copy.note}</p>
    </Card>
  );
}
