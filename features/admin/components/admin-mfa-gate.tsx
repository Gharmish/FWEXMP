'use client';

import Image from 'next/image';
import { useActionState, useEffect, useId, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  startAdminMfaEnrollment,
  verifyAdminMfa,
  type MfaEnrollState,
  type MfaVerifyState,
} from '@/features/admin/mfa-actions';

/**
 * Second-factor screen, rendered by the admin layout IN PLACE of the
 * admin app whenever the session hasn't reached aal2 (2026-08-02
 * security audit).
 *
 * Rendering instead of redirecting is deliberate: every admin page nests
 * under that layout, so there is no route to forget to protect and no
 * "exempt path" list to get wrong. The only way past this component is a
 * verified TOTP code, which upgrades the session server-side.
 *
 * Two modes — `enroll` walks a first-time admin through adding a factor;
 * `verify` challenges an admin who already has one.
 */
export interface AdminMfaGateProps {
  mode: 'enroll' | 'verify';
}

const verifyInitial: MfaVerifyState = { status: 'idle' };

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="lg" pending={pending} className="w-full">
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function AdminMfaGate({ mode }: AdminMfaGateProps) {
  const t = useTranslations('adminMfa');
  const [enroll, setEnroll] = useState<MfaEnrollState>({ status: 'idle' });
  const [starting, startEnrollment] = useTransition();
  const [verify, verifyAction] = useActionState(verifyAdminMfa, verifyInitial);
  const codeId = useId();

  // Kick off enrolment as soon as the screen mounts in enroll mode: the
  // admin has nothing to decide first, and the QR is the whole point.
  useEffect(() => {
    if (mode !== 'enroll' || enroll.status !== 'idle' || starting) return;
    startEnrollment(async () => setEnroll(await startAdminMfaEnrollment()));
  }, [mode, enroll.status, starting, startEnrollment]);

  const errorMessage = (() => {
    if (verify.status === 'error' && verify.error) return t(`errors.${verify.error}`);
    if (enroll.status === 'error' && enroll.error) return t(`errors.${enroll.error}`);
    return undefined;
  })();

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-8 py-16">
      <header className="flex flex-col gap-3">
        <span className="bg-saffron-gold-100 text-saffron-gold-800 flex size-11 items-center justify-center rounded-full">
          <ShieldCheck className="size-5" aria-hidden />
        </span>
        <h1 className="font-display text-2xl font-medium tracking-[-0.025em]">
          {mode === 'enroll' ? t('enroll.title') : t('verify.title')}
        </h1>
        <p className="text-sarat-black-600 text-base leading-relaxed">
          {mode === 'enroll' ? t('enroll.intro') : t('verify.intro')}
        </p>
      </header>

      {mode === 'enroll' && (
        <section className="border-sarat-black/8 rounded-card flex flex-col gap-5 [border-width:0.5px] p-6">
          <ol className="text-sarat-black-600 flex list-decimal flex-col gap-2 ps-5 text-sm leading-relaxed">
            <li>{t('enroll.step1')}</li>
            <li>{t('enroll.step2')}</li>
            <li>{t('enroll.step3')}</li>
          </ol>

          {enroll.status === 'ready' && enroll.qrCode && (
            <div className="flex flex-col items-center gap-4">
              <Image
                src={enroll.qrCode}
                alt={t('enroll.qrAlt')}
                width={200}
                height={200}
                unoptimized
                className="rounded-image size-50 bg-white"
              />
              <div className="flex w-full flex-col gap-1">
                <span className="text-sarat-black-600 text-sm">{t('enroll.secretLabel')}</span>
                <code
                  dir="ltr"
                  className="bg-mist rounded-input px-3 py-2 text-center font-mono text-sm break-all"
                >
                  {enroll.secret}
                </code>
              </div>
            </div>
          )}

          {starting && enroll.status === 'idle' && (
            <p className="text-sarat-black-600 text-sm">{t('enroll.preparing')}</p>
          )}
        </section>
      )}

      {/* The code form drives both modes — `verifyAdminMfa` completes a
          fresh enrolment and challenges an existing factor alike. */}
      {(mode === 'verify' || enroll.status === 'ready') && (
        <form action={verifyAction} className="flex flex-col gap-4">
          <label htmlFor={codeId} className="text-sm font-medium">
            {t('codeLabel')}
          </label>
          <Input
            id={codeId}
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            required
            autoFocus
            dir="ltr"
            className="text-center text-lg tracking-[0.4em]"
            aria-describedby={errorMessage ? `${codeId}-error` : undefined}
            aria-invalid={errorMessage ? true : undefined}
          />
          <SubmitButton label={t('submit')} pendingLabel={t('submitting')} />
        </form>
      )}

      {errorMessage && (
        <p id={`${codeId}-error`} role="alert" className="text-al-qatt-red-800 text-sm">
          {errorMessage}
        </p>
      )}

      <p className="text-sarat-black-600 text-sm leading-relaxed">{t('footnote')}</p>
    </div>
  );
}
