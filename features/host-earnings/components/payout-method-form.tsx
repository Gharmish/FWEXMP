'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Check } from 'lucide-react';
import type { Locale } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { updatePayoutIban, type UpdatePayoutIbanState } from '@/features/host-earnings/actions';

export interface PayoutMethodFormCopy {
  label: string;
  hint: string;
  placeholder: string;
  currentLabel: string;
  save: string;
  saving: string;
  success: string;
  errors: { forbidden: string; no_db: string; validation: string; server: string };
}

export interface PayoutMethodFormProps {
  locale: Locale;
  /** Masked current IBAN for display (server-side masked), or null. */
  maskedIban: string | null;
  copy: PayoutMethodFormCopy;
}

const initialState: UpdatePayoutIbanState = { success: false };

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="md" pending={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function PayoutMethodForm({ locale, maskedIban, copy }: PayoutMethodFormProps) {
  const [state, formAction] = useActionState(updatePayoutIban, initialState);
  const error = !state.success && state.message ? copy.errors[state.message] : undefined;

  return (
    <form action={formAction} noValidate className="flex max-w-xl flex-col gap-3">
      <input type="hidden" name="locale" value={locale} />
      {maskedIban && (
        <p className="text-sarat-black-600 text-sm">
          {copy.currentLabel}{' '}
          <span className="font-mono" dir="ltr">
            {maskedIban}
          </span>
        </p>
      )}
      <label htmlFor="payout-iban" className="text-sm font-medium">
        {copy.label}
      </label>
      <Input
        id="payout-iban"
        name="iban"
        type="text"
        autoComplete="off"
        spellCheck={false}
        dir="ltr"
        placeholder={copy.placeholder}
        aria-invalid={!state.success && state.message === 'validation' ? 'true' : undefined}
      />
      <p className="text-sarat-black-600 text-sm">{copy.hint}</p>
      {error && (
        <p role="alert" className="text-al-qatt-red-800 text-sm">
          {error}
        </p>
      )}
      {state.success && (
        <p
          role="status"
          className="text-juniper-green inline-flex items-center gap-2 text-sm font-medium"
        >
          <Check className="size-4 shrink-0" aria-hidden />
          {copy.success}
        </p>
      )}
      <div>
        <SubmitButton label={copy.save} pendingLabel={copy.saving} />
      </div>
    </form>
  );
}
