import { CreditCard } from 'lucide-react';

export interface PaymentMethodsCopy {
  emptyTitle: string;
  emptyDescription: string;
}

export interface PaymentMethodsSectionProps {
  copy: PaymentMethodsCopy;
}

/**
 * Display-only payment methods. BRIEF §5 forbids storing card data, and
 * card tokenization isn't wired yet — so this shows an empty state
 * explaining that saved cards arrive when online payments go live. No
 * card data is collected or stored. When HyperPay tokenization lands,
 * replace with a list of tokenized cards (tokens only, never PAN/CVV).
 */
export function PaymentMethodsSection({ copy }: PaymentMethodsSectionProps) {
  return (
    <div className="flex flex-1 flex-col gap-3">
      <span className="bg-sarat-black/5 flex size-10 items-center justify-center rounded-full">
        <CreditCard className="text-sarat-black-600 size-5 shrink-0" aria-hidden />
      </span>
      <div className="flex flex-col gap-1">
        <p className="font-medium">{copy.emptyTitle}</p>
        <p className="text-sarat-black-600 text-sm leading-relaxed">{copy.emptyDescription}</p>
      </div>
    </div>
  );
}
