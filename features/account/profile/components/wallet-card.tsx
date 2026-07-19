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
  /** Whole SAR — SUM of the guest's wallet_ledger entries. */
  balanceSar: number;
  copy: WalletCardCopy;
}

/**
 * Gharmish Credit balance (owner-approved 2026-07 deviation from BRIEF
 * §8). Credit is platform-issued and non-withdrawable — no top-ups, no
 * cash-out — which keeps it outside SAMA stored-value licensing; a
 * legal read on that model is still an owner to-do. One owner-blessed
 * bounded exception (2026-07-19): after an emergency cancellation
 * refunded to credit, the guest may move the CARD-CHARGED share back to
 * the original payment method (refund-to-source of the original
 * capture — see features/wallet/refund-out-actions.ts). Credit spends
 * at checkout via the pay page's one-tap apply.
 */
export function WalletCard({ locale, balanceSar, copy }: WalletCardProps) {
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
        <Price amount={balanceSar} locale={locale} className="text-3xl text-white" />
      </div>
      <p className="text-xs leading-relaxed text-white/60">{copy.note}</p>
    </Card>
  );
}
