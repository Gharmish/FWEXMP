'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { markHostPaid, type MarkPaidState } from '@/features/admin/payouts/actions';

interface MarkPaidButtonProps {
  hostId: string;
  label: string;
  pendingLabel: string;
  errorLabel: string;
}

const initialState: MarkPaidState = { success: false };

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="md" pending={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function MarkPaidButton({ hostId, label, pendingLabel, errorLabel }: MarkPaidButtonProps) {
  const [state, action] = useActionState(markHostPaid, initialState);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="hostId" value={hostId} />
      <Submit label={label} pendingLabel={pendingLabel} />
      {!state.success && state.message && (
        <p role="alert" className="text-al-qatt-red-800 text-sm">
          {errorLabel}
        </p>
      )}
    </form>
  );
}
