'use client';

import { useActionState, useEffect } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Check, Wallet, X } from 'lucide-react';
import type { Locale } from '@/lib/i18n';
import { formatSAR } from '@/lib/format';
import { Button } from '@/components/ui/button';
import {
  applyWalletCredit,
  removeWalletCredit,
  type WalletCheckoutActionState,
  type WalletCheckoutErrorCode,
} from '@/features/wallet/checkout-actions';

export interface WalletCheckoutFieldCopy {
  /**
   * `{amount}` is replaced with the formatted SAR balance. When the
   * balance covers the total, the caller passes the fully-formatted
   * capped line instead (no `{amount}` — the replace is a no-op).
   */
  available: string;
  /**
   * Shown under the applied chip when the remaining card charge is the
   * SAR 1 floor — echoes the cap the entry line promised. Omitted
   * otherwise.
   */
  capNote?: string;
  apply: string;
  applying: string;
  appliedPrefix: string;
  remove: string;
  removing: string;
  errors: Record<WalletCheckoutErrorCode, string>;
}

export interface WalletCheckoutFieldProps {
  reference: string;
  locale: Locale;
  /** Spendable balance at render time — drives the entry view. */
  balanceSar: number;
  /** Credit already on the booking — drives the applied view. */
  appliedSar: number;
  copy: WalletCheckoutFieldCopy;
}

const initialState: WalletCheckoutActionState = { status: 'idle' };

function ApplyButton({ label, pending: pendingLabel }: { label: string; pending: string }) {
  const { pending } = useFormStatus();
  return (
    // Secondary on purpose (like the promo Apply): this sits in the
    // summary rail and must never outrank the page's payment CTA.
    <Button type="submit" variant="secondary" size="md" pending={pending} className="w-full">
      <Wallet className="size-4 shrink-0" aria-hidden />
      {pending ? pendingLabel : label}
    </Button>
  );
}

function RemoveButton({ label, pending: pendingLabel }: { label: string; pending: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      aria-busy={pending || undefined}
      className="text-sarat-black-600 hover:text-sarat-black inline-flex items-center gap-1 text-sm transition-colors duration-200 disabled:opacity-50"
      disabled={pending}
    >
      <X className="size-3.5 shrink-0" aria-hidden />
      {pending ? pendingLabel : label}
    </button>
  );
}

/**
 * One-tap Gharmish Credit on the payment step. Same contract as
 * PromoCodeField: apply/remove mutate the booking's charged total
 * server-side; success refreshes the server-rendered summary, and a
 * superseded live checkout forces a full reload (the mounted widget
 * would otherwise charge the old amount). Applied vs entry view is
 * driven by the server-rendered `appliedSar` — no client toggle state.
 */
export function WalletCheckoutField({
  reference,
  locale,
  balanceSar,
  appliedSar,
  copy,
}: WalletCheckoutFieldProps) {
  const router = useRouter();
  const [applyState, applyAction] = useActionState(applyWalletCredit, initialState);
  const [removeState, removeAction] = useActionState(removeWalletCredit, initialState);

  useEffect(() => {
    if (applyState.status !== 'applied') return;
    if (applyState.checkoutSuperseded) window.location.reload();
    else router.refresh();
  }, [applyState, router]);

  useEffect(() => {
    if (removeState.status !== 'removed') return;
    if (removeState.checkoutSuperseded) window.location.reload();
    else router.refresh();
  }, [removeState, router]);

  const applyError = applyState.status === 'error' ? copy.errors[applyState.error] : undefined;
  const removeError = removeState.status === 'error' ? copy.errors[removeState.error] : undefined;

  if (appliedSar > 0) {
    return (
      <form action={removeAction} className="flex flex-col gap-2">
        <input type="hidden" name="reference" value={reference} />
        <input type="hidden" name="locale" value={locale} />
        <div className="border-juniper-green/30 bg-juniper-green-50 rounded-input flex flex-wrap items-center gap-3 [border-width:0.5px] px-4 py-3">
          <Check className="text-juniper-green size-4 shrink-0" aria-hidden />
          <span className="text-sm font-medium">
            {copy.appliedPrefix} <span dir="ltr">−{formatSAR(appliedSar, locale)}</span>
          </span>
          <span className="ms-auto">
            <RemoveButton label={copy.remove} pending={copy.removing} />
          </span>
        </div>
        {copy.capNote && <p className="text-sarat-black-600 text-sm">{copy.capNote}</p>}
        {removeError && (
          <p role="alert" className="text-al-qatt-red-800 text-sm">
            {removeError}
          </p>
        )}
      </form>
    );
  }

  if (balanceSar <= 0) return null;

  return (
    <form action={applyAction} className="flex flex-col gap-2">
      <input type="hidden" name="reference" value={reference} />
      <input type="hidden" name="locale" value={locale} />
      <p className="text-sarat-black-600 text-sm">
        {copy.available.replace('{amount}', formatSAR(balanceSar, locale))}
      </p>
      <ApplyButton label={copy.apply} pending={copy.applying} />
      {applyError && (
        <p role="alert" className="text-al-qatt-red-800 text-sm">
          {applyError}
        </p>
      )}
    </form>
  );
}
