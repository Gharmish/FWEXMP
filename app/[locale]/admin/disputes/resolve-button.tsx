'use client';

import { useActionState } from 'react';
import { ConfirmSubmit } from '@/components/ui/confirm-dialog';
import { resolveDispute, type ResolveDisputeState } from '@/features/disputes/actions';

interface Copy {
  notesLabel: string;
  notesPlaceholder: string;
  resolve: string;
  pending: string;
  confirmTitle: string;
  confirmBody: string;
  errors: Record<'forbidden' | 'no_db' | 'not_found' | 'wrong_state' | 'server', string>;
}

export interface ResolveDisputeButtonProps {
  disputeId: string;
  copy: Copy;
}

const initialState: ResolveDisputeState = { success: false };

export function ResolveDisputeButton({ disputeId, copy }: ResolveDisputeButtonProps) {
  const [state, action] = useActionState(resolveDispute, initialState);
  const error =
    !state.success && state.message
      ? (copy.errors[state.message as keyof Copy['errors']] ?? copy.errors.server)
      : undefined;
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="disputeId" value={disputeId} />
      <label htmlFor={`notes-${disputeId}`} className="text-sm font-medium">
        {copy.notesLabel}
      </label>
      <textarea
        id={`notes-${disputeId}`}
        name="adminNotes"
        rows={2}
        maxLength={2000}
        placeholder={copy.notesPlaceholder}
        className="rounded-input border-sarat-black/20 text-sarat-black w-full [border-width:0.5px] bg-white p-3 text-sm"
      />
      {error && (
        <p role="alert" className="text-al-qatt-red-800 text-sm">
          {error}
        </p>
      )}
      <div>
        {/* Resolution is one-way (the action rejects a second resolve) —
            confirm instead of closing a guest report on a stray click. */}
        <ConfirmSubmit
          title={copy.confirmTitle}
          description={copy.confirmBody}
          confirmLabel={copy.resolve}
          pendingLabel={copy.pending}
          variant="primary"
          size="sm"
        >
          {copy.resolve}
        </ConfirmSubmit>
      </div>
    </form>
  );
}
