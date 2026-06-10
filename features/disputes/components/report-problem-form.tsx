'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { Locale } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { createDispute, type CreateDisputeState } from '@/features/disputes/actions';
import { DISPUTE_MESSAGE_MAX } from '@/features/disputes/schemas';

interface Copy {
  summary: string;
  label: string;
  placeholder: string;
  submit: string;
  pending: string;
  success: string;
  errors: Record<'no_db' | 'not_found' | 'already_open' | 'validation' | 'server', string>;
}

export interface ReportProblemFormProps {
  reference: string;
  locale: Locale;
  copy: Copy;
}

const initialState: CreateDisputeState = { success: false };

function Submit({ copy }: { copy: Copy }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="sm" pending={pending}>
      {pending ? copy.pending : copy.submit}
    </Button>
  );
}

export function ReportProblemForm({ reference, locale, copy }: ReportProblemFormProps) {
  const [state, action] = useActionState(createDispute, initialState);

  if (state.success) {
    return (
      <p role="status" className="text-sarat-black max-w-xl text-base leading-relaxed">
        {copy.success}
      </p>
    );
  }

  const error =
    state.message !== undefined
      ? (copy.errors[state.message as keyof Copy['errors']] ?? copy.errors.server)
      : undefined;

  return (
    <details className="group">
      <summary className="text-sarat-black-600 hover:text-sarat-black inline-flex min-h-11 cursor-pointer list-none items-center text-sm font-medium underline-offset-4 hover:underline">
        {copy.summary}
      </summary>
      <form action={action} className="mt-3 flex flex-col gap-2">
        <input type="hidden" name="reference" value={reference} />
        <input type="hidden" name="locale" value={locale} />
        <label htmlFor="dispute-message" className="text-sm font-medium">
          {copy.label}
        </label>
        <textarea
          id="dispute-message"
          name="message"
          rows={4}
          minLength={10}
          maxLength={DISPUTE_MESSAGE_MAX}
          required
          placeholder={copy.placeholder}
          className="rounded-input border-sarat-black/20 bg-fog-white text-sarat-black w-full [border-width:0.5px] p-3 text-base"
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
    </details>
  );
}
