'use client';

import { useActionState } from 'react';
import { ConfirmSubmit } from '@/components/ui/confirm-dialog';
import { markHostPaid, type MarkPaidState } from '@/features/admin/payouts/actions';

interface MarkPaidButtonProps {
  hostId: string;
  /** The owed total rendered on the page — the action refuses on drift. */
  expectedAmountSar: number;
  label: string;
  pendingLabel: string;
  /** Confirm-dialog copy — recording a payout is irreversible. */
  confirmTitle: string;
  confirmBody: string;
  /** Keyed messages for the action's failure codes; `server` is the fallback. */
  errors: Partial<Record<NonNullable<MarkPaidState['message']>, string>> & { server: string };
}

const initialState: MarkPaidState = { success: false };

export function MarkPaidButton({
  hostId,
  expectedAmountSar,
  label,
  pendingLabel,
  confirmTitle,
  confirmBody,
  errors,
}: MarkPaidButtonProps) {
  const [state, action] = useActionState(markHostPaid, initialState);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="hostId" value={hostId} />
      <input type="hidden" name="expectedAmountSar" value={expectedAmountSar} />
      {/* Recording a transfer of real money is one-way — confirm it like
          every other irreversible admin action. */}
      <ConfirmSubmit
        title={confirmTitle}
        description={confirmBody}
        confirmLabel={label}
        pendingLabel={pendingLabel}
        variant="secondary"
        size="md"
      >
        {label}
      </ConfirmSubmit>
      {!state.success && state.message && (
        <p role="alert" className="text-al-qatt-red-800 text-sm">
          {errors[state.message] ?? errors.server}
        </p>
      )}
    </form>
  );
}
