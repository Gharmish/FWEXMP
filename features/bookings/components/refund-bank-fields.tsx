'use client';

import { useId } from 'react';
import { FieldError } from '@/components/ui/field-error';
import { Input } from '@/components/ui/input';

export interface RefundBankFieldsCopy {
  bankNameLabel: string;
  beneficiaryNameLabel: string;
  beneficiaryNameHint: string;
  ibanLabel: string;
  ibanHint: string;
  /** Hint shown instead of `ibanHint` when a masked IBAN is on file. */
  ibanReenterHint?: string;
  /** Per-field validation messages keyed by the zod message keys. */
  errors: Record<'bank_name_invalid' | 'beneficiary_name_invalid' | 'iban_invalid', string>;
}

type BankField = 'bankName' | 'beneficiaryName' | 'iban';

export interface RefundBankFieldsProps {
  copy: RefundBankFieldsCopy;
  /** Initial values (a previous submission, or an echoed failed one). */
  values?: Partial<Record<BankField, string>>;
  /** Server-side field errors keyed by field name. */
  fields?: Partial<Record<BankField, string>>;
  /**
   * Masked IBAN already on file (`SA44 •••• … ••34`). Shown as the
   * empty input's placeholder — the full value never reaches the
   * client, so changing anything requires retyping the IBAN in full.
   */
  ibanOnFileMasked?: string;
}

/**
 * The three payee inputs for a manual bank-transfer refund: bank name,
 * beneficiary (account holder) name, Saudi IBAN. Shared by the cancel
 * form (collected up front when a refund is owed) and the standalone
 * form on a cancelled booking page. Plain inputs — the enclosing form
 * owns the action and the submit button.
 */
export function RefundBankFields({
  copy,
  values,
  fields,
  ibanOnFileMasked,
}: RefundBankFieldsProps) {
  const prefix = useId();
  const id = (field: BankField) => `${prefix}-${field}`;
  const errorFor = (field: BankField): string | undefined => {
    const key = fields?.[field];
    return key ? (copy.errors[key as keyof RefundBankFieldsCopy['errors']] ?? key) : undefined;
  };
  const describedBy = (field: BankField, hint: boolean) =>
    [hint ? `${id(field)}-hint` : null, errorFor(field) ? `${id(field)}-error` : null]
      .filter((v): v is string => v !== null)
      .join(' ') || undefined;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label htmlFor={id('bankName')} className="flex flex-col gap-1.5 text-sm font-medium">
        {copy.bankNameLabel}
        <Input
          id={id('bankName')}
          name="bankName"
          autoComplete="organization"
          required
          maxLength={80}
          defaultValue={values?.bankName ?? ''}
          aria-invalid={errorFor('bankName') ? 'true' : undefined}
          aria-describedby={describedBy('bankName', false)}
        />
        <FieldError id={`${id('bankName')}-error`}>{errorFor('bankName')}</FieldError>
      </label>
      <label htmlFor={id('beneficiaryName')} className="flex flex-col gap-1.5 text-sm font-medium">
        {copy.beneficiaryNameLabel}
        <Input
          id={id('beneficiaryName')}
          name="beneficiaryName"
          autoComplete="name"
          required
          maxLength={80}
          defaultValue={values?.beneficiaryName ?? ''}
          aria-invalid={errorFor('beneficiaryName') ? 'true' : undefined}
          aria-describedby={describedBy('beneficiaryName', true)}
        />
        <span id={`${id('beneficiaryName')}-hint`} className="text-sarat-black-600 font-normal">
          {copy.beneficiaryNameHint}
        </span>
        <FieldError id={`${id('beneficiaryName')}-error`}>{errorFor('beneficiaryName')}</FieldError>
      </label>
      <label
        htmlFor={id('iban')}
        className="flex flex-col gap-1.5 text-sm font-medium sm:col-span-2"
      >
        {copy.ibanLabel}
        <Input
          id={id('iban')}
          name="iban"
          dir="ltr"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          required
          placeholder={ibanOnFileMasked ?? 'SA00 0000 0000 0000 0000 0000'}
          // 24 chars + up to 5 group spaces the way bank apps print them.
          maxLength={29}
          defaultValue={values?.iban ?? ''}
          className="font-mono tracking-[0.08em]"
          aria-invalid={errorFor('iban') ? 'true' : undefined}
          aria-describedby={describedBy('iban', true)}
        />
        <span id={`${id('iban')}-hint`} className="text-sarat-black-600 font-normal">
          {ibanOnFileMasked && copy.ibanReenterHint ? copy.ibanReenterHint : copy.ibanHint}
        </span>
        <FieldError id={`${id('iban')}-error`}>{errorFor('iban')}</FieldError>
      </label>
    </div>
  );
}
