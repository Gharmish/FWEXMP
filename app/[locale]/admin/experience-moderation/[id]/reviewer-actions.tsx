'use client';

import { useActionState, useId } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { FieldError } from '@/components/ui/field-error';
import { ConfirmSubmit } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';
import type { Locale } from '@/lib/i18n';
import {
  approveExperience,
  rejectExperience,
  requestExperienceChanges,
  type AdminModerationResult,
} from '@/features/admin/experience-moderation/actions';

type ErrorKey =
  | 'forbidden'
  | 'no_db'
  | 'not_found'
  | 'validation'
  | 'server'
  | 'wrong_state'
  | 'needs_hero'
  | 'needs_arabic'
  | 'needs_arabic_moments'
  | 'needs_arabic_lists'
  | 'needs_english'
  | 'reviewer_note_short';

interface Copy {
  approveLabel: string;
  approvePending: string;
  rejectLabel: string;
  rejectPending: string;
  requestChangesLabel: string;
  requestChangesPending: string;
  notesLabel: string;
  /** Distinct label for the reject textarea (M14 — was sharing notesLabel). */
  rejectNotesLabel: string;
  notesApproveHint: string;
  notesRejectHint: string;
  notesRequestChangesHint: string;
  /** ConfirmSubmit copy (P2-17) — the listing title is already interpolated in. */
  confirmRejectTitle: string;
  confirmRejectDescription: string;
  confirmRequestChangesTitle: string;
  confirmRequestChangesDescription: string;
  errors: Record<ErrorKey, string>;
}

export interface ReviewerActionsProps {
  experienceId: string;
  locale: Locale;
  copy: Copy;
}

const initialState: AdminModerationResult = { success: false };

function PrimarySubmit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="md" pending={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

function errorMessage(result: AdminModerationResult, copy: Copy): string | undefined {
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

export function ReviewerActions({ experienceId, locale, copy }: ReviewerActionsProps) {
  const [approveState, approveAction] = useActionState(approveExperience, initialState);
  const [requestState, requestAction] = useActionState(requestExperienceChanges, initialState);
  const [rejectState, rejectAction] = useActionState(rejectExperience, initialState);

  const approveError = errorMessage(approveState, copy);
  const requestError = errorMessage(requestState, copy);
  const rejectError = errorMessage(rejectState, copy);

  const approveErrorId = useId();
  const requestErrorId = useId();
  const rejectErrorId = useId();
  const approveNotesId = useId();
  const requestNotesId = useId();
  const rejectNotesId = useId();

  return (
    <div className="border-sarat-black/8 rounded-card flex flex-col gap-8 [border-width:0.5px] p-6">
      {/* Approve */}
      <form action={approveAction} className="flex flex-col gap-4">
        <input type="hidden" name="experienceId" value={experienceId} />
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
          <PrimarySubmit label={copy.approveLabel} pendingLabel={copy.approvePending} />
        </div>
      </form>

      {/* Request changes */}
      <form
        action={requestAction}
        className="border-sarat-black/8 flex flex-col gap-4 [border-top-width:0.5px] pt-8"
      >
        <input type="hidden" name="experienceId" value={experienceId} />
        <input type="hidden" name="locale" value={locale} />

        <label htmlFor={requestNotesId} className="text-sm font-medium">
          {copy.notesLabel}
        </label>
        <textarea
          id={requestNotesId}
          name="reviewerNotes"
          rows={3}
          required
          minLength={10}
          maxLength={2000}
          aria-invalid={requestError ? true : undefined}
          aria-describedby={requestError ? requestErrorId : undefined}
          defaultValue={requestState.values?.reviewerNotes ?? ''}
          className={TEXTAREA_CLASS}
        />
        <p className="text-sarat-black-600 text-sm">{copy.notesRequestChangesHint}</p>

        <FieldError id={requestErrorId}>{requestError}</FieldError>

        <div className="flex justify-start">
          <ConfirmSubmit
            title={copy.confirmRequestChangesTitle}
            description={copy.confirmRequestChangesDescription}
            confirmLabel={copy.requestChangesLabel}
            pendingLabel={copy.requestChangesPending}
            variant="secondary"
            size="md"
          >
            {copy.requestChangesLabel}
          </ConfirmSubmit>
        </div>
      </form>

      {/* Reject */}
      <form
        action={rejectAction}
        className="border-sarat-black/8 flex flex-col gap-4 [border-top-width:0.5px] pt-8"
      >
        <input type="hidden" name="experienceId" value={experienceId} />
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
