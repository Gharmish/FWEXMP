'use client';

import { useActionState, useId, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Check } from 'lucide-react';
import type { Locale } from '@/lib/i18n';
import type { Category } from '@/lib/colors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pill } from '@/components/ui/pill';
import { updateSettings, type UpdateSettingsState } from '@/features/admin/settings/actions';

export interface AdminSettingsFormCopy {
  commissionLabel: string;
  commissionHint: string;
  commissionSuffix: string;
  cancellationLabel: string;
  cancellationHint: string;
  cancellationSuffix: string;
  approvalLabel: string;
  approvalHint: string;
  approvalPaymentLabel: string;
  approvalPaymentHint: string;
  hoursSuffix: string;
  announcementLabel: string;
  announcementHint: string;
  announcementEnLabel: string;
  announcementArLabel: string;
  categoriesLabel: string;
  categoriesHint: string;
  categories: readonly { value: Category; label: string }[];
  save: string;
  saving: string;
  success: string;
  fieldInvalid: string;
  formServer: string;
  formForbidden: string;
  formValidation: string;
}

export interface AdminSettingsFormProps {
  locale: Locale;
  defaultCommissionPct: number;
  defaultCancellationWindowHours: number;
  defaultApprovalWindowHours: number;
  defaultApprovalPaymentWindowHours: number;
  defaultAnnouncementEn: string;
  defaultAnnouncementAr: string;
  defaultEnabled: readonly Category[];
  copy: AdminSettingsFormCopy;
}

const initialState: UpdateSettingsState = { success: false };

function SubmitButton({ label, pending: pendingLabel }: { label: string; pending: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="lg" pending={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function AdminSettingsForm({
  locale,
  defaultCommissionPct,
  defaultCancellationWindowHours,
  defaultApprovalWindowHours,
  defaultApprovalPaymentWindowHours,
  defaultAnnouncementEn,
  defaultAnnouncementAr,
  defaultEnabled,
  copy,
}: AdminSettingsFormProps) {
  const [state, formAction] = useActionState(updateSettings, initialState);
  const [enabled, setEnabled] = useState<ReadonlySet<Category>>(new Set(defaultEnabled));

  const fields = state.success ? {} : (state.fields ?? {});
  const errorPrefix = useId();
  const eid = (k: string) => `${errorPrefix}-${k}`;

  const toggle = (cat: Category) =>
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });

  const fieldError = (name: string) =>
    fields[name] ? (
      <p id={eid(name)} className="text-al-qatt-red-800 text-sm">
        {copy.fieldInvalid}
      </p>
    ) : null;

  const formError = state.success
    ? undefined
    : state.message === 'server'
      ? copy.formServer
      : state.message === 'forbidden'
        ? copy.formForbidden
        : state.message === 'validation'
          ? copy.formValidation
          : undefined;

  const labelClass = 'text-sm font-medium';
  const hintClass = 'text-sarat-black-600 text-sm';

  return (
    <form action={formAction} noValidate className="flex max-w-2xl flex-col gap-10">
      <input type="hidden" name="locale" value={locale} />
      {[...enabled].map((cat) => (
        <input key={cat} type="hidden" name="enabledCategories" value={cat} />
      ))}

      {/* Commission */}
      <fieldset className="flex flex-col gap-2">
        <label htmlFor="commissionPct" className={labelClass}>
          {copy.commissionLabel}
        </label>
        <div className="flex items-center gap-2">
          <Input
            id="commissionPct"
            name="commissionPct"
            type="number"
            inputMode="decimal"
            min={0}
            max={50}
            step={0.5}
            dir="ltr"
            defaultValue={defaultCommissionPct}
            className="w-32"
            aria-invalid={fields.commissionPct ? 'true' : undefined}
            aria-describedby={fields.commissionPct ? eid('commissionPct') : undefined}
          />
          <span className="text-sarat-black-600 text-base">{copy.commissionSuffix}</span>
        </div>
        <p className={hintClass}>{copy.commissionHint}</p>
        {fieldError('commissionPct')}
      </fieldset>

      {/* Free-cancellation window */}
      <fieldset className="flex flex-col gap-2">
        <label htmlFor="cancellationWindowHours" className={labelClass}>
          {copy.cancellationLabel}
        </label>
        <div className="flex items-center gap-2">
          <Input
            id="cancellationWindowHours"
            name="cancellationWindowHours"
            type="number"
            inputMode="numeric"
            min={0}
            max={336}
            step={1}
            dir="ltr"
            defaultValue={defaultCancellationWindowHours}
            className="w-32"
            aria-invalid={fields.cancellationWindowHours ? 'true' : undefined}
            aria-describedby={
              fields.cancellationWindowHours ? eid('cancellationWindowHours') : undefined
            }
          />
          <span className="text-sarat-black-600 text-base">{copy.cancellationSuffix}</span>
        </div>
        <p className={hintClass}>{copy.cancellationHint}</p>
        {fieldError('cancellationWindowHours')}
      </fieldset>

      {/* Request-to-book: host approval window */}
      <fieldset className="flex flex-col gap-2">
        <label htmlFor="approvalWindowHours" className={labelClass}>
          {copy.approvalLabel}
        </label>
        <div className="flex items-center gap-2">
          <Input
            id="approvalWindowHours"
            name="approvalWindowHours"
            type="number"
            inputMode="numeric"
            min={1}
            max={336}
            step={1}
            dir="ltr"
            defaultValue={defaultApprovalWindowHours}
            className="w-32"
            aria-invalid={fields.approvalWindowHours ? 'true' : undefined}
            aria-describedby={fields.approvalWindowHours ? eid('approvalWindowHours') : undefined}
          />
          <span className="text-sarat-black-600 text-base">{copy.hoursSuffix}</span>
        </div>
        <p className={hintClass}>{copy.approvalHint}</p>
        {fieldError('approvalWindowHours')}
      </fieldset>

      {/* Request-to-book: payment window after approval */}
      <fieldset className="flex flex-col gap-2">
        <label htmlFor="approvalPaymentWindowHours" className={labelClass}>
          {copy.approvalPaymentLabel}
        </label>
        <div className="flex items-center gap-2">
          <Input
            id="approvalPaymentWindowHours"
            name="approvalPaymentWindowHours"
            type="number"
            inputMode="numeric"
            min={1}
            max={336}
            step={1}
            dir="ltr"
            defaultValue={defaultApprovalPaymentWindowHours}
            className="w-32"
            aria-invalid={fields.approvalPaymentWindowHours ? 'true' : undefined}
            aria-describedby={
              fields.approvalPaymentWindowHours ? eid('approvalPaymentWindowHours') : undefined
            }
          />
          <span className="text-sarat-black-600 text-base">{copy.hoursSuffix}</span>
        </div>
        <p className={hintClass}>{copy.approvalPaymentHint}</p>
        {fieldError('approvalPaymentWindowHours')}
      </fieldset>

      {/* Home announcement band */}
      <fieldset className="flex flex-col gap-3">
        <legend className={labelClass}>{copy.announcementLabel}</legend>
        <p className={hintClass}>{copy.announcementHint}</p>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {copy.announcementEnLabel}
          <Input
            name="announcementEn"
            maxLength={200}
            defaultValue={defaultAnnouncementEn}
            aria-invalid={fields.announcementEn ? 'true' : undefined}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {copy.announcementArLabel}
          <Input
            name="announcementAr"
            dir="rtl"
            maxLength={200}
            defaultValue={defaultAnnouncementAr}
            aria-invalid={fields.announcementAr ? 'true' : undefined}
          />
        </label>
        {fieldError('announcementEn')}
        {fieldError('announcementAr')}
      </fieldset>

      {/* Enabled categories */}
      <fieldset className="flex flex-col gap-3">
        <legend className={labelClass}>{copy.categoriesLabel}</legend>
        <p className={hintClass}>{copy.categoriesHint}</p>
        <div className="flex flex-wrap gap-2">
          {copy.categories.map((c) => {
            const on = enabled.has(c.value);
            return (
              <Pill key={c.value} category={c.value} selected={on} onClick={() => toggle(c.value)}>
                {on && <Check aria-hidden />}
                {c.label}
              </Pill>
            );
          })}
        </div>
        {fieldError('enabledCategories')}
      </fieldset>

      {formError && (
        <p role="alert" className="text-al-qatt-red-800 text-sm">
          {formError}
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
        <SubmitButton label={copy.save} pending={copy.saving} />
      </div>
    </form>
  );
}
