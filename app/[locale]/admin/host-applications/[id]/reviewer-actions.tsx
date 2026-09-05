'use client';

import { useActionState, useId } from 'react';
import { FieldError } from '@/components/ui/field-error';
import { ConfirmSubmit } from '@/components/ui/confirm-dialog';
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
  | 'rejection_note_short'
  | 'documents_incomplete';

interface ReviewerActionsCopy {
  approveLabel: string;
  approvePending: string;
  rejectLabel: string;
  rejectPending: string;
  notesLabel: string;
  /** Distinct label for the reject textarea (M14 — was sharing notesLabel). */
  rejectNotesLabel: string;
  notesApproveHint: string;
  notesRejectHint: string;
  /** ConfirmSubmit copy (P2-17) — the applicant's name is already interpolated in. */
  confirmApproveTitle: string;
  confirmApproveDescription: string;
  confirmRejectTitle: string;
  confirmRejectDescription: string;
  errors: Record<ErrorKey, string>;
}

export interface ReviewerActionsProps {
  applicationId: string;
  locale: Locale;
  copy: ReviewerActionsCopy;
}

const initialState: AdminApplyResult = { success: false };

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
  'rounded-input border-sarat-black/20 bg-white text-sarat-black w-full resize-y [border-width:0.5px] px-4 py-3 text-base',
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
          aria-invalid={approveError ? true : undefined}
          aria-describedby={approveError ? approveErrorId : undefined}
          // React resets uncontrolled fields after an action; the echoed
          // value keeps a typed note through a failed submit (P1-6).
          defaultValue={approveState.values?.reviewerNotes ?? ''}
          className={TEXTAREA_CLASS}
        />
        <p className="text-sarat-black-600 text-sm">{copy.notesApproveHint}</p>

        <FieldError id={approveErrorId}>{approveError}</FieldError>

        <div className="flex justify-start">
          <ConfirmSubmit
            title={copy.confirmApproveTitle}
            description={copy.confirmApproveDescription}
            confirmLabel={copy.approveLabel}
            pendingLabel={copy.approvePending}
            variant="primary"
            size="md"
          >
            {copy.approveLabel}
          </ConfirmSubmit>
        </div>
      </form>

      <form
        action={rejectAction}
        className="border-sarat-black/8 flex flex-col gap-4 [border-top-width:0.5px] pt-8"
      >
        <input type="hidden" name="applicationId" value={applicationId} />
        <input type="hidden" name="locale" value={locale} />

        <label htmlFor={rejectNotesId} className="text-sm font-medium">
          {copy.rejectNotesLabel}
        </label>
        <textarea
          id={rejectNotesId}
          name="reviewerNotes"
          rows={3}
          required
          minLength={10}
          maxLength={2000}
          aria-invalid={rejectError ? true : undefined}
          aria-describedby={rejectError ? rejectErrorId : undefined}
          defaultValue={rejectState.values?.reviewerNotes ?? ''}
          className={TEXTAREA_CLASS}
        />
        <p className="text-sarat-black-600 text-sm">{copy.notesRejectHint}</p>

        <FieldError id={rejectErrorId}>{rejectError}</FieldError>

        <div className="flex justify-start">
          <ConfirmSubmit
            title={copy.confirmRejectTitle}
            description={copy.confirmRejectDescription}
            confirmLabel={copy.rejectLabel}
            pendingLabel={copy.rejectPending}
            variant="secondary"
            size="md"
            destructive
          >
            {copy.rejectLabel}
          </ConfirmSubmit>
        </div>
      </form>
    </div>
  );
}
