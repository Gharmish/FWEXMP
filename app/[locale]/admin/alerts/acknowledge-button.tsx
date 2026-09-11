'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { acknowledgeAlert, acknowledgeAllAlerts } from '@/features/admin/alerts/actions';
import type { AlertActionMessage, AlertActionState } from '@/features/admin/alerts/types';

export interface AcknowledgeButtonProps {
  /** One alert, or every open alert when omitted. */
  alertId?: string;
  copy: {
    label: string;
    pending: string;
    errors: Record<AlertActionMessage, string>;
  };
}

const initial: AlertActionState = { success: false };

export function AcknowledgeButton({ alertId, copy }: AcknowledgeButtonProps) {
  const [state, action, pending] = useActionState(
    alertId ? acknowledgeAlert : acknowledgeAllAlerts,
    initial,
  );
  const error = !state.success && state.message ? copy.errors[state.message] : null;
  return (
    <form action={action} className="flex flex-col items-start gap-2">
      {alertId && <input type="hidden" name="alertId" value={alertId} />}
      <Button type="submit" variant={alertId ? 'secondary' : 'primary'} size="sm" pending={pending}>
        {pending ? copy.pending : copy.label}
      </Button>
      {error && (
        <p role="alert" className="text-al-qatt-red-800 text-sm">
          {error}
        </p>
      )}
    </form>
  );
}
