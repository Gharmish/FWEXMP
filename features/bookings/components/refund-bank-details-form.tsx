'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Check } from 'lucide-react';
import type { Locale } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { refundBankDetailsSchema } from '@/features/bookings/schemas';
import {
  RefundBankFields,
  type RefundBankFieldsCopy,
} from '@/features/bookings/components/refund-bank-fields';
import {
  submitRefundBankDetails,
  type RefundBankDetailsState,
} from '@/features/bookings/refund-bank-actions';

interface Copy extends RefundBankFieldsCopy {
  submit: string;
  update: string;
  pending: string;
  done: string;
  formErrors: Record<'not_found' | 'wrong_state' | 'no_db' | 'validation' | 'server', string>;
}

export interface RefundBankDetailsFormProps {
  reference: string;
  locale: Locale;
  /**
   * Details already on file — names prefill for correction; the IBAN is
   * only ever a MASKED display value (shown as placeholder), so a
   * change requires retyping it in full. The server keeps the real one.
   */
  existing: { bankName: string; beneficiaryName: string; ibanMasked: string } | null;
  copy: Copy;
}

type BankField = 'bankName' | 'beneficiaryName' | 'iban';

const initialState: RefundBankDetailsState = { success: false };

function Submit({ label, pending: pendingLabel }: { label: string; pending: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="md" pending={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

/**
 * Standalone payee form on a cancelled booking page whose refund is
 * queued for a manual bank transfer. Shown whenever the money is still
 * owed — first submission or a correction.
 */
export function RefundBankDetailsForm({
  reference,
  locale,
  existing,
  copy,
}: RefundBankDetailsFormProps) {
  const [state, action] = useActionState(submitRefundBankDetails, initialState);
  // Client-side zod pre-check (form is noValidate): the browser's own
  // bubbles render in the BROWSER's language — English over an Arabic
  // UI at the money step. Same shared-schema pattern as the booking
  // form's validateBeforeSubmit.
  const [clientFields, setClientFields] = useState<Partial<Record<BankField, string>>>({});

  function validateBeforeSubmit(event: React.FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    const read = (name: string) =>
      (form.elements.namedItem(name) as HTMLInputElement | null)?.value ?? '';
    const parsed = refundBankDetailsSchema.safeParse({
      bankName: read('bankName'),
      beneficiaryName: read('beneficiaryName'),
      iban: read('iban'),
    });
    if (parsed.success) {
      setClientFields({});
      return;
    }
    event.preventDefault();
    const fields: Partial<Record<BankField, string>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key === 'bankName' || key === 'beneficiaryName' || key === 'iban') {
        fields[key] = String(issue.message);
      }
    }
    setClientFields(fields);
  }

  if (state.success) {
    return (
      <p
        role="status"
        className="text-juniper-green-800 inline-flex items-center gap-2 text-base font-medium"
      >
        <Check className="size-4 shrink-0" aria-hidden />
        {copy.done}
      </p>
    );
  }

  const formError =
    state.message && state.message !== 'validation'
      ? (copy.formErrors[state.message as keyof Copy['formErrors']] ?? copy.formErrors.server)
      : undefined;

  return (
    <form
      action={action}
      onSubmit={validateBeforeSubmit}
      noValidate
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="reference" value={reference} />
      <input type="hidden" name="locale" value={locale} />
      <RefundBankFields
        copy={copy}
        values={
          state.values ??
          (existing
            ? { bankName: existing.bankName, beneficiaryName: existing.beneficiaryName }
            : undefined)
        }
        // The client check re-validates ALL fields, so when it has
        // findings they replace the (stale) server ones wholesale.
        fields={Object.keys(clientFields).length ? clientFields : state.fields}
        ibanOnFileMasked={existing?.ibanMasked}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Submit label={existing ? copy.update : copy.submit} pending={copy.pending} />
        {formError && (
          <p role="alert" className="text-al-qatt-red-800 text-sm">
            {formError}
          </p>
        )}
      </div>
    </form>
  );
}
