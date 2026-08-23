'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { updateHostNotificationPrefs } from '@/features/host-profile/actions';
import type { HostNotificationPrefs } from '@/features/host-dashboard/queries';
import type { HostNotificationPrefsState } from '@/features/host-profile/types';

export interface HostNotificationPrefsCopy {
  channelsTitle: string;
  channelsHint: string;
  email: string;
  emailHint: string;
  whatsapp: string;
  whatsappHint: string;
  whatsappNoPhone: string;
  emailNoEmail: string;
  lastChannel: string;
  categoriesTitle: string;
  categoriesHint: string;
  reminders: string;
  remindersHint: string;
  reviews: string;
  reviewsHint: string;
  submit: string;
  submitting: string;
  saved: string;
  errors: Record<
    'no_db' | 'no_auth' | 'validation' | 'server' | 'channel_required' | 'channel_unreachable',
    string
  >;
}

interface HostNotificationPrefsFormProps {
  prefs: HostNotificationPrefs;
  /** Which channels actually have an address on file — a toggle for a missing address is moot. */
  hasEmail: boolean;
  hasPhone: boolean;
  copy: HostNotificationPrefsCopy;
}

const initialState: HostNotificationPrefsState = { status: 'idle' };

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="md" pending={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

function Toggle({
  name,
  label,
  hint,
  checked,
  onChange,
}: {
  name: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="border-sarat-black/40 accent-sarat-black mt-1 size-5 shrink-0"
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-base">{label}</span>
        <span className="text-sarat-black-600 text-sm">{hint}</span>
      </span>
    </label>
  );
}

/**
 * Notification preferences (2026-08-22): two channels (at least one stays
 * on — the form refuses to uncheck the last one) and two optional
 * categories. Controlled so the "last channel" rule reads instantly.
 */
export function HostNotificationPrefsForm({
  prefs,
  hasEmail,
  hasPhone,
  copy,
}: HostNotificationPrefsFormProps) {
  const [state, action] = useActionState(updateHostNotificationPrefs, initialState);
  const initial = state.status === 'error' && state.values ? state.values : prefs;
  const [email, setEmail] = useState(initial.email);
  const [whatsapp, setWhatsapp] = useState(initial.whatsapp);
  const [reminders, setReminders] = useState(initial.reminders);
  const [reviews, setReviews] = useState(initial.reviews);
  const [lastChannelNudge, setLastChannelNudge] = useState(false);
  // Never let the last channel be unchecked (a disabled box wouldn't
  // post, which would read as "off" server-side) — refuse and explain.
  const toggleChannel = (which: 'email' | 'whatsapp') => (next: boolean) => {
    // The other channel only counts if it can actually reach the host.
    const other = which === 'email' ? whatsapp && hasPhone : email && hasEmail;
    if (!next && !other) {
      setLastChannelNudge(true);
      return;
    }
    setLastChannelNudge(false);
    (which === 'email' ? setEmail : setWhatsapp)(next);
  };

  return (
    <form action={action} className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-2">
        <legend className="flex flex-col gap-1">
          <span className="text-base font-medium">{copy.channelsTitle}</span>
          <span className="text-sarat-black-600 text-sm">{copy.channelsHint}</span>
        </legend>
        <Toggle
          name="whatsapp"
          label={copy.whatsapp}
          hint={hasPhone ? copy.whatsappHint : copy.whatsappNoPhone}
          checked={whatsapp}
          onChange={toggleChannel('whatsapp')}
        />
        <Toggle
          name="email"
          label={copy.email}
          hint={hasEmail ? copy.emailHint : copy.emailNoEmail}
          checked={email}
          onChange={toggleChannel('email')}
        />
        <p role="status" aria-live="polite" className="text-sarat-black-600 ps-8 text-sm">
          {lastChannelNudge ? copy.lastChannel : undefined}
        </p>
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="flex flex-col gap-1">
          <span className="text-base font-medium">{copy.categoriesTitle}</span>
          <span className="text-sarat-black-600 text-sm">{copy.categoriesHint}</span>
        </legend>
        <Toggle
          name="reminders"
          label={copy.reminders}
          hint={copy.remindersHint}
          checked={reminders}
          onChange={setReminders}
        />
        <Toggle
          name="reviews"
          label={copy.reviews}
          hint={copy.reviewsHint}
          checked={reviews}
          onChange={setReviews}
        />
      </fieldset>
      {/* Persistent live regions — present from first paint so readers announce changes. */}
      <p role="alert" aria-live="assertive" className="text-al-qatt-red-800 text-sm">
        {state.status === 'error' ? copy.errors[state.message] : undefined}
      </p>
      <p role="status" aria-live="polite" className="text-juniper-green text-sm font-medium">
        {state.status === 'success' ? copy.saved : undefined}
      </p>
      <div>
        <Submit label={copy.submit} pendingLabel={copy.submitting} />
      </div>
    </form>
  );
}
