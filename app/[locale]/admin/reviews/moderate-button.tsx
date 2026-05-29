'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { setReviewHidden, type ModerateReviewState } from '@/features/admin/reviews/actions';

interface ModerateButtonProps {
  reviewId: string;
  hidden: boolean;
  hideLabel: string;
  unhideLabel: string;
  pendingLabel: string;
  errorLabel: string;
}

const initialState: ModerateReviewState = { success: false };

function Submit({
  hidden,
  hideLabel,
  unhideLabel,
  pendingLabel,
}: {
  hidden: boolean;
  hideLabel: string;
  unhideLabel: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={hidden ? 'primary' : 'secondary'} size="md" disabled={pending}>
      {pending ? pendingLabel : hidden ? unhideLabel : hideLabel}
    </Button>
  );
}

export function ModerateButton({
  reviewId,
  hidden,
  hideLabel,
  unhideLabel,
  pendingLabel,
  errorLabel,
}: ModerateButtonProps) {
  const [state, action] = useActionState(setReviewHidden, initialState);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="reviewId" value={reviewId} />
      {/* Toggle: send the opposite of the current state. */}
      <input type="hidden" name="hide" value={hidden ? 'false' : 'true'} />
      <Submit
        hidden={hidden}
        hideLabel={hideLabel}
        unhideLabel={unhideLabel}
        pendingLabel={pendingLabel}
      />
      {!state.success && state.message && (
        <p role="alert" className="text-al-qatt-red-800 text-sm">
          {errorLabel}
        </p>
      )}
    </form>
  );
}
