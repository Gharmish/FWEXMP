'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { ConfirmSubmit } from '@/components/ui/confirm-dialog';
import type { MomentActionState } from '@/features/admin/experiences/moment-actions';

type MomentAction = (state: MomentActionState, formData: FormData) => Promise<MomentActionState>;

interface MomentActionButtonProps {
  action: MomentAction;
  hidden: Record<string, string>;
  label: string;
  pendingLabel: string;
  variant?: 'secondary' | 'primary';
  confirm?: string;
  disabled?: boolean;
}

const initialState: MomentActionState = { success: false };

function Submit({
  label,
  pendingLabel,
  variant,
  confirm,
  disabled,
}: {
  label: string;
  pendingLabel: string;
  variant: 'secondary' | 'primary';
  confirm?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  if (confirm && !disabled) {
    return (
      <ConfirmSubmit
        title={label}
        description={confirm}
        confirmLabel={label}
        pendingLabel={pendingLabel}
        destructive
        variant={variant}
        size="sm"
      >
        {label}
      </ConfirmSubmit>
    );
  }
  return (
    <Button type="submit" variant={variant} size="sm" pending={pending} disabled={disabled}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function MomentActionButton({
  action,
  hidden,
  label,
  pendingLabel,
  variant = 'secondary',
  confirm,
  disabled,
}: MomentActionButtonProps) {
  const [, formAction] = useActionState(action, initialState);
  return (
    <form action={formAction}>
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Submit
        label={label}
        pendingLabel={pendingLabel}
        variant={variant}
        confirm={confirm}
        disabled={disabled}
      />
    </form>
  );
}
