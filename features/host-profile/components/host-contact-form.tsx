'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { Locale } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { updateHostContact } from '@/features/host-profile/actions';
import type { HostContactFormState } from '@/features/host-profile/types';

interface HostContactFormProps {
  locale: Locale;
  contact: { contactPhone: string; contactEmail: string };
  copy: {
    phoneLabel: string;
    phoneHint: string;
    phonePlaceholder: string;
    countryLabel: string;
    emailLabel: string;
    emailHint: string;
    submit: string;
    submitting: string;
    saved: string;
    phoneError: string;
    emailError: string;
    errors: Record<'no_db' | 'no_auth' | 'validation' | 'server', string>;
  };
}

const initialState: HostContactFormState = { status: 'idle' };

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="md" pending={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

/**
 * Where the host's notifications go (2026-08-22 audit P2-10). Failure
 * states echo `values` so a server error never wipes the fields.
 */
export function HostContactForm({ locale, contact, copy }: HostContactFormProps) {
  const [state, action] = useActionState(updateHostContact, initialState);
  const values = state.status === 'error' && state.values ? state.values : contact;
  const fieldError = (key: 'contactPhone' | 'contactEmail') =>
    state.status === 'error' && state.fields?.[key] ? true : false;

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-2">
        <label htmlFor="host-contact-phone" className="text-sm font-medium">
          {copy.phoneLabel}
        </label>
        <PhoneInput
          id="host-contact-phone"
          name="contactPhone"
          locale={locale}
          defaultValue={values.contactPhone}
          required
          placeholder={copy.phonePlaceholder}
          countryLabel={copy.countryLabel}
          invalid={fieldError('contactPhone')}
          aria-describedby="host-contact-phone-hint"
        />
        <p id="host-contact-phone-hint" className="text-sarat-black-600 text-sm">
          {copy.phoneHint}
        </p>
        {fieldError('contactPhone') && (
          <p role="alert" className="text-al-qatt-red-800 text-sm">
            {copy.phoneError}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="host-contact-email" className="text-sm font-medium">
          {copy.emailLabel}
        </label>
        <Input
          id="host-contact-email"
          name="contactEmail"
          type="email"
          autoComplete="email"
          dir="ltr"
          required
          defaultValue={values.contactEmail}
          aria-invalid={fieldError('contactEmail') || undefined}
          aria-describedby="host-contact-email-hint"
        />
        <p id="host-contact-email-hint" className="text-sarat-black-600 text-sm">
          {copy.emailHint}
        </p>
        {fieldError('contactEmail') && (
          <p role="alert" className="text-al-qatt-red-800 text-sm">
            {copy.emailError}
          </p>
        )}
      </div>
      {state.status === 'error' && state.message !== 'validation' && (
        <p role="alert" className="text-al-qatt-red-800 text-sm">
          {copy.errors[state.message]}
        </p>
      )}
      {state.status === 'success' && (
        <p role="status" className="text-juniper-green text-sm font-medium">
          {copy.saved}
        </p>
      )}
      <div>
        <Submit label={copy.submit} pendingLabel={copy.submitting} />
      </div>
    </form>
  );
}
