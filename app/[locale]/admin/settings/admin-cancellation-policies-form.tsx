'use client';

import { useActionState, useId } from 'react';
import { useFormStatus } from 'react-dom';
import { Check } from 'lucide-react';
import type { Locale } from '@/lib/i18n';
import type { CancellationTier, PolicySnapshot } from '@/features/bookings/lib/policy';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  updateCancellationPolicies,
  type UpdateCancellationPoliciesState,
} from '@/features/admin/settings/actions';

export interface AdminCancellationPoliciesFormCopy {
  /** Localized tier names, shared with every tier picker. */
  tierNames: Record<CancellationTier, string>;
  /** Current rules per tier, rendered server-side from the same DB rows. */
  tierDescriptions: Record<CancellationTier, string>;
  freeCancelLabel: string;
  partialPctLabel: string;
  partialWindowLabel: string;
  rescheduleLabel: string;
  hoursSuffix: string;
  pctSuffix: string;
  hint: string;
  save: string;
  saving: string;
  success: string;
  fieldInvalid: string;
  formServer: string;
  formForbidden: string;
  formValidation: string;
  partialOrderError: string;
}

export interface AdminCancellationPoliciesFormProps {
  locale: Locale;
  tiers: Record<CancellationTier, PolicySnapshot>;
  copy: AdminCancellationPoliciesFormCopy;
}

const TIERS = ['flexible', 'moderate', 'strict'] as const;

const initialState: UpdateCancellationPoliciesState = { success: false };

function SubmitButton({ label, pending: pendingLabel }: { label: string; pending: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="lg" pending={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function AdminCancellationPoliciesForm({
  locale,
  tiers,
  copy,
}: AdminCancellationPoliciesFormProps) {
  const [state, formAction] = useActionState(updateCancellationPolicies, initialState);
  const fields = state.success ? {} : (state.fields ?? {});
  const values = state.success ? {} : (state.values ?? {});
  const errorPrefix = useId();
  const eid = (k: string) => `${errorPrefix}-${k.replace('.', '-')}`;

  const formError = state.success
    ? undefined
    : state.message === 'server'
      ? copy.formServer
      : state.message === 'forbidden'
        ? copy.formForbidden
        : state.message === 'validation'
          ? copy.formValidation
          : undefined;

  // Echo submitted values after a failed action — React resets
  // uncontrolled inputs to server defaults otherwise (house rule).
  const valueFor = (name: string, fallback: number) =>
    state.success === false ? (values[name] ?? fallback) : fallback;

  const numberField = (
    name: string,
    label: string,
    suffix: string,
    fallback: number,
    opts: { min: number; max: number; error?: string },
  ) => (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {label}
      <div className="flex items-center gap-2">
        <Input
          name={name}
          type="number"
          inputMode="numeric"
          min={opts.min}
          max={opts.max}
          step={1}
          dir="ltr"
          defaultValue={valueFor(name, fallback)}
          className="w-28"
          aria-invalid={fields[name] ? 'true' : undefined}
          aria-describedby={fields[name] ? eid(name) : undefined}
        />
        <span className="text-sarat-black-600 text-sm font-normal">{suffix}</span>
      </div>
      {fields[name] && (
        <p id={eid(name)} className="text-al-qatt-red-800 text-sm font-normal">
          {fields[name] === 'partial_window_order' ? copy.partialOrderError : copy.fieldInvalid}
        </p>
      )}
    </label>
  );

  return (
    <form action={formAction} noValidate className="flex max-w-2xl flex-col gap-8">
      <input type="hidden" name="locale" value={locale} />
      <p className="text-sarat-black-600 text-sm">{copy.hint}</p>

      {TIERS.map((tier) => (
        <fieldset
          key={tier}
          className="border-sarat-black/8 rounded-card flex flex-col gap-4 [border-width:0.5px] p-6"
        >
          <legend className="px-1 text-sm font-medium">{copy.tierNames[tier]}</legend>
          <p className="text-sarat-black-600 text-sm">{copy.tierDescriptions[tier]}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {numberField(
              `${tier}.freeCancelHours`,
              copy.freeCancelLabel,
              copy.hoursSuffix,
              tiers[tier].freeCancelHours,
              { min: 1, max: 2160 },
            )}
            {numberField(
              `${tier}.rescheduleCutoffHours`,
              copy.rescheduleLabel,
              copy.hoursSuffix,
              tiers[tier].rescheduleCutoffHours,
              { min: 1, max: 2160 },
            )}
            {numberField(
              `${tier}.partialRefundPct`,
              copy.partialPctLabel,
              copy.pctSuffix,
              tiers[tier].partialRefundBps / 100,
              { min: 0, max: 100 },
            )}
            {numberField(
              `${tier}.partialRefundHours`,
              copy.partialWindowLabel,
              copy.hoursSuffix,
              tiers[tier].partialRefundHours,
              { min: 0, max: 2160 },
            )}
          </div>
        </fieldset>
      ))}

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
