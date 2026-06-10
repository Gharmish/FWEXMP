'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  suspendGuest,
  unsuspendGuest,
  type GuestModerationState,
} from '@/features/admin/guests/actions';

interface Copy {
  suspend: string;
  suspendPending: string;
  suspendConfirm: string;
  restore: string;
  restorePending: string;
  errors: Record<'forbidden' | 'no_db' | 'not_found' | 'wrong_state' | 'server', string>;
}

export interface GuestSuspendButtonProps {
  guestId: string;
  suspended: boolean;
  copy: Copy;
}

const initialState: GuestModerationState = { success: false };

function Submit({ suspended, copy }: { suspended: boolean; copy: Copy }) {
  const { pending } = useFormStatus();
  const label = suspended
    ? pending
      ? copy.restorePending
      : copy.restore
    : pending
      ? copy.suspendPending
      : copy.suspend;
  return (
    <Button
      type="submit"
      variant="secondary"
      size="sm"
      pending={pending}
      className={cn(!suspended && 'border-al-qatt-red/40 text-al-qatt-red-800')}
      onClick={(e) => {
        if (!suspended && !window.confirm(copy.suspendConfirm)) e.preventDefault();
      }}
    >
      {label}
    </Button>
  );
}

export function GuestSuspendButton({ guestId, suspended, copy }: GuestSuspendButtonProps) {
  const [state, action] = useActionState(suspended ? unsuspendGuest : suspendGuest, initialState);
  const error =
    !state.success && state.message
      ? (copy.errors[state.message as keyof Copy['errors']] ?? copy.errors.server)
      : undefined;
  return (
    <form action={action} className="flex flex-col items-start gap-1">
      <input type="hidden" name="guestId" value={guestId} />
      <Submit suspended={suspended} copy={copy} />
      {error && (
        <p role="alert" className="text-al-qatt-red-800 text-xs">
          {error}
        </p>
      )}
    </form>
  );
}
