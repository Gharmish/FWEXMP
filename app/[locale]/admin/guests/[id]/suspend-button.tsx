'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { ConfirmSubmit } from '@/components/ui/confirm-dialog';
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
  if (!suspended) {
    return (
      <ConfirmSubmit
        title={copy.suspend}
        description={copy.suspendConfirm}
        confirmLabel={copy.suspend}
        pendingLabel={copy.suspendPending}
        destructive
        variant="secondary"
        size="sm"
        className="border-al-qatt-red/40 text-al-qatt-red-800"
      >
        {copy.suspend}
      </ConfirmSubmit>
    );
  }
  return (
    <Button type="submit" variant="secondary" size="sm" pending={pending}>
      {pending ? copy.restorePending : copy.restore}
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
