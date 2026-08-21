'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { resolveTicket, type SupportActionState } from '@/features/support/actions';

export interface ResolveTicketFormProps {
  ticketId: string;
  copy: { label: string; placeholder: string; resolve: string; resolving: string; error: string };
}

const initial: SupportActionState = { success: false };

export function ResolveTicketForm({ ticketId, copy }: ResolveTicketFormProps) {
  const [state, action, pending] = useActionState(resolveTicket, initial);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="ticketId" value={ticketId} />
      <label htmlFor={`resolve-${ticketId}`} className="text-sm font-medium">
        {copy.label}
      </label>
      <textarea
        id={`resolve-${ticketId}`}
        name="resolutionNote"
        rows={2}
        maxLength={2000}
        placeholder={copy.placeholder}
        className="rounded-input border-sarat-black/20 text-sarat-black w-full [border-width:0.5px] bg-white p-3 text-sm"
      />
      {!state.success && state.message && (
        <p role="alert" className="text-al-qatt-red-800 text-sm">
          {copy.error}
        </p>
      )}
      <div>
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? copy.resolving : copy.resolve}
        </Button>
      </div>
    </form>
  );
}
