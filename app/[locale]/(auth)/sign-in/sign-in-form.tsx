'use client';

import { useActionState, useEffect, useId, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Locale } from '@/lib/i18n';
import { formatSaudiPhone } from '@/lib/format';
import {
  requestOtp,
  verifyOtp,
  type RequestOtpState,
  type VerifyOtpState,
} from '@/features/auth/actions';

interface SignInCopy {
  phoneLabel: string;
  phoneHint: string;
  phonePlaceholder: string;
  requestSubmit: string;
  requestPending: string;
  codeLabel: string;
  codeHint: string;
  codeHintStub: string;
  verifySubmit: string;
  verifyPending: string;
  changePhone: string;
  errors: {
    validation: string;
    invalidPhone: string;
    invalidCode: string;
    rateLimited: string;
    server: string;
  };
}

export interface SignInFormProps {
  locale: Locale;
  next: string;
  isStubMode: boolean;
  copy: SignInCopy;
}

const initialRequestState: RequestOtpState = { success: false, stage: 'phone' };
const initialVerifyState: VerifyOtpState = { success: false, stage: 'code' };

function SubmitButton({ pendingCopy, submitCopy }: { pendingCopy: string; submitCopy: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
      {pending ? pendingCopy : submitCopy}
    </Button>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-al-qatt-red-800 text-sm">
      {message}
    </p>
  );
}

/**
 * Two-step OTP form. Stage 1 collects the phone number and asks the
 * server action to mint an OTP. On success the server returns
 * `stage: 'code'`, which swaps the UI to the code step. Stage 2 sends
 * the code for verification; the success path redirects server-side so
 * we never see it here — observable client state is always failure.
 *
 * Both stages live in a single client component so we can keep the
 * canonical phone in React state across the transition without a
 * navigation. The phone is also passed as a hidden field on the second
 * form so the server can re-validate independently.
 *
 * `showPhoneStep` overrides the auto-derived stage when the user clicks
 * "Use a different number" — useActionState retains its success state,
 * so we'd otherwise need to clear it via navigation.
 */
export function SignInForm({ locale, next, isStubMode, copy }: SignInFormProps) {
  const [requestState, requestAction] = useActionState(requestOtp, initialRequestState);
  const [verifyState, verifyAction] = useActionState(verifyOtp, initialVerifyState);

  // Controlled phone field — same canonicalise-on-blur trick the
  // booking form uses (features/bookings/components/booking-request-form.tsx).
  const [phone, setPhone] = useState<string>('');
  const [showPhoneStep, setShowPhoneStep] = useState<boolean>(false);

  // Server-side narrow access — useActionState's RequestOtpState is a
  // discriminated union, so we pluck `fields` only on the failure arm.
  const requestFields = requestState.success ? undefined : requestState.fields;
  const requestMessage = requestState.success ? undefined : requestState.message;
  // Once stage 1 returns success, persist the canonical phone for stage 2.
  // On the failure arm we may also have the input echoed back.
  const canonicalPhone = requestState.success ? requestState.phone : (requestState.phone ?? '');

  const stage: 'phone' | 'code' = requestState.success && !showPhoneStep ? 'code' : 'phone';

  const errorPrefix = useId();
  const phoneErrorId = `${errorPrefix}-phone-error`;
  const phoneHintId = `${errorPrefix}-phone-hint`;
  const codeErrorId = `${errorPrefix}-code-error`;
  const codeHintId = `${errorPrefix}-code-hint`;

  // When we swap to the code step, move focus to the code input so
  // typing the SMS code "just works" without a tab.
  useEffect(() => {
    if (stage === 'code') {
      document.getElementById('auth-code')?.focus();
    } else if (showPhoneStep) {
      document.getElementById('auth-phone')?.focus();
    }
  }, [stage, showPhoneStep]);

  // Clearing the manual phone-step override happens at form-submit
  // time (`onSubmit` on the phone form) rather than in an effect — the
  // next render then derives `stage` purely from `requestState`. This
  // avoids the setState-in-effect anti-pattern (eslint:react-hooks).

  if (stage === 'phone') {
    const formMessage =
      requestMessage === 'rate_limited'
        ? copy.errors.rateLimited
        : requestMessage === 'server'
          ? copy.errors.server
          : undefined;

    return (
      <form
        action={requestAction}
        onSubmit={() => setShowPhoneStep(false)}
        noValidate
        className="flex flex-col gap-5"
      >
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="next" value={next} />

        <div className="flex flex-col gap-2">
          <label htmlFor="auth-phone" className="text-sm font-medium">
            {copy.phoneLabel}
          </label>
          <Input
            id="auth-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            required
            dir="ltr"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onBlur={() => {
              const formatted = formatSaudiPhone(phone);
              if (formatted !== phone) setPhone(formatted);
            }}
            placeholder={copy.phonePlaceholder}
            aria-invalid={requestFields?.phone ? 'true' : undefined}
            aria-describedby={
              `${phoneHintId} ${requestFields?.phone ? phoneErrorId : ''}`.trim() || undefined
            }
          />
          <p id={phoneHintId} className="text-sarat-black-600 text-sm">
            {copy.phoneHint}
          </p>
          <FieldError
            id={phoneErrorId}
            message={requestFields?.phone ? copy.errors.invalidPhone : undefined}
          />
        </div>

        {formMessage && (
          <p role="alert" tabIndex={-1} className="text-al-qatt-red-800 text-sm focus:outline-none">
            {formMessage}
          </p>
        )}

        <SubmitButton pendingCopy={copy.requestPending} submitCopy={copy.requestSubmit} />
      </form>
    );
  }

  // ---------- stage 2: code ----------
  const verifyMessage = verifyState.message === 'server' ? copy.errors.server : undefined;

  return (
    <form action={verifyAction} noValidate className="flex flex-col gap-5">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="phone" value={canonicalPhone} />

      <div className="flex flex-col gap-2">
        <p className="text-sarat-black-600 text-sm" dir="ltr" aria-live="polite">
          {canonicalPhone}
        </p>
        <button
          type="button"
          onClick={() => setShowPhoneStep(true)}
          className="text-sarat-black inline-flex min-h-11 items-center gap-1 self-start text-sm font-medium transition-opacity duration-200 hover:opacity-60"
        >
          <ArrowLeft className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
          {copy.changePhone}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="auth-code" className="text-sm font-medium">
          {copy.codeLabel}
        </label>
        <Input
          id="auth-code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          dir="ltr"
          aria-invalid={verifyState.fields?.code ? 'true' : undefined}
          aria-describedby={
            `${codeHintId} ${verifyState.fields?.code ? codeErrorId : ''}`.trim() || undefined
          }
        />
        <p id={codeHintId} className="text-sarat-black-600 text-sm">
          {isStubMode ? copy.codeHintStub : copy.codeHint}
        </p>
        <FieldError
          id={codeErrorId}
          message={verifyState.fields?.code ? copy.errors.invalidCode : undefined}
        />
      </div>

      {verifyMessage && (
        <p role="alert" tabIndex={-1} className="text-al-qatt-red-800 text-sm focus:outline-none">
          {verifyMessage}
        </p>
      )}

      <SubmitButton pendingCopy={copy.verifyPending} submitCopy={copy.verifySubmit} />
    </form>
  );
}
