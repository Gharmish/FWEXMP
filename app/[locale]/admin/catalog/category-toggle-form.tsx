'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { Locale } from '@/lib/i18n';
import type { Category } from '@/lib/colors';
import { Button } from '@/components/ui/button';
import { setCategoryEnabled, type CatalogActionState } from '@/features/admin/catalog/actions';

export interface CategoryToggleFormCopy {
  enable: string;
  disable: string;
  pending: string;
  lastCategory: string;
  formServer: string;
  formForbidden: string;
}

export interface CategoryToggleFormProps {
  category: Category;
  enabled: boolean;
  locale: Locale;
  copy: CategoryToggleFormCopy;
}

const initialState: CatalogActionState = { success: false };

function ToggleButton({ label, pending: pendingLabel }: { label: string; pending: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="sm" pending={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

/**
 * One enable/disable form per category row. Submits the OPPOSITE of the
 * current state — the row re-renders from the server after
 * `revalidatePath`, so there is no client-side toggle state to drift.
 */
export function CategoryToggleForm({ category, enabled, locale, copy }: CategoryToggleFormProps) {
  const [state, formAction] = useActionState(setCategoryEnabled, initialState);

  const error = state.success
    ? undefined
    : state.message === 'last_category'
      ? copy.lastCategory
      : state.message === 'forbidden'
        ? copy.formForbidden
        : state.message
          ? copy.formServer
          : undefined;

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="category" value={category} />
      {!enabled && <input type="hidden" name="enabled" value="on" />}
      <ToggleButton label={enabled ? copy.disable : copy.enable} pending={copy.pending} />
      {error && (
        <p role="alert" className="text-al-qatt-red-800 text-xs">
          {error}
        </p>
      )}
    </form>
  );
}
