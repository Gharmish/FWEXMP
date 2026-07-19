'use client';

import { useActionState } from 'react';
import type { Locale } from '@/lib/i18n';
import { ConfirmSubmit } from '@/components/ui/confirm-dialog';
import { requestRefundToCard, type RefundToCardState } from '@/features/wallet/refund-out-actions';

interface Copy {
  label: string;
  pending: string;
  confirmTitle: string;
  confirmDescription: string;
  doneRefunded: string;
  doneRefundPending: string;
  errors: {
    not_found: string;
    not_eligible: string;
    insufficient_balance: string;
    already_requested: string;
    validation: string;
    no_db: string;
    server: string;
  };
}

export interface RefundToCardButtonProps {
  reference: string;
  locale: Locale;
  copy: Copy;
}

const initialState: RefundToCardState = { status: 'idle' };

/**
 * "Move it back to my card" — the guest-side choice after an emergency
 * cancellation landed as Gharmish Credit. One confirmed click debits the
 * wallet and fires the refund-to-source reversal; the done states
 * distinguish "issued" from "on its way" (manual queue), mirroring the
 * cancellation flow's honesty about whether money actually moved.
 */
export function RefundToCardButton({ reference, locale, copy }: RefundToCardButtonProps) {
  const [state, action] = useActionState(requestRefundToCard, initialState);

  if (state.status === 'done') {
    return (
      <p role="status" className="text-juniper-green-800 text-sm font-medium">
        {state.outcome === 'refunded' ? copy.doneRefunded : copy.doneRefundPending}
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col items-start gap-1">
      <input type="hidden" name="reference" value={reference} />
      <input type="hidden" name="locale" value={locale} />
      <ConfirmSubmit
        title={copy.confirmTitle}
        description={copy.confirmDescription}
        confirmLabel={copy.label}
        pendingLabel={copy.pending}
        variant="secondary"
        size="md"
      >
        {copy.label}
      </ConfirmSubmit>
      {state.status === 'error' && (
        <p role="alert" className="text-al-qatt-red-800 text-xs">
          {copy.errors[state.error]}
        </p>
      )}
    </form>
  );
}
