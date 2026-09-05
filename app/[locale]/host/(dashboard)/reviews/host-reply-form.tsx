'use client';

import { useActionState, useState } from 'react';
import type { Locale } from '@/lib/i18n';
import { ConfirmSubmit } from '@/components/ui/confirm-dialog';
import {
  replyToReview,
  updateHostReply,
  type HostReplyEditState,
  type HostReplyState,
} from '@/features/reviews/actions';

interface Copy {
  label: string;
  placeholder: string;
  submit: string;
  pending: string;
  success: string;
  /** Edit-mode strings (only used when `existingReply` is set). */
  edit: string;
  editLabel: string;
  editSubmit: string;
  editSuccess: string;
  cancelEdit: string;
  /** M14: confirmation-dialog body — a reply publishes publicly and can't be withdrawn. */
  confirm: string;
  errors: Record<
    'forbidden' | 'no_db' | 'not_found' | 'already_replied' | 'expired' | 'validation' | 'server',
    string
  >;
}

export interface HostReplyFormProps {
  reviewId: string;
  locale: Locale;
  copy: Copy;
  /** When set, the form edits this reply instead of posting a new one. */
  existingReply?: string;
}

type ReplyState = HostReplyState | HostReplyEditState;
const initialState: ReplyState = { success: false };

/** One action signature for both modes, so `useActionState` is called unconditionally. */
async function runReply(
  isEdit: boolean,
  previous: ReplyState,
  formData: FormData,
): Promise<ReplyState> {
  return isEdit
    ? updateHostReply(previous as HostReplyEditState, formData)
    : replyToReview(previous as HostReplyState, formData);
}

function Submit({
  label,
  pendingLabel,
  confirmTitle,
  confirmDescription,
}: {
  label: string;
  pendingLabel: string;
  confirmTitle: string;
  confirmDescription: string;
}) {
  // M14: a posted or edited reply publishes publicly under the host's
  // name and (for a fresh reply) can't be withdrawn — gate it the same
  // way every other irreversible host/admin action is gated.
  return (
    <ConfirmSubmit
      title={confirmTitle}
      description={confirmDescription}
      confirmLabel={label}
      pendingLabel={pendingLabel}
      variant="secondary"
      size="sm"
    >
      {label}
    </ConfirmSubmit>
  );
}

/**
 * Post a reply, or — inside the 24h window — edit the one already posted
 * (2026-08-22 audit P2-8). Edit mode starts collapsed behind an "Edit"
 * link so the published reply stays the primary reading.
 */
export function HostReplyForm({ reviewId, locale, copy, existingReply }: HostReplyFormProps) {
  const isEdit = existingReply !== undefined;
  const [state, action] = useActionState(
    (previous: ReplyState, formData: FormData) => runReply(isEdit, previous, formData),
    initialState,
  );
  const [editing, setEditing] = useState(false);

  if (state.success) {
    return (
      <p role="status" className="text-juniper-green text-sm font-medium">
        {isEdit ? copy.editSuccess : copy.success}
      </p>
    );
  }

  if (isEdit && !editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-sarat-black-600 hover:text-sarat-black inline-flex min-h-11 items-center self-start text-sm font-medium underline-offset-4 hover:underline"
      >
        {copy.edit}
      </button>
    );
  }

  const error = state.message
    ? (copy.errors[state.message as keyof Copy['errors']] ?? copy.errors.server)
    : undefined;

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="reviewId" value={reviewId} />
      <input type="hidden" name="locale" value={locale} />
      <label htmlFor={`reply-${reviewId}`} className="text-sm font-medium">
        {isEdit ? copy.editLabel : copy.label}
      </label>
      <textarea
        id={`reply-${reviewId}`}
        name="reply"
        rows={3}
        maxLength={1000}
        required
        // P2-23: a failed submit re-renders with the typed text, not the
        // pre-edit reply (or empty, for a fresh reply).
        defaultValue={state.values?.reply ?? existingReply}
        placeholder={copy.placeholder}
        className="rounded-input border-sarat-black/20 text-sarat-black w-full [border-width:0.5px] bg-white p-3 text-base"
      />
      {error && (
        <p role="alert" className="text-al-qatt-red-800 text-sm">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Submit
          label={isEdit ? copy.editSubmit : copy.submit}
          pendingLabel={copy.pending}
          confirmTitle={isEdit ? copy.editLabel : copy.label}
          confirmDescription={copy.confirm}
        />
        {isEdit && (
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-sarat-black-600 inline-flex min-h-11 items-center text-sm font-medium underline-offset-4 hover:underline"
          >
            {copy.cancelEdit}
          </button>
        )}
      </div>
    </form>
  );
}
