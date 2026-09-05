'use client';

import { useActionState, useId, useState, type FormEvent } from 'react';
import { useFormStatus } from 'react-dom';
import { Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { formatInteger } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { submitReview, updateReview, type SubmitReviewState } from '@/features/reviews/actions';
import { reviewDisplayName } from '@/features/reviews/lib/display-name';
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
  /**
   * Guest's booking name. When present the form discloses the public
   * byline ("Posted publicly as Sara A.") — same derivation the review
   * surfaces render, so the guest sees exactly what will be published.
   */
  guestName?: string;
}

const initialState: SubmitReviewState = { success: false };

function Submit({ copy }: { copy: ReviewFormCopy }) {
  const { pending } = useFormStatus();
  return (
    // L19: the Button `pending` prop (not disabled={pending}) — it keeps
    // aria-busy and lets Button manage the disabled state consistently.
    <Button type="submit" variant="primary" size="md" pending={pending} className="self-start">
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
  guestName,
}: ReviewFormProps) {
  const t = useTranslations('reviews');
  const [state, action] = useActionState(
    mode === 'edit' ? updateReview : submitReview,
    initialState,
  );
  const [rating, setRating] = useState(initialRating);
  const [hovered, setHovered] = useState(0);
  // M16: caught before the round-trip, not just after a server rejection.
  const [ratingTouched, setRatingTouched] = useState(false);
  const [textLength, setTextLength] = useState(initialText.length);
  const groupId = useId();
  const ratingErrorId = `${groupId}-rating-error`;
  const charCountId = `${groupId}-char-count`;

  const shown = hovered || rating;
  const generalError =
    state.message && state.message !== 'validation'
      ? (copy.errors[state.message] ?? copy.errors.server)
      : undefined;
  const ratingError = ratingTouched || state.fields?.rating ? copy.ratingRequired : undefined;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (rating === 0) {
      event.preventDefault();
      setRatingTouched(true);
    }
  }

  return (
    <form action={action} onSubmit={handleSubmit} className="flex flex-col gap-6">
      <input type="hidden" name="bookingReference" value={bookingReference} />
      <input type="hidden" name="locale" value={locale} />

      <h3 className="font-display text-xl font-medium tracking-[-0.02em]">{copy.heading}</h3>
      {guestName && (
        <p className="text-sarat-black-600 -mt-3 text-sm">
          {t('publicNameNotice', { name: reviewDisplayName(guestName) })}
        </p>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sarat-black-600 mb-1 text-sm">{copy.ratingLabel}</legend>
        <div
          className="flex gap-1"
          role="radiogroup"
          aria-label={copy.ratingLabel}
          // M16: wires the group to its own error message for AT users.
          aria-describedby={ratingError ? ratingErrorId : undefined}
          onMouseLeave={() => setHovered(0)}
        >
          {[1, 2, 3, 4, 5].map((value) => (
            // size-11 = the 44px touch-target floor; the sr-only radio's
            // focus surfaces on the visible label via `has-[:focus-visible]`
            // (mirrors the global ring treatment — sr-only inputs never
            // show the :focus-visible box-shadow themselves).
            <label
              key={value}
              className="has-[:focus-visible]:ring-sarat-black/55 flex size-11 cursor-pointer items-center justify-center rounded-full has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-offset-2"
              onMouseEnter={() => setHovered(value)}
            >
              <input
                type="radio"
                name="rating"
                value={value}
                checked={rating === value}
                onChange={() => {
                  setRating(value);
                  setRatingTouched(false);
                }}
                className="sr-only"
                aria-label={copy.ratingValueLabels[value - 1]}
              />
              <Star
                className={cn(
                  'size-7 fill-current transition-colors duration-150',
                  // M20: -800 holds contrast on white; unselected stars
                  // stay the same muted tone.
                  value <= shown ? 'text-saffron-gold-800' : 'text-sarat-black/20',
                )}
                aria-hidden
              />
            </label>
          ))}
        </div>
        {ratingError && (
          <p id={ratingErrorId} role="alert" className="text-al-qatt-red-800 text-xs">
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
          onChange={(e) => setTextLength(e.target.value.length)}
          placeholder={copy.commentPlaceholder}
          aria-describedby={charCountId}
          className="rounded-input border-sarat-black/12 placeholder:text-sarat-black-600 focus:border-sarat-black/30 w-full resize-y [border-width:0.5px] bg-transparent p-3 text-base"
        />
        {/* M16: character counter, quiet until the guest is close to the
            limit. */}
        <p
          id={charCountId}
          className={cn(
            'text-end text-xs',
            textLength >= REVIEW_TEXT_MAX
              ? 'text-al-qatt-red-800'
              : textLength >= REVIEW_TEXT_MAX * 0.9
                ? 'text-sarat-black-600'
                : 'text-sarat-black/40',
          )}
        >
          {t('charCount', {
            count: formatInteger(textLength, locale),
            max: formatInteger(REVIEW_TEXT_MAX, locale),
          })}
        </p>
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
