'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { resolveTicket, type SupportActionState } from '@/features/support/actions';

/** The codes `resolveTicket` can return; each gets its own message (#375). */
type ResolveErrorKey = 'forbidden' | 'no_db' | 'not_found' | 'validation' | 'server';

export interface ResolveTicketFormProps {
  ticketId: string;
  copy: {
    label: string;
    placeholder: string;
    resolve: string;
    resolving: string;
    errors: Record<ResolveErrorKey, string>;
  };
}

function isResolveErrorKey(
  message: string,
  errors: Record<ResolveErrorKey, string>,
): message is ResolveErrorKey {
  return Object.hasOwn(errors, message);
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
        key={state.success ? 'resolved' : 'draft'}
        name="resolutionNote"
        defaultValue={!state.success ? state.values?.resolutionNote : ''}
        rows={2}
        maxLength={2000}
        placeholder={copy.placeholder}
        className="rounded-input border-sarat-black/20 text-sarat-black w-full border bg-white p-3 text-sm"
      />
      {!state.success && state.message && (
        <p role="alert" className="text-al-qatt-red-800 text-sm">
          {isResolveErrorKey(state.message, copy.errors)
            ? copy.errors[state.message]
            : copy.errors.server}
        </p>
      )}
      <div>
        <Button type="submit" variant="secondary" size="sm" pending={pending}>
          {pending ? copy.resolving : copy.resolve}
        </Button>
      </div>
    </form>
  );
}
