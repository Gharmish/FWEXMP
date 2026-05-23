'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Locale } from '@/lib/i18n';
import {
  publishHostExperience,
  pauseHostExperience,
  type HostExperienceState,
} from '@/features/host-experiences/actions';
import Link from 'next/link';

type ErrorKey =
  | 'cannot_publish'
  | 'not_found'
  | 'forbidden'
  | 'no_db'
  | 'server'
  | 'validation'
  | 'wrong_state'
  | 'suspended';

interface LifecycleCopy {
  /** Default "Submit for review" / "Publish (back to live)" label. */
  publish: string;
  publishPending: string;
  /** Used when status is `changes_requested` — "Resubmit for review". */
  resubmit: string;
  /** Used when status is `paused` — paused listings skip review. */
  republish: string;
  pendingReviewLabel: string;
  pause: string;
  pausePending: string;
  viewPublic: string;
  errors: Record<ErrorKey, string>;
}

export interface LifecycleActionsProps {
  experienceId: string;
  status: 'draft' | 'pending_review' | 'changes_requested' | 'live' | 'paused' | 'archived';
  /** Slug isn't needed for the buttons themselves — only the "view public" link in `live`. */
  locale: Locale;
  copy: LifecycleCopy;
}

const initialState: HostExperienceState = { success: false };

function PublishSubmit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="md" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

function PauseSubmit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="md" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

function errorMessage(state: HostExperienceState, copy: LifecycleCopy): string | undefined {
  if (!state.message) return undefined;
  const key = state.message as ErrorKey;
  return key in copy.errors ? copy.errors[key] : copy.errors.server;
}

export function LifecycleActions({ experienceId, status, locale, copy }: LifecycleActionsProps) {
  const [publishState, publishAction] = useActionState(publishHostExperience, initialState);
  const [pauseState, pauseAction] = useActionState(pauseHostExperience, initialState);

  const publishMessage = errorMessage(publishState, copy);
  const pauseMessage = errorMessage(pauseState, copy);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {status === 'draft' && (
          <form action={publishAction}>
            <input type="hidden" name="experienceId" value={experienceId} />
            <input type="hidden" name="locale" value={locale} />
            <PublishSubmit label={copy.publish} pendingLabel={copy.publishPending} />
          </form>
        )}
        {status === 'changes_requested' && (
          <form action={publishAction}>
            <input type="hidden" name="experienceId" value={experienceId} />
            <input type="hidden" name="locale" value={locale} />
            <PublishSubmit label={copy.resubmit} pendingLabel={copy.publishPending} />
          </form>
        )}
        {status === 'pending_review' && (
          // No action — reviewer holds the next move. Show a passive
          // affordance so the host knows where things stand.
          <span className="text-sarat-black-600 text-sm">{copy.pendingReviewLabel}</span>
        )}
        {status === 'live' && (
          <form action={pauseAction}>
            <input type="hidden" name="experienceId" value={experienceId} />
            <input type="hidden" name="locale" value={locale} />
            <PauseSubmit label={copy.pause} pendingLabel={copy.pausePending} />
          </form>
        )}
        {status === 'paused' && (
          <form action={publishAction}>
            <input type="hidden" name="experienceId" value={experienceId} />
            <input type="hidden" name="locale" value={locale} />
            <PublishSubmit label={copy.republish} pendingLabel={copy.publishPending} />
          </form>
        )}
        {status === 'live' && (
          <Link
            href={`/${locale}/experiences`}
            className={cn(buttonVariants({ variant: 'secondary', size: 'md' }))}
          >
            {copy.viewPublic}
          </Link>
        )}
      </div>
      {(publishMessage || pauseMessage) && (
        <p role="alert" className="text-al-qatt-red-800 text-sm">
          {publishMessage || pauseMessage}
        </p>
      )}
    </div>
  );
}
