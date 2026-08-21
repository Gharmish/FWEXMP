'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import {
  replyToConversation,
  setConversationState,
  type SupportActionState,
} from '@/features/support/actions';

type ErrorKey = NonNullable<Extract<SupportActionState, { success: false }>['message']>;

interface Copy {
  replyLabel: string;
  replyPlaceholder: string;
  send: string;
  sending: string;
  windowClosedNote: string;
  close: string;
  reopen: string;
  closePending: string;
  reopenPending: string;
  toBot: string;
  toBotPending: string;
  errors: Record<ErrorKey, string>;
}

export interface ReplyFormProps {
  conversationId: string;
  windowOpen: boolean;
  state: 'bot' | 'human' | 'closed';
  /** Reply textarea direction follows the guest's language, not the admin UI. */
  guestDir: 'rtl' | 'ltr';
  /** The Claude agent is configured — offer "hand back to assistant". */
  agentAvailable: boolean;
  copy: Copy;
}

const initial: SupportActionState = { success: false };

export function ReplyForm({
  conversationId,
  windowOpen,
  state,
  guestDir,
  agentAvailable,
  copy,
}: ReplyFormProps) {
  const [replyState, replyAction, replyPending] = useActionState(replyToConversation, initial);
  const [stateState, stateAction, statePending] = useActionState(setConversationState, initial);
  const [botState, botAction, botPending] = useActionState(setConversationState, initial);

  const replyError =
    !replyState.success && replyState.message ? copy.errors[replyState.message] : undefined;
  const stateError =
    !stateState.success && stateState.message ? copy.errors[stateState.message] : undefined;
  const nextState = state === 'closed' ? 'human' : 'closed';

  return (
    <div className="flex flex-col gap-6">
      {windowOpen ? (
        <form action={replyAction} className="flex flex-col gap-3">
          <input type="hidden" name="conversationId" value={conversationId} />
          <label htmlFor="support-reply" className="text-sm font-medium">
            {copy.replyLabel}
          </label>
          <textarea
            id="support-reply"
            name="body"
            rows={4}
            maxLength={4096}
            required
            dir={guestDir}
            placeholder={copy.replyPlaceholder}
            // Echo the draft back on failure — React resets uncontrolled inputs.
            defaultValue={!replyState.success ? replyState.values?.body : ''}
            key={replyState.success ? 'sent' : 'draft'}
            className="rounded-input border-sarat-black/20 text-sarat-black focus-visible:border-saffron-gold w-full [border-width:0.5px] bg-white p-3 text-base leading-relaxed outline-none"
          />
          {replyError && (
            <p role="alert" className="text-al-qatt-red-800 text-sm">
              {replyError}
            </p>
          )}
          <div>
            <Button type="submit" variant="primary" size="sm" disabled={replyPending}>
              {replyPending ? copy.sending : copy.send}
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-sarat-black-600 border-sarat-black/8 rounded-input bg-mist max-w-2xl [border-width:0.5px] p-4 text-sm leading-relaxed">
          {copy.windowClosedNote}
        </p>
      )}

      {agentAvailable && state === 'human' && (
        <form action={botAction} className="flex flex-col gap-2">
          <input type="hidden" name="conversationId" value={conversationId} />
          <input type="hidden" name="state" value="bot" />
          {!botState.success && botState.message && (
            <p role="alert" className="text-al-qatt-red-800 text-sm">
              {copy.errors[botState.message]}
            </p>
          )}
          <div>
            <Button type="submit" variant="secondary" size="sm" disabled={botPending}>
              {botPending ? copy.toBotPending : copy.toBot}
            </Button>
          </div>
        </form>
      )}

      <form action={stateAction} className="flex flex-col gap-2">
        <input type="hidden" name="conversationId" value={conversationId} />
        <input type="hidden" name="state" value={nextState} />
        {stateError && (
          <p role="alert" className="text-al-qatt-red-800 text-sm">
            {stateError}
          </p>
        )}
        <div>
          <Button type="submit" variant="secondary" size="sm" disabled={statePending}>
            {statePending
              ? nextState === 'closed'
                ? copy.closePending
                : copy.reopenPending
              : nextState === 'closed'
                ? copy.close
                : copy.reopen}
          </Button>
        </div>
      </form>
    </div>
  );
}
