'use client';

import { useActionState, useId, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Star } from 'lucide-react';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { submitReview, updateReview, type SubmitReviewState } from '@/features/reviews/actions';
import { REVIEW_TEXT_MAX } from '@/features/reviews/schemas';

type ErrorKey = NonNullable<SubmitReviewState['message']>;

export interface ReviewFormCopy {
  heading: string;
  ratingLabel: string;
  /** Five accessible labels, index 0 → "1 star" … index 4 → "5 stars". */
  ratingValueLabels: [string, string, string, string, string];
  ratingRequired: string;
  commentLabel: string;
  commentOptional: string;
  commentPlaceholder: string;
  submit: string;
  submitting: string;
  errors: Record<ErrorKey, string>;
}

export interface ReviewFormProps {
  bookingReference: string;
  locale: Locale;
  copy: ReviewFormCopy;
  /** `edit` re-submits to updateReview, prefilled with the current review. */
  mode?: 'create' | 'edit';
  initialRating?: number;
  initialText?: string;
}

const initialState: SubmitReviewState = { success: false };

function Submit({ copy }: { copy: ReviewFormCopy }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="md" disabled={pending} className="self-start">
      {pending ? copy.submitting : copy.submit}
    </Button>
  );
}

export function ReviewForm({
  bookingReference,
  locale,
  copy,
  mode = 'create',
  initialRating = 0,
  initialText = '',
}: ReviewFormProps) {
  const [state, action] = useActionState(
    mode === 'edit' ? updateReview : submitReview,
    initialState,
  );
  const [rating, setRating] = useState(initialRating);
  const [hovered, setHovered] = useState(0);
  const groupId = useId();

  const shown = hovered || rating;
  const generalError =
    state.message && state.message !== 'validation'
      ? (copy.errors[state.message] ?? copy.errors.server)
      : undefined;
  const ratingError = state.fields?.rating ? copy.ratingRequired : undefined;

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="bookingReference" value={bookingReference} />
      <input type="hidden" name="locale" value={locale} />

      <h3 className="font-display text-xl font-medium tracking-[-0.02em]">{copy.heading}</h3>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sarat-black-600 mb-1 text-sm">{copy.ratingLabel}</legend>
        <div
          className="flex gap-1"
          role="radiogroup"
          aria-label={copy.ratingLabel}
          onMouseLeave={() => setHovered(0)}
        >
          {[1, 2, 3, 4, 5].map((value) => (
            <label
              key={value}
              className="cursor-pointer p-1"
              onMouseEnter={() => setHovered(value)}
            >
              <input
                type="radio"
                name="rating"
                value={value}
                checked={rating === value}
                onChange={() => setRating(value)}
                className="sr-only"
                aria-label={copy.ratingValueLabels[value - 1]}
              />
              <Star
                className={cn(
                  'size-7 fill-current transition-colors duration-150',
                  value <= shown ? 'text-saffron-gold' : 'text-sarat-black/20',
                )}
                aria-hidden
              />
            </label>
          ))}
        </div>
        {ratingError && (
          <p role="alert" className="text-al-qatt-red-800 text-xs">
            {ratingError}
          </p>
        )}
      </fieldset>

      <div className="flex flex-col gap-2">
        <label htmlFor={`${groupId}-text`} className="text-sarat-black-600 text-sm">
          {copy.commentLabel} <span className="text-sarat-black/40">{copy.commentOptional}</span>
        </label>
        <textarea
          id={`${groupId}-text`}
          name="text"
          rows={4}
          maxLength={REVIEW_TEXT_MAX}
          defaultValue={state.values?.text ?? initialText}
          placeholder={copy.commentPlaceholder}
          className="rounded-input border-sarat-black/12 placeholder:text-sarat-black-600 focus:border-sarat-black/30 w-full resize-y [border-width:0.5px] bg-transparent p-3 text-base focus:outline-none"
        />
      </div>

      <Submit copy={copy} />

      {generalError && (
        <p role="alert" className="text-al-qatt-red-800 text-sm">
          {generalError}
        </p>
      )}
    </form>
  );
}
