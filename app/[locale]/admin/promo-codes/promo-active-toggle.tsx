'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { Locale } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { setPromoActive, type PromoAdminActionState } from '@/features/promo-codes/admin-actions';

export interface PromoActiveToggleCopy {
  activate: string;
  deactivate: string;
  pending: string;
  formServer: string;
  formForbidden: string;
}

export interface PromoActiveToggleProps {
  promoCodeId: string;
  active: boolean;
  locale: Locale;
  copy: PromoActiveToggleCopy;
}

const initialState: PromoAdminActionState = { success: false };

function ToggleButton({ label, pending: pendingLabel }: { label: string; pending: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="sm" pending={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

/**
 * Activate / deactivate one promo code. Submits the OPPOSITE of the
 * current state; the row re-renders from the server after
 * `revalidatePath`, so there is no client toggle state to drift.
 */
export function PromoActiveToggle({ promoCodeId, active, locale, copy }: PromoActiveToggleProps) {
  const [state, formAction] = useActionState(setPromoActive, initialState);

  const error = state.success
    ? undefined
    : state.message === 'forbidden'
      ? copy.formForbidden
      : state.message
        ? copy.formServer
        : undefined;

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="promoCodeId" value={promoCodeId} />
      {/* Submit the opposite state — checked when we want to activate. */}
      {!active && <input type="hidden" name="active" value="on" />}
      <ToggleButton label={active ? copy.deactivate : copy.activate} pending={copy.pending} />
      {error && (
        <p role="alert" className="text-al-qatt-red-800 text-xs">
          {error}
        </p>
      )}
    </form>
  );
}
