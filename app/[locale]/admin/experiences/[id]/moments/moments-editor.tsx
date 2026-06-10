'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  addMoment,
  updateMoment,
  deleteMoment,
  moveMoment,
  type MomentActionState,
} from '@/features/admin/experiences/moment-actions';
import type { AdminMoment } from '@/features/admin/experiences/queries';
import { MomentActionButton } from '@/app/[locale]/admin/experiences/[id]/moments/moment-action-button';

/** Server actions the editor drives — admin's by default, host's when passed in. */
export interface MomentActions {
  add: typeof addMoment;
  update: typeof updateMoment;
  remove: typeof deleteMoment;
  move: typeof moveMoment;
}

const ADMIN_ACTIONS: MomentActions = {
  add: addMoment,
  update: updateMoment,
  remove: deleteMoment,
  move: moveMoment,
};

export interface MomentsCopy {
  timeOfDay: string;
  titleEn: string;
  descriptionEn: string;
  titleAr: string;
  descriptionAr: string;
  arHint: string;
  /** Shown when a live/pending listing's timeline is locked (host editor). */
  lockedLive?: string;
  save: string;
  saving: string;
  add: string;
  adding: string;
  addHeading: string;
  moveUp: string;
  moveDown: string;
  moving: string;
  deleteLabel: string;
  deleting: string;
  deleteConfirm: string;
  fieldInvalid: string;
  error: string;
}

const TEXTAREA_CLASS = cn(
  'rounded-input border-sarat-black/20 bg-fog-white text-sarat-black w-full resize-y [border-width:0.5px] px-4 py-3 text-base',
  'placeholder:text-sarat-black-600',
);
const initialState: MomentActionState = { success: false };

function Saver({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="sm" pending={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

function actionError(state: MomentActionState, copy: MomentsCopy): string | undefined {
  if (state.success || !state.message) return undefined;
  if (state.message === 'validation') return copy.fieldInvalid;
  if (state.message === 'locked_live') return copy.lockedLive ?? copy.error;
  return copy.error;
}

function Fields({
  moment,
  copy,
  fields,
  hideArabic,
}: {
  moment?: AdminMoment;
  copy: MomentsCopy;
  fields: Record<string, string>;
  hideArabic?: boolean;
}) {
  const invalid = (name: string) => (fields[name] ? 'true' : undefined);
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          {copy.timeOfDay}
          <Input name="timeOfDay" defaultValue={moment?.timeOfDay ?? ''} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {copy.titleEn}
          <Input
            name="titleEn"
            defaultValue={moment?.titleEn ?? ''}
            aria-invalid={invalid('titleEn')}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium">
        {copy.descriptionEn}
        <textarea
          name="descriptionEn"
          rows={2}
          defaultValue={moment?.descriptionEn ?? ''}
          className={TEXTAREA_CLASS}
          aria-invalid={invalid('descriptionEn')}
        />
      </label>
      {!hideArabic && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-medium">
              {copy.titleAr}
              <Input name="titleAr" dir="rtl" defaultValue={momentArTitle(moment)} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              {copy.descriptionAr}
              <textarea
                name="descriptionAr"
                rows={2}
                dir="rtl"
                defaultValue={momentArDesc(moment)}
                className={TEXTAREA_CLASS}
              />
            </label>
          </div>
          <p className="text-sarat-black/40 text-xs">{copy.arHint}</p>
        </>
      )}
    </>
  );
}

/** Don't echo the TODO placeholder back into the editable Arabic field. */
function momentArTitle(moment?: AdminMoment): string {
  const v = moment?.titleAr ?? '';
  return v.startsWith('TODO(ar):') ? '' : v;
}
function momentArDesc(moment?: AdminMoment): string {
  const v = moment?.descriptionAr ?? '';
  return v.startsWith('TODO(ar):') ? '' : v;
}

export function MomentCard({
  moment,
  experienceId,
  index,
  isFirst,
  isLast,
  copy,
  actions = ADMIN_ACTIONS,
  hideArabic,
}: {
  moment: AdminMoment;
  experienceId: string;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  copy: MomentsCopy;
  actions?: MomentActions;
  hideArabic?: boolean;
}) {
  const [state, action] = useActionState(actions.update, initialState);
  const fields = state.fields ?? {};
  const error = actionError(state, copy);
  return (
    <li className="border-sarat-black/8 rounded-card flex flex-col gap-4 [border-width:0.5px] p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sarat-black-600 text-sm font-medium">{index + 1}</span>
        <div className="flex items-center gap-2">
          <MomentActionButton
            action={actions.move}
            hidden={{ momentId: moment.id, experienceId, direction: 'up' }}
            label={copy.moveUp}
            pendingLabel={copy.moving}
            disabled={isFirst}
          />
          <MomentActionButton
            action={actions.move}
            hidden={{ momentId: moment.id, experienceId, direction: 'down' }}
            label={copy.moveDown}
            pendingLabel={copy.moving}
            disabled={isLast}
          />
          <MomentActionButton
            action={actions.remove}
            hidden={{ momentId: moment.id, experienceId }}
            label={copy.deleteLabel}
            pendingLabel={copy.deleting}
            confirm={copy.deleteConfirm}
          />
        </div>
      </div>
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="momentId" value={moment.id} />
        <input type="hidden" name="experienceId" value={experienceId} />
        <Fields moment={moment} copy={copy} fields={fields} hideArabic={hideArabic} />
        <div className="flex items-center gap-3">
          <Saver label={copy.save} pendingLabel={copy.saving} />
          {error && (
            <span role="alert" className="text-al-qatt-red-800 text-sm">
              {error}
            </span>
          )}
        </div>
      </form>
    </li>
  );
}

export function AddMomentForm({
  experienceId,
  copy,
  actions = ADMIN_ACTIONS,
  hideArabic,
}: {
  experienceId: string;
  copy: MomentsCopy;
  actions?: MomentActions;
  hideArabic?: boolean;
}) {
  const [state, action] = useActionState(actions.add, initialState);
  const fields = state.fields ?? {};
  const formRef = useRef<HTMLFormElement>(null);
  const error = actionError(state, copy);

  // Clear the inputs after a successful add so the next moment starts blank.
  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <form
      ref={formRef}
      action={action}
      className="border-sarat-black/8 rounded-card flex flex-col gap-4 [border-width:0.5px] p-6"
    >
      <h2 className="font-display text-xl font-medium tracking-[-0.02em]">{copy.addHeading}</h2>
      <input type="hidden" name="experienceId" value={experienceId} />
      <Fields copy={copy} fields={fields} hideArabic={hideArabic} />
      <div className="flex items-center gap-3">
        <Saver label={copy.add} pendingLabel={copy.adding} />
        {error && (
          <span role="alert" className="text-al-qatt-red-800 text-sm">
            {error}
          </span>
        )}
      </div>
    </form>
  );
}
