'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button, buttonVariants } from '@/components/ui/button';
import { ConfirmSubmit } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';
import { fillTemplate } from '@/lib/fill-template';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import {
  deleteDraftExperience,
  duplicateHostExperience,
  publishHostExperience,
  pauseHostExperience,
  type HostExperienceState,
} from '@/features/host-experiences/actions';
import type { ReadinessKey } from '@/features/host-experiences/lib/readiness';

type ErrorKey =
  | 'cannot_publish'
  | 'needs_hero'
  | 'not_found'
  | 'forbidden'
  | 'no_db'
  | 'server'
  | 'validation'
  | 'wrong_state'
  | 'has_bookings'
  | 'suspended';

interface LifecycleCopy {
  /** Default "Submit for review" label. */
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
  duplicate: string;
  duplicatePending: string;
  deleteDraft: string;
  deleteDraftPending: string;
  deleteConfirmTitle: string;
  deleteConfirmDescription: string;
  /** "Finish {item} to submit" template — the first unmet checklist item. */
  blockedBy: string;
  /** Checklist item labels, for the blocked-by line. */
  readiness: Record<ReadinessKey, string>;
  errors: Record<ErrorKey, string>;
}

export interface LifecycleActionsProps {
  experienceId: string;
  slug: string;
  status: 'draft' | 'pending_review' | 'changes_requested' | 'live' | 'paused' | 'archived';
  /** Unmet required readiness items — non-empty disables submit. */
  blockers: readonly ReadinessKey[];
  locale: Locale;
  copy: LifecycleCopy;
}

const initialState: HostExperienceState = { success: false };

function PendingButton({
  label,
  pendingLabel,
  variant,
  disabled,
}: {
  label: string;
  pendingLabel: string;
  variant: 'primary' | 'secondary';
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size="md" pending={pending} disabled={disabled}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

function errorMessage(state: HostExperienceState, copy: LifecycleCopy): string | undefined {
  if (!state.message) return undefined;
  if (state.message === 'cannot_publish' && state.blockers?.[0]) {
    return fillTemplate(copy.blockedBy, { item: copy.readiness[state.blockers[0]] });
  }
  const key = state.message as ErrorKey;
  return key in copy.errors ? copy.errors[key] : copy.errors.server;
}

export function LifecycleActions({
  experienceId,
  slug,
  status,
  blockers,
  locale,
  copy,
}: LifecycleActionsProps) {
  const [publishState, publishAction] = useActionState(publishHostExperience, initialState);
  const [pauseState, pauseAction] = useActionState(pauseHostExperience, initialState);
  const [duplicateState, duplicateAction] = useActionState(duplicateHostExperience, initialState);
  const [deleteState, deleteAction] = useActionState(deleteDraftExperience, initialState);

  const message =
    errorMessage(publishState, copy) ??
    errorMessage(pauseState, copy) ??
    errorMessage(duplicateState, copy) ??
    errorMessage(deleteState, copy);

  const hidden = (
    <>
      <input type="hidden" name="experienceId" value={experienceId} />
      <input type="hidden" name="locale" value={locale} />
    </>
  );

  // Submit is blocked (not hidden) while the checklist has gaps — the
  // host sees the button, the first gap, and the checklist above it.
  const blocked = blockers.length > 0;
  const submitLabel =
    status === 'changes_requested'
      ? copy.resubmit
      : status === 'paused'
        ? copy.republish
        : copy.publish;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {(status === 'draft' || status === 'changes_requested' || status === 'paused') && (
          <form action={publishAction}>
            {hidden}
            <PendingButton
              label={submitLabel}
              pendingLabel={copy.publishPending}
              variant="primary"
              disabled={blocked}
            />
          </form>
        )}
        {status === 'pending_review' && (
          // No action — reviewer holds the next move. Show a passive
          // affordance so the host knows where things stand.
          <span className="text-sarat-black-600 inline-flex min-h-11 items-center text-sm">
            {copy.pendingReviewLabel}
          </span>
        )}
        {status === 'live' && (
          <>
            <Link
              href={`/experiences/${slug}`}
              className={cn(buttonVariants({ variant: 'primary', size: 'md' }))}
            >
              {copy.viewPublic}
            </Link>
            <form action={pauseAction}>
              {hidden}
              <PendingButton
                label={copy.pause}
                pendingLabel={copy.pausePending}
                variant="secondary"
              />
            </form>
          </>
        )}
        {status !== 'archived' && (
          <form action={duplicateAction}>
            {hidden}
            <PendingButton
              label={copy.duplicate}
              pendingLabel={copy.duplicatePending}
              variant="secondary"
            />
          </form>
        )}
        {status === 'draft' && (
          <form action={deleteAction}>
            {hidden}
            <ConfirmSubmit
              title={copy.deleteConfirmTitle}
              description={copy.deleteConfirmDescription}
              confirmLabel={copy.deleteDraft}
              pendingLabel={copy.deleteDraftPending}
              destructive
              variant="secondary"
              size="md"
              className="border-al-qatt-red/40 text-al-qatt-red-800"
            >
              {copy.deleteDraft}
            </ConfirmSubmit>
          </form>
        )}
      </div>
      {blocked && !message && (
        <p className="text-sarat-black-600 text-sm">
          {fillTemplate(copy.blockedBy, { item: copy.readiness[blockers[0]] })}
        </p>
      )}
      {message && (
        <p role="alert" className="text-al-qatt-red-800 text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
