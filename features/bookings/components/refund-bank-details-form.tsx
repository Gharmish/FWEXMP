'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Check } from 'lucide-react';
import type { Locale } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
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
  /** Details already on file — the form opens prefilled for correction. */
  existing: { bankName: string; beneficiaryName: string; iban: string } | null;
  copy: Copy;
}

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
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="reference" value={reference} />
      <input type="hidden" name="locale" value={locale} />
      <RefundBankFields
        copy={copy}
        values={state.values ?? existing ?? undefined}
        fields={state.fields}
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
