'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import type { Locale } from '@/lib/i18n';
import { suspendHost, unsuspendHost, type AdminHostResult } from '@/features/admin/hosts/actions';
import type { HostVerificationStatus } from '@/features/admin/hosts/types';

type ErrorKey = 'forbidden' | 'no_db' | 'not_found' | 'validation' | 'server' | 'wrong_state';

interface Copy {
  suspendLabel: string;
  suspendPending: string;
  suspendConfirm: string;
  unsuspendLabel: string;
  unsuspendPending: string;
  errors: Record<ErrorKey, string>;
}

export interface HostActionsProps {
  hostId: string;
  status: HostVerificationStatus;
  /** Number of live experiences that would be paused on suspend. */
  livePublished: number;
  locale: Locale;
  copy: Copy;
}

const initialState: AdminHostResult = { success: false };

function SuspendSubmit({ copy }: { copy: Copy }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="secondary"
      size="md"
      disabled={pending}
      className="border-al-qatt-red/40 text-al-qatt-red-800"
    >
      {pending ? copy.suspendPending : copy.suspendLabel}
    </Button>
  );
}

function UnsuspendSubmit({ copy }: { copy: Copy }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="md" disabled={pending}>
      {pending ? copy.unsuspendPending : copy.unsuspendLabel}
    </Button>
  );
}

function errorMessage(result: AdminHostResult, copy: Copy): string | undefined {
  if (!result.message) return undefined;
  const key = result.message as ErrorKey;
  return key in copy.errors ? copy.errors[key] : copy.errors.server;
}

export function HostActions({ hostId, status, livePublished, locale, copy }: HostActionsProps) {
  const [suspendState, suspendAction] = useActionState(suspendHost, initialState);
  const [unsuspendState, unsuspendAction] = useActionState(unsuspendHost, initialState);
  const suspendError = errorMessage(suspendState, copy);
  const unsuspendError = errorMessage(unsuspendState, copy);

  // We don't surface lifecycle actions for `pending` hosts here — that
  // flow lives at /admin/host-applications. The detail page links over.
  if (status === 'pending') return null;

  if (status === 'verified') {
    return (
      <div className="border-sarat-black/8 rounded-card flex flex-col gap-3 [border-width:0.5px] p-6">
        <p className="text-sarat-black-600 text-sm leading-relaxed">{copy.suspendConfirm}</p>
        {livePublished > 0 && (
          <p className="text-sarat-black-600 text-xs">
            {/* Inline count — kept simple, not pluralised per-locale. */}
            {`${livePublished} live experience${livePublished === 1 ? '' : 's'} will be paused.`}
          </p>
        )}
        <form action={suspendAction} className="flex flex-col gap-3">
          <input type="hidden" name="hostId" value={hostId} />
          <input type="hidden" name="locale" value={locale} />
          {suspendError && (
            <p role="alert" className="text-al-qatt-red-800 text-sm">
              {suspendError}
            </p>
          )}
          <div className="flex justify-start">
            <SuspendSubmit copy={copy} />
          </div>
        </form>
      </div>
    );
  }

  // status === 'suspended'
  return (
    <div className="border-sarat-black/8 rounded-card flex flex-col gap-3 [border-width:0.5px] p-6">
      <form action={unsuspendAction} className="flex flex-col gap-3">
        <input type="hidden" name="hostId" value={hostId} />
        <input type="hidden" name="locale" value={locale} />
        {unsuspendError && (
          <p role="alert" className="text-al-qatt-red-800 text-sm">
            {unsuspendError}
          </p>
        )}
        <div className="flex justify-start">
          <UnsuspendSubmit copy={copy} />
        </div>
      </form>
    </div>
  );
}
