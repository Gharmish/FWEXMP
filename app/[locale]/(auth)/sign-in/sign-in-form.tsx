'use client';

import { useActionState, useCallback, useEffect, useId, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { ArrowLeft } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { FieldError as SpringFieldError } from '@/components/ui/field-error';
import { Input } from '@/components/ui/input';
import { SPRING } from '@/components/ui/motion';
import type { Locale } from '@/lib/i18n';
import { PhoneInput } from '@/components/ui/phone-input';
import {
  requestOtp,
  verifyOtp,
  type AuthMethod,
  type RequestOtpState,
  type VerifyOtpState,
} from '@/features/auth/actions';
import { useWebOtp } from '@/features/auth/lib/use-web-otp';

interface SignInCopy {
  methodPhone: string;
  methodEmail: string;
  phoneLabel: string;
  phoneHint: string;
  phonePlaceholder: string;
  /** Accessible label for the dialling-code selector. */
  countryLabel: string;
  emailLabel: string;
  emailHint: string;
  emailPlaceholder: string;
  requestSubmit: string;
  requestPending: string;
  codeLabel: string;
  codeHint: string;
  codeHintEmail: string;
  codeHintStub: string;
  verifySubmit: string;
  verifyPending: string;
  changeIdentifier: string;
  resend: string;
  resent: string;
  errors: {
    validation: string;
    invalidPhone: string;
    invalidEmail: string;
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

const initialRequestState: RequestOtpState = { success: false, stage: 'phone', method: 'phone' };
const initialVerifyState: VerifyOtpState = { success: false, stage: 'code', method: 'phone' };

const RESEND_COOLDOWN_MS = 30_000;

function SubmitButton({ pendingCopy, submitCopy }: { pendingCopy: string; submitCopy: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="lg" className="w-full" pending={pending}>
      {pending ? pendingCopy : submitCopy}
    </Button>
  );
}

/**
 * Spring step wrapper for the two OTP stages. Each stage slides up + fades on
 * mount (keyed by stage so React remounts on transition). Static under
 * prefers-reduced-motion (BRIEF §3).
 */
function StepTransition({ stepKey, children }: { stepKey: string; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  if (reduce) return <>{children}</>;
  return (
    <motion.div
      key={stepKey}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
    >
      {children}
    </motion.div>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  // Shared spring slide-in (components/ui/field-error); the form's gap
  // classes already provide spacing.
  return (
    <SpringFieldError id={id} className="mt-0">
      {message}
    </SpringFieldError>
  );
}

/**
 * Two-step OTP form supporting two channels — phone (SMS) and email.
 * Stage 1 collects the chosen identifier and asks the server action to
 * mint an OTP; on success the server returns `stage: 'code'`, swapping
 * the UI to the code step. Stage 2 verifies the code; success redirects
 * server-side, so observable client state is always failure.
 *
 * Both stages live in one client component so the method + identifier
 * persist across the transition without a navigation; they're also sent
 * as hidden fields so the server re-validates independently.
 */
export function SignInForm({ locale, next, isStubMode, copy }: SignInFormProps) {
  const [requestState, requestAction] = useActionState(requestOtp, initialRequestState);
  const [verifyState, verifyAction] = useActionState(verifyOtp, initialVerifyState);

  const [method, setMethod] = useState<AuthMethod>('phone');
  const [email, setEmail] = useState<string>('');
  const [showPhoneStep, setShowPhoneStep] = useState<boolean>(false);
  // Client-side resend cooldown (the server rate-limits independently).
  const [resendCoolingDown, setResendCoolingDown] = useState(false);

  const requestFields = requestState.success ? undefined : requestState.fields;
  const requestMessage = requestState.success ? undefined : requestState.message;
  // P3-10: computed here (not inline in the branch below) so the focus
  // effects can be unconditional hooks, same as every other effect.
  const formMessage =
    requestMessage === 'rate_limited'
      ? copy.errors.rateLimited
      : requestMessage === 'server'
        ? copy.errors.server
        : undefined;
  const verifyMessage =
    verifyState.message === 'rate_limited'
      ? copy.errors.rateLimited
      : verifyState.message === 'server'
        ? copy.errors.server
        : undefined;
  const canonicalPhone = requestState.phone ?? '';
  const serverEmail = requestState.email ?? '';
  const identifier = method === 'email' ? serverEmail || email : canonicalPhone;

  const stage: 'phone' | 'code' = requestState.success && !showPhoneStep ? 'code' : 'phone';

  // One-tap OTP autofill. iOS fills via `autocomplete="one-time-code"`
  // (suggestion above the keyboard); Android needs the WebOTP API. In
  // both cases the form submits itself the moment a full 6-digit code
  // lands, so tapping the suggestion is the only interaction.
  const codeFormRef = useRef<HTMLFormElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const fillAndSubmitCode = useCallback((code: string) => {
    const input = codeInputRef.current;
    if (!input) return;
    input.value = code;
    codeFormRef.current?.requestSubmit();
  }, []);

  // P3-10: the tabIndex={-1} on these message paragraphs was dead —
  // nothing ever moved focus there, so a screen-reader user landed back
  // on the submit button with no route to the error text.
  const formMessageRef = useRef<HTMLParagraphElement>(null);
  const verifyMessageRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (formMessage) formMessageRef.current?.focus();
  }, [formMessage]);
  useEffect(() => {
    if (verifyMessage) verifyMessageRef.current?.focus();
  }, [verifyMessage]);

  const errorPrefix = useId();
  const phoneErrorId = `${errorPrefix}-phone-error`;
  const phoneHintId = `${errorPrefix}-phone-hint`;
  const emailErrorId = `${errorPrefix}-email-error`;
  const emailHintId = `${errorPrefix}-email-hint`;
  const codeErrorId = `${errorPrefix}-code-error`;
  const codeHintId = `${errorPrefix}-code-hint`;

  useWebOtp(stage === 'code' && method === 'phone', fillAndSubmitCode);

  useEffect(() => {
    if (stage === 'code') {
      document.getElementById('auth-code')?.focus();
    } else if (showPhoneStep) {
      document.getElementById(method === 'email' ? 'auth-email' : 'auth-phone')?.focus();
    }
  }, [stage, showPhoneStep, method]);

  if (stage === 'phone') {
    const tabClass = (active: boolean) =>
      cn(
        'min-h-11 flex-1 rounded-button text-sm font-medium transition-[colors,transform] duration-200 active:translate-y-0',
        active
          ? 'bg-sarat-black text-white'
          : 'border-sarat-black/20 text-sarat-black [border-width:0.5px] hover:border-sarat-black/40',
      );

    return (
      <StepTransition stepKey="phone">
        <form
          action={requestAction}
          onSubmit={() => setShowPhoneStep(false)}
          noValidate
          className="flex flex-col gap-6"
        >
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="method" value={method} />

          {/* Channel toggle */}
          <div
            className="flex gap-2"
            role="group"
            aria-label={`${copy.methodPhone} / ${copy.methodEmail}`}
          >
            <button
              type="button"
              onClick={() => setMethod('phone')}
              className={tabClass(method === 'phone')}
            >
              {copy.methodPhone}
            </button>
            <button
              type="button"
              onClick={() => setMethod('email')}
              className={tabClass(method === 'email')}
            >
              {copy.methodEmail}
            </button>
          </div>

          {method === 'phone' ? (
            <div className="flex flex-col gap-2">
              <label htmlFor="auth-phone" className="text-sm font-medium">
                {copy.phoneLabel}
              </label>
              <PhoneInput
                id="auth-phone"
                name="phone"
                locale={locale}
                defaultValue={canonicalPhone || undefined}
                required
                placeholder={copy.phonePlaceholder}
                countryLabel={copy.countryLabel}
                invalid={Boolean(requestFields?.phone)}
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
          ) : (
            <div className="flex flex-col gap-2">
              <label htmlFor="auth-email" className="text-sm font-medium">
                {copy.emailLabel}
              </label>
              <Input
                id="auth-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={copy.emailPlaceholder}
                aria-invalid={requestFields?.email ? 'true' : undefined}
                aria-describedby={
                  `${emailHintId} ${requestFields?.email ? emailErrorId : ''}`.trim() || undefined
                }
              />
              <p id={emailHintId} className="text-sarat-black-600 text-sm">
                {copy.emailHint}
              </p>
              <FieldError
                id={emailErrorId}
                message={requestFields?.email ? copy.errors.invalidEmail : undefined}
              />
            </div>
          )}

          {formMessage && (
            <p
              ref={formMessageRef}
              role="alert"
              tabIndex={-1}
              className="text-al-qatt-red-800 text-sm focus:outline-none"
            >
              {formMessage}
            </p>
          )}

          <SubmitButton pendingCopy={copy.requestPending} submitCopy={copy.requestSubmit} />
        </form>
      </StepTransition>
    );
  }

  // ---------- stage 2: code ----------
  // Every terminal verify failure must surface SOMETHING: invalid_code
  // renders inline via fields.code, so the form-level slot covers the
  // rest — a rate-limited verify previously rendered nothing at all.
  return (
    <StepTransition stepKey="code">
      <form ref={codeFormRef} action={verifyAction} noValidate className="flex flex-col gap-6">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="method" value={method} />
        {method === 'email' ? (
          <input type="hidden" name="email" value={identifier} />
        ) : (
          <input type="hidden" name="phone" value={identifier} />
        )}

        <div className="flex flex-col gap-2">
          <p className="text-sarat-black-600 text-sm" dir="ltr" aria-live="polite">
            {identifier}
          </p>
          <button
            type="button"
            onClick={() => setShowPhoneStep(true)}
            className="text-sarat-black inline-flex min-h-11 items-center gap-1 self-start text-sm font-medium transition-opacity duration-200 hover:opacity-60"
          >
            <ArrowLeft className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
            {copy.changeIdentifier}
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="auth-code" className="text-sm font-medium">
            {copy.codeLabel}
          </label>
          <Input
            ref={codeInputRef}
            id="auth-code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            dir="ltr"
            onChange={(e) => {
              // Auto-submit on a complete code — this is what makes a
              // tapped keyboard suggestion (iOS) or paste one-step.
              if (/^\d{6}$/.test(e.target.value)) codeFormRef.current?.requestSubmit();
            }}
            aria-invalid={verifyState.fields?.code ? 'true' : undefined}
            aria-describedby={
              `${codeHintId} ${verifyState.fields?.code ? codeErrorId : ''}`.trim() || undefined
            }
          />
          <p id={codeHintId} className="text-sarat-black-600 text-sm">
            {isStubMode
              ? copy.codeHintStub
              : method === 'email'
                ? copy.codeHintEmail
                : copy.codeHint}
          </p>
          <FieldError
            id={codeErrorId}
            message={verifyState.fields?.code ? copy.errors.invalidCode : undefined}
          />
          {/* Recovery path when the code never arrives. `formAction` reuses
              the request action through this form's hidden identifier
              fields; `formNoValidate` skips the required-but-empty code
              input. A resend that fails server-side flips requestState back
              to failure, returning the user to stage 1 where that error
              already renders. */}
          <button
            type="submit"
            formAction={requestAction}
            formNoValidate
            disabled={resendCoolingDown}
            onClick={() => {
              setResendCoolingDown(true);
              setTimeout(() => setResendCoolingDown(false), RESEND_COOLDOWN_MS);
            }}
            className="text-sarat-black inline-flex min-h-11 items-center self-start text-sm font-medium underline underline-offset-2 transition-opacity duration-200 hover:opacity-60 disabled:no-underline disabled:opacity-50"
          >
            {copy.resend}
          </button>
          <p aria-live="polite" className="text-sarat-black-600 text-sm">
            {resendCoolingDown ? copy.resent : null}
          </p>
        </div>

        {verifyMessage && (
          <p
            ref={verifyMessageRef}
            role="alert"
            tabIndex={-1}
            className="text-al-qatt-red-800 text-sm focus:outline-none"
          >
            {verifyMessage}
          </p>
        )}

        <SubmitButton pendingCopy={copy.verifyPending} submitCopy={copy.verifySubmit} />
      </form>
    </StepTransition>
  );
}
