'use client';

import { useActionState, useEffect, useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ConfirmSubmit } from '@/components/ui/confirm-dialog';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { adjustWalletBalance, issueWalletCredit } from '@/features/wallet/actions';
import { WALLET_MAX_PER_ACTION_SAR, WALLET_NOTE_MAX } from '@/features/wallet/schemas';
import type { WalletActionState } from '@/features/wallet/types';

export interface WalletAdminFormsCopy {
  issueToggle: string;
  adjustToggle: string;
  amount: string;
  amountHint: string;
  note: string;
  noteOptional: string;
  adjustNote: string;
  expiry: string;
  expiryHint: string;
  issueSubmit: string;
  issuing: string;
  issued: string;
  issueConfirmTitle: string;
  issueConfirmBody: string;
  adjustSubmit: string;
  adjusting: string;
  adjusted: string;
  adjustConfirmTitle: string;
  adjustConfirmBody: string;
  fieldInvalid: string;
  errors: Record<NonNullable<Extract<WalletActionState, { success: false }>['message']>, string>;
}

export interface WalletAdminFormsProps {
  personKey: string;
  /** Server-generated per-render uuids; a fresh RSC render after success mints new ones. */
  idempotencyKeys: { issue: string; adjust: string };
  copy: WalletAdminFormsCopy;
}

const initialState: WalletActionState = { success: false };

function Toggle({ label, open, onClick }: { label: string; open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className="text-sarat-black-600 inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium transition-opacity duration-200 hover:opacity-60"
    >
      <ChevronDown
        className={cn('size-4 shrink-0 transition-transform duration-200', open && 'rotate-180')}
        aria-hidden
      />
      {label}
    </button>
  );
}

function Field({
  label,
  hint,
  name,
  defaultValue,
  error,
  type,
  dir,
  min,
  max,
}: {
  label: string;
  hint?: string;
  name: string;
  defaultValue: string;
  error?: string;
  type?: string;
  dir?: 'ltr';
  min?: number;
  max?: number;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Input
        id={id}
        name={name}
        type={type}
        dir={dir}
        min={min}
        max={max}
        inputMode={type === 'number' ? 'numeric' : undefined}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      {hint && <p className="text-sarat-black-600 text-xs">{hint}</p>}
      {error && (
        <p id={errorId} role="alert" className="text-al-qatt-red-800 text-sm">
          {error}
        </p>
      )}
    </div>
  );
}

function useWalletFormState(
  action: typeof issueWalletCredit,
  successTitle: string,
  copy: WalletAdminFormsCopy,
) {
  const [state, formAction] = useActionState(action, initialState);
  useEffect(() => {
    if (state.success) toast({ title: successTitle, tone: 'success' });
  }, [state, successTitle]);
  const values = state.success ? undefined : state.values;
  const fieldError = (name: string): string | undefined =>
    !state.success && state.fields?.[name] ? copy.fieldInvalid : undefined;
  const generalError = !state.success && state.message ? copy.errors[state.message] : undefined;
  return { formAction, values, fieldError, generalError };
}

export function WalletAdminForms({ personKey, idempotencyKeys, copy }: WalletAdminFormsProps) {
  const [issueOpen, setIssueOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const noteId = useId();
  const issue = useWalletFormState(issueWalletCredit, copy.issued, copy);
  const adjust = useWalletFormState(adjustWalletBalance, copy.adjusted, copy);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-6">
        <Toggle label={copy.issueToggle} open={issueOpen} onClick={() => setIssueOpen((v) => !v)} />
        <Toggle
          label={copy.adjustToggle}
          open={adjustOpen}
          onClick={() => setAdjustOpen((v) => !v)}
        />
      </div>

      {issueOpen && (
        <form action={issue.formAction} className="flex flex-col gap-5">
          <input type="hidden" name="key" value={personKey} />
          <input type="hidden" name="idempotencyKey" value={idempotencyKeys.issue} />
          {/* Single reason in P0; becomes a select when more kinds are issuable. */}
          <input type="hidden" name="reason" value="goodwill" />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label={copy.amount}
              hint={copy.amountHint}
              name="amountSar"
              type="number"
              dir="ltr"
              min={1}
              max={WALLET_MAX_PER_ACTION_SAR}
              defaultValue={issue.values?.amountSar ?? ''}
              error={issue.fieldError('amountSar')}
            />
            <Field
              label={copy.expiry}
              hint={copy.expiryHint}
              name="expiresAt"
              type="datetime-local"
              dir="ltr"
              defaultValue={issue.values?.expiresAt ?? ''}
              error={issue.fieldError('expiresAt')}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor={`${noteId}-issue`} className="text-sm font-medium">
              {copy.note}{' '}
              <span className="text-sarat-black-600 font-normal">({copy.noteOptional})</span>
            </label>
            <textarea
              id={`${noteId}-issue`}
              name="note"
              rows={2}
              maxLength={WALLET_NOTE_MAX}
              defaultValue={issue.values?.note ?? ''}
              className="rounded-input border-sarat-black/20 text-sarat-black w-full [border-width:0.5px] bg-white p-3 text-base"
            />
          </div>
          {issue.generalError && (
            <p className="text-al-qatt-red text-sm" role="alert">
              {issue.generalError}
            </p>
          )}
          <ConfirmSubmit
            title={copy.issueConfirmTitle}
            description={copy.issueConfirmBody}
            confirmLabel={copy.issueSubmit}
            pendingLabel={copy.issuing}
            variant="primary"
            className="self-start"
          >
            {copy.issueSubmit}
          </ConfirmSubmit>
        </form>
      )}

      {adjustOpen && (
        <form action={adjust.formAction} className="flex flex-col gap-5">
          <input type="hidden" name="key" value={personKey} />
          <input type="hidden" name="idempotencyKey" value={idempotencyKeys.adjust} />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label={copy.amount}
              hint={copy.amountHint}
              name="amountSar"
              type="number"
              dir="ltr"
              min={1}
              max={WALLET_MAX_PER_ACTION_SAR}
              defaultValue={adjust.values?.amountSar ?? ''}
              error={adjust.fieldError('amountSar')}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor={`${noteId}-adjust`} className="text-sm font-medium">
              {copy.adjustNote}
            </label>
            <textarea
              id={`${noteId}-adjust`}
              name="note"
              rows={2}
              required
              maxLength={WALLET_NOTE_MAX}
              defaultValue={adjust.values?.note ?? ''}
              aria-invalid={adjust.fieldError('note') ? true : undefined}
              className="rounded-input border-sarat-black/20 text-sarat-black w-full [border-width:0.5px] bg-white p-3 text-base"
            />
            {adjust.fieldError('note') && (
              <p role="alert" className="text-al-qatt-red-800 text-sm">
                {copy.fieldInvalid}
              </p>
            )}
          </div>
          {adjust.generalError && (
            <p className="text-al-qatt-red text-sm" role="alert">
              {adjust.generalError}
            </p>
          )}
          <ConfirmSubmit
            title={copy.adjustConfirmTitle}
            description={copy.adjustConfirmBody}
            confirmLabel={copy.adjustSubmit}
            pendingLabel={copy.adjusting}
            destructive
            className="border-al-qatt-red/40 text-al-qatt-red-800 self-start"
          >
            {copy.adjustSubmit}
          </ConfirmSubmit>
        </form>
      )}
    </div>
  );
}
