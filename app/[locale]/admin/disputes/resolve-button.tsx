'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { resolveDispute, type ResolveDisputeState } from '@/features/disputes/actions';

interface Copy {
  notesLabel: string;
  notesPlaceholder: string;
  resolve: string;
  pending: string;
  errors: Record<'forbidden' | 'no_db' | 'not_found' | 'wrong_state' | 'server', string>;
}

export interface ResolveDisputeButtonProps {
  disputeId: string;
  copy: Copy;
}

const initialState: ResolveDisputeState = { success: false };

function Submit({ copy }: { copy: Copy }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="sm" pending={pending}>
      {pending ? copy.pending : copy.resolve}
    </Button>
  );
}

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
        <Submit copy={copy} />
      </div>
    </form>
  );
}
