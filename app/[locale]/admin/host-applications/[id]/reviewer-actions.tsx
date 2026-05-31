'use client';

import { useActionState, useId } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Locale } from '@/lib/i18n';
import {
  approveApplication,
  rejectApplication,
  type AdminApplyResult,
} from '@/features/host-applications/admin-actions';

type ErrorKey =
  | 'forbidden'
  | 'no_db'
  | 'not_found'
  | 'validation'
  | 'server'
  | 'rejection_note_short';

interface ReviewerActionsCopy {
  approveLabel: string;
  approvePending: string;
  rejectLabel: string;
  rejectPending: string;
  notesLabel: string;
  notesApproveHint: string;
  notesRejectHint: string;
  errors: Record<ErrorKey, string>;
}

export interface ReviewerActionsProps {
  applicationId: string;
  locale: Locale;
  copy: ReviewerActionsCopy;
}

const initialState: AdminApplyResult = { success: false };

function ApproveSubmit({ copy }: { copy: ReviewerActionsCopy }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="md" pending={pending}>
      {pending ? copy.approvePending : copy.approveLabel}
    </Button>
  );
}

function RejectSubmit({ copy }: { copy: ReviewerActionsCopy }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="md" pending={pending}>
      {pending ? copy.rejectPending : copy.rejectLabel}
    </Button>
  );
}

function errorMessage(result: AdminApplyResult, copy: ReviewerActionsCopy): string | undefined {
  if (result.message === 'validation' && result.fieldError) {
    const key = result.fieldError as ErrorKey;
    if (key in copy.errors) return copy.errors[key];
    return copy.errors.validation;
  }
  if (!result.message) return undefined;
  const key = result.message as ErrorKey;
  return key in copy.errors ? copy.errors[key] : copy.errors.server;
}

const TEXTAREA_CLASS = cn(
  'rounded-input border-sarat-black/20 bg-fog-white text-sarat-black w-full resize-y [border-width:0.5px] px-4 py-3 text-base',
  'placeholder:text-sarat-black-600 disabled:pointer-events-none disabled:opacity-50',
);

export function ReviewerActions({ applicationId, locale, copy }: ReviewerActionsProps) {
  const [approveState, approveAction] = useActionState(approveApplication, initialState);
  const [rejectState, rejectAction] = useActionState(rejectApplication, initialState);

  const approveError = errorMessage(approveState, copy);
  const rejectError = errorMessage(rejectState, copy);

  const approveErrorId = useId();
  const rejectErrorId = useId();
  const approveNotesId = useId();
  const rejectNotesId = useId();

  return (
    <div className="border-sarat-black/8 rounded-card flex flex-col gap-8 [border-width:0.5px] p-6">
      <form action={approveAction} className="flex flex-col gap-4">
        <input type="hidden" name="applicationId" value={applicationId} />
        <input type="hidden" name="locale" value={locale} />

        <label htmlFor={approveNotesId} className="text-sm font-medium">
          {copy.notesLabel}
        </label>
        <textarea
          id={approveNotesId}
          name="reviewerNotes"
          rows={3}
          maxLength={2000}
          className={TEXTAREA_CLASS}
        />
        <p className="text-sarat-black-600 text-sm">{copy.notesApproveHint}</p>

        {approveError && (
          <p
            id={approveErrorId}
            role="alert"
            className="text-al-qatt-red-800 text-sm focus:outline-none"
          >
            {approveError}
          </p>
        )}

        <div className="flex justify-start">
          <ApproveSubmit copy={copy} />
        </div>
      </form>

      <form
        action={rejectAction}
        className="border-sarat-black/8 flex flex-col gap-4 [border-top-width:0.5px] pt-8"
      >
        <input type="hidden" name="applicationId" value={applicationId} />
        <input type="hidden" name="locale" value={locale} />

        <label htmlFor={rejectNotesId} className="text-sm font-medium">
          {copy.notesLabel}
        </label>
        <textarea
          id={rejectNotesId}
          name="reviewerNotes"
          rows={3}
          required
          minLength={10}
          maxLength={2000}
          className={TEXTAREA_CLASS}
        />
        <p className="text-sarat-black-600 text-sm">{copy.notesRejectHint}</p>

        {rejectError && (
          <p
            id={rejectErrorId}
            role="alert"
            className="text-al-qatt-red-800 text-sm focus:outline-none"
          >
            {rejectError}
          </p>
        )}

        <div className="flex justify-start">
          <RejectSubmit copy={copy} />
        </div>
      </form>
    </div>
  );
}
