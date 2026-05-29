'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
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
  return (
    <Button
      type="submit"
      variant={variant}
      size="sm"
      disabled={pending || disabled}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
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
