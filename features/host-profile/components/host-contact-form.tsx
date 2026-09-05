'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import type { Locale } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import {
  cancelHostContactPhoneChange,
  confirmHostContactPhone,
  resendHostContactPhoneCode,
  updateHostContact,
} from '@/features/host-profile/actions';
import type { HostContactErrorKey, HostContactFormState } from '@/features/host-profile/types';

export interface HostContactFormCopy {
  phoneLabel: string;
  phoneHint: string;
  phonePlaceholder: string;
  countryLabel: string;
  emailLabel: string;
  emailHint: string;
  submit: string;
  submitting: string;
  saved: string;
  phoneError: string;
  emailError: string;
  /** Verify step. `{phone}` is replaced by the new number. */
  verifyTitle: string;
  verifyIntro: string;
  verifyEmailSavedNote: string;
  codeLabel: string;
  codePlaceholder: string;
  verifySubmit: string;
  verifying: string;
  verifyCancel: string;
  resend: string;
  resending: string;
  resent: string;
  verified: string;
  changeCancelled: string;
  codeError: string;
  /** A pending change exists from an earlier visit. */
  pendingNotice: string;
  /** The email saved but the phone step failed. */
  emailSavedPhoneFailed: string;
  errors: Record<HostContactErrorKey, string>;
}

interface HostContactFormProps {
  locale: Locale;
  contact: { contactPhone: string; contactEmail: string };
  /** A new number still waiting for its code (server-side state). */
  pendingPhone: string | null;
  copy: HostContactFormCopy;
}

/**
 * Every action result is stamped with a sequence number by the client
 * wrapper, so the form can tell which of the four actions answered
 * LAST and derive its step from that alone — no effects, no stale
 * results from an earlier round leaking into a new one.
 */
type Stamped = HostContactFormState & { seq: number };
const initialState: Stamped = { status: 'idle', seq: 0 };

function Submit({
  label,
  pendingLabel,
  variant = 'primary',
}: {
  label: string;
  pendingLabel: string;
  variant?: 'primary' | 'secondary';
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size="md" pending={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

/** Renders copy with `{phone}` replaced by an LTR-isolated number. */
function WithPhone({ template, phone }: { template: string; phone: string }) {
  const [before, after = ''] = template.split('{phone}');
  return (
    <>
      {before}
      <span dir="ltr" className="text-sarat-black font-medium">
        {phone}
      </span>
      {after}
    </>
  );
}

type Step =
  | { kind: 'form'; notice?: string; error?: string }
  | { kind: 'verify'; phone: string; notice?: string; error?: string; codeInvalid?: boolean };

/**
 * Where the host's notifications go (2026-08-22). Saving a new phone
 * moves the form to the verify step — the number only takes over once
 * the WhatsApp code checks out. Failure states echo `values` so a server
 * error never wipes the fields.
 */
export function HostContactForm({ locale, contact, pendingPhone, copy }: HostContactFormProps) {
  const seq = useRef(0);
  const stamp = (result: HostContactFormState): Stamped => ({ ...result, seq: ++seq.current });
  const [state, action] = useActionState(
    async (prev: Stamped, fd: FormData) => stamp(await updateHostContact(prev, fd)),
    initialState,
  );
  const [codeState, codeAction] = useActionState(
    async (prev: Stamped, fd: FormData) => stamp(await confirmHostContactPhone(prev, fd)),
    initialState,
  );
  const [resendState, resendAction] = useActionState(
    async (prev: Stamped, fd: FormData) => stamp(await resendHostContactPhoneCode(prev, fd)),
    initialState,
  );
  const [cancelState, cancelAction] = useActionState(
    async () => stamp(await cancelHostContactPhoneChange()),
    initialState,
  );
  const codeRef = useRef<HTMLInputElement>(null);

  // ---- derive the step from the newest result ----
  const results = [
    { kind: 'contact' as const, r: state },
    { kind: 'code' as const, r: codeState },
    { kind: 'resend' as const, r: resendState },
    { kind: 'cancel' as const, r: cancelState },
  ];
  const latest = results.reduce((a, b) => (b.r.seq > a.r.seq ? b : a));
  // The verify phone survives across code/cancel results (which don't
  // always carry it): the newest result that named a phone wins.
  const namedPhone = results
    .filter(({ r }) => r.status === 'verify' || (r.status === 'error' && r.step === 'verify'))
    .sort((a, b) => b.r.seq - a.r.seq)[0]?.r;
  const knownPhone =
    namedPhone && namedPhone.status === 'verify'
      ? namedPhone.phone
      : namedPhone && namedPhone.status === 'error'
        ? (namedPhone.phone ?? pendingPhone)
        : pendingPhone;

  let step: Step;
  const r = latest.r;
  if (r.seq === 0) {
    step = pendingPhone
      ? { kind: 'verify', phone: pendingPhone, notice: copy.pendingNotice }
      : { kind: 'form' };
  } else if (r.status === 'verify') {
    step = {
      kind: 'verify',
      phone: r.phone,
      notice: r.resent ? copy.resent : r.emailSaved ? copy.verifyEmailSavedNote : undefined,
    };
  } else if (r.status === 'success') {
    step = {
      kind: 'form',
      notice:
        r.message === 'phone_verified'
          ? copy.verified
          : r.message === 'cancelled'
            ? copy.changeCancelled
            : copy.saved,
    };
  } else if (r.status === 'error' && (r.step === 'verify' || latest.kind === 'cancel')) {
    const phone = r.phone ?? knownPhone;
    step = phone
      ? {
          kind: 'verify',
          phone,
          error: r.fields?.code ? copy.codeError : copy.errors[r.message],
          codeInvalid: Boolean(r.fields?.code),
        }
      : { kind: 'form', error: copy.errors[r.message] };
  } else if (r.status === 'error' && r.message === 'validation') {
    step = { kind: 'form' };
  } else if (r.status === 'error') {
    step = {
      kind: 'form',
      error: copy.errors[r.message],
      notice: r.emailSaved ? copy.emailSavedPhoneFailed : undefined,
    };
  } else {
    step = { kind: 'form' };
  }

  // Focus the code box when a submit on this page (new number, or a new
  // code) opened the step — never on initial load with an older pending.
  const focusSeq = step.kind === 'verify' && r.status === 'verify' ? r.seq : 0;
  useEffect(() => {
    if (focusSeq > 0) codeRef.current?.focus();
  }, [focusSeq]);

  const values = state.status === 'error' && state.values ? state.values : contact;
  const fieldError = (key: 'contactPhone' | 'contactEmail') =>
    state.status === 'error' && Boolean(state.fields?.[key]);

  if (step.kind === 'verify') {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h3 className="text-base font-medium">{copy.verifyTitle}</h3>
          <p className="text-sarat-black-600 text-sm leading-relaxed">
            <WithPhone template={copy.verifyIntro} phone={step.phone} />
          </p>
          {/* Live region stays mounted; only its text changes. */}
          <p role="status" aria-live="polite" className="text-juniper-green text-sm">
            {step.notice}
          </p>
        </div>
        <form action={codeAction} className="flex flex-col gap-3" noValidate>
          <label htmlFor="host-contact-code" className="text-sm font-medium">
            {copy.codeLabel}
          </label>
          <Input
            ref={codeRef}
            id="host-contact-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            dir="ltr"
            placeholder={copy.codePlaceholder}
            aria-invalid={step.codeInvalid ? true : undefined}
            aria-describedby={step.error ? 'host-contact-code-error' : undefined}
            className="max-w-48 text-center text-lg tracking-[0.3em]"
          />
          <p
            id="host-contact-code-error"
            role="alert"
            aria-live="assertive"
            className="text-al-qatt-red-800 text-sm"
          >
            {step.error}
          </p>
          <div>
            <Submit label={copy.verifySubmit} pendingLabel={copy.verifying} />
          </div>
        </form>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <form action={resendAction}>
            <input type="hidden" name="locale" value={locale} />
            <ResendButton label={copy.resend} pendingLabel={copy.resending} />
          </form>
          <form action={cancelAction}>
            <button
              type="submit"
              className="text-sarat-black-600 hover:text-sarat-black inline-flex min-h-11 items-center text-sm font-medium underline-offset-4 hover:underline"
            >
              {copy.verifyCancel}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="locale" value={locale} />
      <div className="flex flex-col gap-2">
        <label htmlFor="host-contact-phone" className="text-sm font-medium">
          {copy.phoneLabel}
        </label>
        <PhoneInput
          id="host-contact-phone"
          name="contactPhone"
          locale={locale}
          defaultValue={values.contactPhone}
          required
          placeholder={copy.phonePlaceholder}
          countryLabel={copy.countryLabel}
          invalid={fieldError('contactPhone')}
          aria-describedby="host-contact-phone-hint"
        />
        <p id="host-contact-phone-hint" className="text-sarat-black-600 text-sm">
          {copy.phoneHint}
        </p>
        {fieldError('contactPhone') && (
          <p role="alert" className="text-al-qatt-red-800 text-sm">
            {copy.phoneError}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="host-contact-email" className="text-sm font-medium">
          {copy.emailLabel}
        </label>
        <Input
          id="host-contact-email"
          name="contactEmail"
          type="email"
          autoComplete="email"
          dir="ltr"
          required
          defaultValue={values.contactEmail}
          aria-invalid={fieldError('contactEmail') || undefined}
          aria-describedby="host-contact-email-hint"
        />
        <p id="host-contact-email-hint" className="text-sarat-black-600 text-sm">
          {copy.emailHint}
        </p>
        {fieldError('contactEmail') && (
          <p role="alert" className="text-al-qatt-red-800 text-sm">
            {copy.emailError}
          </p>
        )}
      </div>
      {/* Persistent live regions — present from first paint so readers announce changes. */}
      <p role="alert" aria-live="assertive" className="text-al-qatt-red-800 text-sm">
        {step.error}
      </p>
      <p role="status" aria-live="polite" className="text-juniper-green text-sm font-medium">
        {step.notice}
      </p>
      <div>
        <Submit label={copy.submit} pendingLabel={copy.submitting} />
      </div>
    </form>
  );
}

function ResendButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-sarat-black hover:text-sarat-black-600 inline-flex min-h-11 items-center text-sm font-medium underline-offset-4 hover:underline disabled:opacity-60"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
