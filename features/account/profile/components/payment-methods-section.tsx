import { CreditCard } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

export interface PaymentMethodsCopy {
  eyebrow: string;
  emptyTitle: string;
  emptyDescription: string;
}

export interface PaymentMethodsSectionProps {
  copy: PaymentMethodsCopy;
}

/**
 * Display-only payment methods. BRIEF §5 forbids storing card data, and
 * Moyasar isn't wired yet — so this shows an empty state explaining that
 * saved cards arrive with Moyasar. No card data is collected or stored.
 * When Moyasar lands, replace with a list of tokenized cards (tokens only,
 * never PAN/CVV).
 */
export function PaymentMethodsSection({ copy }: PaymentMethodsSectionProps) {
  return (
    <EmptyState
      icon={CreditCard}
      eyebrow={copy.eyebrow}
      title={copy.emptyTitle}
      description={copy.emptyDescription}
    />
  );
}
