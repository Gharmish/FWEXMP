'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { Locale } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { replyToReview, type HostReplyState } from '@/features/reviews/actions';

interface Copy {
  label: string;
  placeholder: string;
  submit: string;
  pending: string;
  success: string;
  errors: Record<
    'forbidden' | 'no_db' | 'not_found' | 'already_replied' | 'validation' | 'server',
    string
  >;
}

export interface HostReplyFormProps {
  reviewId: string;
  locale: Locale;
  copy: Copy;
}

const initialState: HostReplyState = { success: false };

function Submit({ copy }: { copy: Copy }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="sm" pending={pending}>
      {pending ? copy.pending : copy.submit}
    </Button>
  );
}

export function HostReplyForm({ reviewId, locale, copy }: HostReplyFormProps) {
  const [state, action] = useActionState(replyToReview, initialState);

  if (state.success) {
    return (
      <p role="status" className="text-juniper-green text-sm font-medium">
        {copy.success}
      </p>
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
        {copy.label}
      </label>
      <textarea
        id={`reply-${reviewId}`}
        name="reply"
        rows={3}
        maxLength={1000}
        required
        placeholder={copy.placeholder}
        className="rounded-input border-sarat-black/20 text-sarat-black w-full [border-width:0.5px] bg-white p-3 text-base"
      />
      {error && (
        <p role="alert" className="text-al-qatt-red-800 text-sm">
          {error}
        </p>
      )}
      <div>
        <Submit copy={copy} />
      </div>
    </form>
  );
}
