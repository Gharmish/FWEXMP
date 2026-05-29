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

export interface MomentsCopy {
  timeOfDay: string;
  titleEn: string;
  descriptionEn: string;
  titleAr: string;
  descriptionAr: string;
  arHint: string;
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
    <Button type="submit" variant="primary" size="sm" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

function Fields({
  moment,
  copy,
  fields,
}: {
  moment?: AdminMoment;
  copy: MomentsCopy;
  fields: Record<string, string>;
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
}: {
  moment: AdminMoment;
  experienceId: string;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  copy: MomentsCopy;
}) {
  const [state, action] = useActionState(updateMoment, initialState);
  const fields = state.fields ?? {};
  return (
    <li className="border-sarat-black/8 rounded-card flex flex-col gap-4 [border-width:0.5px] p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sarat-black-600 text-sm font-medium">{index + 1}</span>
        <div className="flex items-center gap-2">
          <MomentActionButton
            action={moveMoment}
            hidden={{ momentId: moment.id, experienceId, direction: 'up' }}
            label={copy.moveUp}
            pendingLabel={copy.moving}
            disabled={isFirst}
          />
          <MomentActionButton
            action={moveMoment}
            hidden={{ momentId: moment.id, experienceId, direction: 'down' }}
            label={copy.moveDown}
            pendingLabel={copy.moving}
            disabled={isLast}
          />
          <MomentActionButton
            action={deleteMoment}
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
        <Fields moment={moment} copy={copy} fields={fields} />
        <div className="flex items-center gap-3">
          <Saver label={copy.save} pendingLabel={copy.saving} />
          {!state.success && state.message && (
            <span role="alert" className="text-al-qatt-red-800 text-sm">
              {state.message === 'validation' ? copy.fieldInvalid : copy.error}
            </span>
          )}
        </div>
      </form>
    </li>
  );
}

export function AddMomentForm({ experienceId, copy }: { experienceId: string; copy: MomentsCopy }) {
  const [state, action] = useActionState(addMoment, initialState);
  const fields = state.fields ?? {};
  const formRef = useRef<HTMLFormElement>(null);

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
      <Fields copy={copy} fields={fields} />
      <div className="flex items-center gap-3">
        <Saver label={copy.add} pendingLabel={copy.adding} />
        {!state.success && state.message && (
          <span role="alert" className="text-al-qatt-red-800 text-sm">
            {state.message === 'validation' ? copy.fieldInvalid : copy.error}
          </span>
        )}
      </div>
    </form>
  );
}
