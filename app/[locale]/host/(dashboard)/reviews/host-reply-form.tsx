'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { Locale } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
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

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="sm" pending={pending}>
      {pending ? pendingLabel : label}
    </Button>
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
        defaultValue={existingReply}
        placeholder={copy.placeholder}
        className="rounded-input border-sarat-black/20 text-sarat-black w-full [border-width:0.5px] bg-white p-3 text-base"
      />
      {error && (
        <p role="alert" className="text-al-qatt-red-800 text-sm">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Submit label={isEdit ? copy.editSubmit : copy.submit} pendingLabel={copy.pending} />
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
