'use client';

import { useActionState, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { Locale } from '@/lib/i18n';
import { ConfirmSubmit } from '@/components/ui/confirm-dialog';
import { cancelBookingAsGuest, type CancelBookingState } from '@/features/bookings/cancel-actions';
import { refundBankDetailsSchema } from '@/features/bookings/schemas';
import {
  RefundBankFields,
  type RefundBankFieldsCopy,
} from '@/features/bookings/components/refund-bank-fields';

type BankField = 'bankName' | 'beneficiaryName' | 'iban';

interface Copy {
  label: string;
  pending: string;
  /** Confirm-dialog body — varies with the refund consequence. */
  confirm: string;
  /**
   * Success notes keyed by the action's refund outcome; `*_partial`
   * variants render when only the policy's fraction came back.
   */
  done: Record<
    | 'none'
    | 'refunded'
    | 'refunded_partial'
    | 'refund_pending'
    | 'refund_pending_partial'
    | 'forfeited',
    string
  >;
  errors: Record<
    | 'forbidden'
    | 'no_db'
    | 'not_found'
    | 'wrong_state'
    | 'already_started'
    | 'validation'
    | 'bank_details_required'
    | 'server',
    string
  >;
}

export interface CancelBookingButtonProps {
  reference: string;
  locale: Locale;
  copy: Copy;
  /**
   * Present when cancelling now owes the guest a refund: the admin wires
   * every refund by bank transfer, so the payee details are collected
   * in the same form, before the confirm dialog.
   */
  bankFields?: { heading: string; copy: RefundBankFieldsCopy };
}

const initialState: CancelBookingState = { success: false };

function Submit({ copy, validate }: { copy: Copy; validate?: () => boolean }) {
  const className = 'border-al-qatt-red/40 text-al-qatt-red-800';
  return (
    <ConfirmSubmit
      title={copy.label}
      description={copy.confirm}
      confirmLabel={copy.label}
      pendingLabel={copy.pending}
      destructive
      variant="secondary"
      size="md"
      className={className}
      // With bank fields in the form, run the zod pre-check BEFORE the
      // confirm dialog opens — otherwise the guest confirms, the dialog
      // closes, and the action bounces on an empty IBAN.
      trigger={
        validate
          ? (open, pending) => (
              <Button
                type="button"
                variant="secondary"
                size="md"
                pending={pending}
                className={className}
                onClick={() => {
                  if (validate()) open();
                }}
              >
                {pending ? copy.pending : copy.label}
              </Button>
            )
          : undefined
      }
    >
      {copy.label}
    </ConfirmSubmit>
  );
}

export function CancelBookingButton({
  reference,
  locale,
  copy,
  bankFields,
}: CancelBookingButtonProps) {
  const [state, action] = useActionState(cancelBookingAsGuest, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  // Client-side zod pre-check (form is noValidate): `reportValidity()`
  // showed the BROWSER's own bubbles in the browser's language —
  // English over an Arabic UI at the money step. The shared schema
  // surfaces the translated per-field errors instead, before the
  // confirm dialog opens.
  const [clientFields, setClientFields] = useState<Partial<Record<BankField, string>>>({});

  function validateBankFields(): boolean {
    const form = formRef.current;
    if (!form) return true;
    const read = (name: string) =>
      (form.elements.namedItem(name) as HTMLInputElement | null)?.value ?? '';
    const parsed = refundBankDetailsSchema.safeParse({
      bankName: read('bankName'),
      beneficiaryName: read('beneficiaryName'),
      iban: read('iban'),
    });
    if (parsed.success) {
      setClientFields({});
      return true;
    }
    const fields: Partial<Record<BankField, string>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key === 'bankName' || key === 'beneficiaryName' || key === 'iban') {
        fields[key] = String(issue.message);
      }
    }
    setClientFields(fields);
    return false;
  }

  if (state.success) {
    const doneKey =
      state.partial && (state.refund === 'refunded' || state.refund === 'refund_pending')
        ? (`${state.refund}_partial` as const)
        : state.refund;
    return (
      <p role="status" className="text-sarat-black max-w-xl text-base leading-relaxed">
        {copy.done[doneKey]}
      </p>
    );
  }

  // Field-level bank errors render next to their inputs — the generic
  // validation line would only repeat them.
  const hasFieldErrors =
    !state.success && Boolean(state.fields && Object.keys(state.fields).length);
  const error =
    state.message && !(state.message === 'validation' && hasFieldErrors)
      ? (copy.errors[state.message as keyof Copy['errors']] ?? copy.errors.server)
      : undefined;

  return (
    <form ref={formRef} action={action} noValidate className="flex flex-col items-start gap-2">
      <input type="hidden" name="reference" value={reference} />
      <input type="hidden" name="locale" value={locale} />
      {bankFields && (
        <fieldset className="mb-2 flex w-full max-w-2xl flex-col gap-3">
          <legend className="text-sarat-black mb-3 text-base font-medium">
            {bankFields.heading}
          </legend>
          <RefundBankFields
            copy={bankFields.copy}
            values={state.success ? undefined : state.values}
            // The client check re-validates ALL fields, so when it has
            // findings they replace the (stale) server ones wholesale.
            fields={
              state.success
                ? undefined
                : Object.keys(clientFields).length
                  ? clientFields
                  : state.fields
            }
          />
        </fieldset>
      )}
      <Submit copy={copy} validate={bankFields ? validateBankFields : undefined} />
      {error && (
        <p role="alert" className="text-al-qatt-red-800 text-sm">
          {error}
        </p>
      )}
    </form>
  );
}
