'use client';

import { useActionState, useEffect, useId } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Check, Tag, X } from 'lucide-react';
import type { Locale } from '@/lib/i18n';
import { formatSAR } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  applyPromo,
  removePromo,
  type PromoActionState,
  type PromoErrorCode,
} from '@/features/promo-codes/actions';

export interface PromoCodeFieldCopy {
  label: string;
  placeholder: string;
  apply: string;
  applying: string;
  appliedPrefix: string;
  remove: string;
  removing: string;
  /** `{min}` is replaced with the formatted SAR minimum. */
  errorBelowMin: string;
  /** Shown when a promo change released applied wallet credit — the guest re-taps. */
  creditReleased: string;
  errors: Record<Exclude<PromoErrorCode, 'below_min'>, string>;
}

export interface PromoCodeFieldProps {
  reference: string;
  slug: string;
  locale: Locale;
  /**
   * Signed token from the pay link we sent this guest, forwarded to the
   * action so a cookieless browser (WhatsApp's in-app one, or a second
   * device) can still finish paying. Undefined for the in-session flow.
   */
  linkToken?: string;

  /** The code already on the booking, if any — drives applied vs entry view. */
  appliedCode: string | null;
  copy: PromoCodeFieldCopy;
}

const initialState: PromoActionState = { status: 'idle' };

function errorMessage(
  state: PromoActionState,
  locale: Locale,
  copy: PromoCodeFieldCopy,
): string | undefined {
  if (state.status !== 'error') return undefined;
  if (state.error === 'below_min') {
    const min = state.minTotalSar != null ? formatSAR(state.minTotalSar, locale) : '';
    return copy.errorBelowMin.replace('{min}', min);
  }
  return copy.errors[state.error];
}

function ApplyButton({ label, pending: pendingLabel }: { label: string; pending: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="md" pending={pending}>
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
 * Promo-code entry on the payment step. Applying or removing a code
 * mutates the booking's charged total server-side; on success we
 * `router.refresh()` so the server-rendered order summary (and the
 * total the checkout will charge) re-reads from the DB. The applied vs
 * entry view is driven by `appliedCode`, which comes from that same
 * server render — no client toggle state to drift.
 */
export function PromoCodeField({
  reference,
  slug,
  locale,
  linkToken,
  appliedCode,
  copy,
}: PromoCodeFieldProps) {
  const router = useRouter();
  const uid = useId();
  const [applyState, applyAction] = useActionState(applyPromo, initialState);
  const [removeState, removeAction] = useActionState(removePromo, initialState);

  useEffect(() => {
    if (applyState.status !== 'applied') return;
    // A total change superseded a live checkout — the mounted widget is
    // client state a refresh can't reset, and paying through it would
    // charge the OLD amount. A full reload is the only reliable teardown;
    // the next "continue" prepares a fresh checkout at the new total.
    if (applyState.checkoutSuperseded) window.location.reload();
    else router.refresh();
  }, [applyState, router]);

  useEffect(() => {
    if (removeState.status !== 'removed') return;
    if (removeState.checkoutSuperseded) window.location.reload();
    else router.refresh();
  }, [removeState, router]);

  const applyError = errorMessage(applyState, locale, copy);
  const removeError = errorMessage(removeState, locale, copy);
  // Promo math runs on the pre-credit base, so a promo change releases
  // any applied wallet credit — tell the guest to re-tap it.
  const creditReleased =
    (applyState.status === 'applied' && applyState.walletCreditReleased) ||
    (removeState.status === 'removed' && removeState.walletCreditReleased);
  const creditReleasedNote = creditReleased ? (
    <p role="status" className="text-sarat-black-600 text-sm">
      {copy.creditReleased}
    </p>
  ) : null;

  if (appliedCode) {
    return (
      <form action={removeAction} className="flex flex-col gap-2">
        <input type="hidden" name="reference" value={reference} />
        {linkToken && <input type="hidden" name="token" value={linkToken} />}
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="locale" value={locale} />
        <div className="border-juniper-green/30 bg-juniper-green-50 rounded-input flex flex-wrap items-center gap-3 [border-width:0.5px] px-4 py-3">
          <Check className="text-juniper-green size-4 shrink-0" aria-hidden />
          <span className="text-sm font-medium">
            {copy.appliedPrefix}{' '}
            <span className="font-display tracking-[0.04em]" dir="ltr">
              {appliedCode}
            </span>
          </span>
          <span className="ms-auto">
            <RemoveButton label={copy.remove} pending={copy.removing} />
          </span>
        </div>
        {removeError && (
          <p role="alert" className="text-al-qatt-red-800 text-sm">
            {removeError}
          </p>
        )}
        {creditReleasedNote}
      </form>
    );
  }

  return (
    <form action={applyAction} className="flex flex-col gap-2">
      <input type="hidden" name="reference" value={reference} />
      {linkToken && <input type="hidden" name="token" value={linkToken} />}
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="locale" value={locale} />
      <label
        htmlFor={`${uid}-code`}
        className="text-sarat-black-600 flex items-center gap-2 text-sm"
      >
        <Tag className="size-4 shrink-0" aria-hidden />
        {copy.label}
      </label>
      <div className="flex flex-wrap items-start gap-3">
        <Input
          id={`${uid}-code`}
          name="code"
          dir="ltr"
          autoCapitalize="characters"
          placeholder={copy.placeholder}
          // A failed apply echoes the attempted code back so one bad
          // character doesn't mean retyping the whole thing.
          defaultValue={applyState.status === 'error' ? (applyState.code ?? '') : ''}
          className="w-full max-w-56 flex-1 uppercase"
          aria-invalid={applyState.status === 'error' ? true : undefined}
          aria-describedby={applyState.status === 'error' ? `${uid}-code-error` : undefined}
        />
        <ApplyButton label={copy.apply} pending={copy.applying} />
      </div>
      {applyError && (
        <p id={`${uid}-code-error`} role="alert" className="text-al-qatt-red-800 text-sm">
          {applyError}
        </p>
      )}
      {creditReleasedNote}
    </form>
  );
}
