'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { hasSupabaseAuth, stubAuthAllowed } from '@/lib/env';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from '@/lib/i18n';
import { reportError } from '@/lib/log';
import {
  requestOtpSchema,
  verifyOtpSchema,
  requestEmailOtpSchema,
  verifyEmailOtpSchema,
} from '@/features/auth/schemas';
import {
  STUB_OTP,
  STUB_SESSION_COOKIE,
  STUB_SESSION_MAX_AGE_SECONDS,
  stubEmailCookieValue,
} from '@/features/auth/lib/stub-session';
import {
  OTP_COOLDOWN_COOKIE,
  OTP_COOLDOWN_SECONDS,
  cooldownRemainingSeconds,
} from '@/features/auth/lib/otp-cooldown';

/**
 * Sign-in flow. Two server actions, one per form step.
 *
 * Step 1: `requestOtp` — validate the phone, ask Supabase (or the
 *   stub) to send a 6-digit code, return state that drives the OTP
 *   form. No redirect: the same page swaps from phone step to OTP
 *   step based on `state.stage`.
 *
 * Step 2: `verifyOtp` — validate the code, swap it for a session,
 *   redirect to `next`. On failure, return state so the OTP input
 *   re-renders with an error.
 *
 * Step 3 (separate): `signOut` — clear the session, send the user
 *   to the localised home page.
 *
 * Error shapes mirror the booking form pattern: a discriminated
 * `success: false` object with optional `fields` and `message`. The
 * success path on `verifyOtp` throws `redirect()` before returning,
 * so observable state is always failure.
 */

export type AuthFieldName = 'phone' | 'email' | 'code';
export type AuthMethod = 'phone' | 'email';

interface AuthFailure {
  success: false;
  stage: 'phone' | 'code';
  /** Which identifier the user is signing in with. */
  method: AuthMethod;
  message?: 'validation' | 'rate_limited' | 'invalid_code' | 'expired' | 'server';
  fields?: Partial<Record<AuthFieldName, string>>;
  /** Echoed back so the form can preserve the entered identifier across the step transition. */
  phone?: string;
  email?: string;
}

export type RequestOtpState =
  | AuthFailure
  | { success: true; stage: 'code'; method: AuthMethod; phone?: string; email?: string };
export type VerifyOtpState = AuthFailure;

function methodFrom(formData: FormData): AuthMethod {
  return formValue(formData, 'method') === 'email' ? 'email' : 'phone';
}

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

// ---------- step 1: request OTP ----------

/**
 * App-layer send cooldown (30s per browser). Supabase's provider rate
 * limits stay the real backstop; this stops double-clicks and naive
 * scripted abuse before they reach the provider at all.
 */
async function otpCooldownActive(): Promise<boolean> {
  const store = await cookies();
  return cooldownRemainingSeconds(store.get(OTP_COOLDOWN_COOKIE)?.value, Date.now()) > 0;
}

async function stampOtpCooldown(): Promise<void> {
  const store = await cookies();
  store.set(OTP_COOLDOWN_COOKIE, String(Date.now()), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: OTP_COOLDOWN_SECONDS,
  });
}

export async function requestOtp(
  _previous: RequestOtpState,
  formData: FormData,
): Promise<RequestOtpState> {
  const method = methodFrom(formData);

  // ----- email branch (BRIEF §5; no paid SMS provider needed) -----
  if (method === 'email') {
    const parsed = requestEmailOtpSchema.safeParse({
      email: formValue(formData, 'email'),
      locale: formValue(formData, 'locale'),
      next: formValue(formData, 'next') || '/me',
    });
    if (!parsed.success) {
      return {
        success: false,
        stage: 'phone',
        method,
        message: 'validation',
        fields: { email: 'invalid_email' },
        email: formValue(formData, 'email'),
      };
    }
    const { email } = parsed.data;

    if (await otpCooldownActive()) {
      return { success: false, stage: 'phone', method, message: 'rate_limited', email };
    }

    if (stubAuthAllowed()) {
      reportError(new Error(`[auth:stub] OTP requested for ${email} — use ${STUB_OTP}`), {
        surface: 'auth:stub:requestOtp',
        email,
      });
      await stampOtpCooldown();
      return { success: true, stage: 'code', method, email };
    }

    try {
      const supabase = await getSupabaseServerClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      });
      if (error) {
        reportError(error, {
          surface: 'auth:requestOtp:supabaseError',
          email,
          status: error.status,
          code: error.code,
          name: error.name,
        });
        const message: AuthFailure['message'] = error.status === 429 ? 'rate_limited' : 'server';
        return { success: false, stage: 'phone', method, message, email };
      }
    } catch (error) {
      reportError(error, { surface: 'auth:requestOtp', email });
      return { success: false, stage: 'phone', method, message: 'server', email };
    }
    await stampOtpCooldown();
    return { success: true, stage: 'code', method, email };
  }

  // ----- phone branch (default) -----
  const parsed = requestOtpSchema.safeParse({
    phone: formValue(formData, 'phone'),
    locale: formValue(formData, 'locale'),
    next: formValue(formData, 'next') || '/me',
  });

  if (!parsed.success) {
    const fields: AuthFailure['fields'] = {};
    for (const issue of parsed.error.issues) {
      if (issue.path[0] === 'phone') fields.phone = 'invalid_phone';
    }
    return {
      success: false,
      stage: 'phone',
      method,
      message: 'validation',
      fields,
      phone: formValue(formData, 'phone'),
    };
  }

  const { phone } = parsed.data;

  if (await otpCooldownActive()) {
    return { success: false, stage: 'phone', method, message: 'rate_limited', phone };
  }

  if (stubAuthAllowed()) {
    // Stub path: pretend we sent an SMS. The verify step accepts
    // STUB_OTP. We deliberately leave a console trace via reportError
    // so anyone driving the flow can see the code that "would have"
    // been sent.
    reportError(new Error(`[auth:stub] OTP requested for ${phone} — use ${STUB_OTP}`), {
      surface: 'auth:stub:requestOtp',
      phone,
    });
    await stampOtpCooldown();
    return { success: true, stage: 'code', method, phone };
  }

  try {
    const supabase = await getSupabaseServerClient();
    const { error } = await supabase.auth.signInWithOtp({ phone });
    if (error) {
      // Log the underlying reason so dev mode actually tells you what
      // went wrong (the client only sees a generic 'server' code).
      // Common gotcha: a fresh Supabase project has no SMS provider
      // configured — `error_code: phone_provider_disabled`.
      reportError(error, {
        surface: 'auth:requestOtp:supabaseError',
        phone,
        status: error.status,
        code: error.code,
        name: error.name,
      });
      // Supabase returns a friendly status code for rate limiting; surface
      // it so the UI can show the right copy.
      const message: AuthFailure['message'] = error.status === 429 ? 'rate_limited' : 'server';
      return { success: false, stage: 'phone', method, message, phone };
    }
  } catch (error) {
    reportError(error, { surface: 'auth:requestOtp', phone });
    return { success: false, stage: 'phone', method, message: 'server', phone };
  }

  await stampOtpCooldown();
  return { success: true, stage: 'code', method, phone };
}

// ---------- step 2: verify OTP ----------

export async function verifyOtp(
  _previous: VerifyOtpState,
  formData: FormData,
): Promise<VerifyOtpState> {
  const method = methodFrom(formData);

  // ----- email branch -----
  if (method === 'email') {
    const parsed = verifyEmailOtpSchema.safeParse({
      email: formValue(formData, 'email'),
      code: formValue(formData, 'code'),
      locale: formValue(formData, 'locale'),
      next: formValue(formData, 'next') || '/me',
    });
    if (!parsed.success) {
      const fields: AuthFailure['fields'] = {};
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === 'code') fields.code = 'invalid_code';
        if (issue.path[0] === 'email') fields.email = 'invalid_email';
      }
      return {
        success: false,
        stage: 'code',
        method,
        message: 'validation',
        fields,
        email: formValue(formData, 'email'),
      };
    }
    const { email, code, locale, next } = parsed.data;

    if (stubAuthAllowed()) {
      if (code !== STUB_OTP) {
        return {
          success: false,
          stage: 'code',
          method,
          message: 'invalid_code',
          fields: { code: 'invalid_code' },
          email,
        };
      }
      const store = await cookies();
      store.set(STUB_SESSION_COOKIE, stubEmailCookieValue(email), {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: STUB_SESSION_MAX_AGE_SECONDS,
      });
      revalidatePath('/[locale]', 'layout');
      redirect({ href: next, locale });
    }

    try {
      const supabase = await getSupabaseServerClient();
      const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
      if (error || !data.session) {
        const message: AuthFailure['message'] =
          error?.status === 410 || error?.status === 401 ? 'invalid_code' : 'server';
        return {
          success: false,
          stage: 'code',
          method,
          message,
          fields: message === 'invalid_code' ? { code: 'invalid_code' } : undefined,
          email,
        };
      }
    } catch (error) {
      reportError(error, { surface: 'auth:verifyOtp', email });
      return { success: false, stage: 'code', method, message: 'server', email };
    }

    revalidatePath('/[locale]', 'layout');
    redirect({ href: next, locale });
  }

  // ----- phone branch (default) -----
  const parsed = verifyOtpSchema.safeParse({
    phone: formValue(formData, 'phone'),
    code: formValue(formData, 'code'),
    locale: formValue(formData, 'locale'),
    next: formValue(formData, 'next') || '/me',
  });

  if (!parsed.success) {
    const fields: AuthFailure['fields'] = {};
    for (const issue of parsed.error.issues) {
      if (issue.path[0] === 'code') fields.code = 'invalid_code';
      if (issue.path[0] === 'phone') fields.phone = 'invalid_phone';
    }
    return {
      success: false,
      stage: 'code',
      method,
      message: 'validation',
      fields,
      phone: formValue(formData, 'phone'),
    };
  }

  const { phone, code, locale, next } = parsed.data;

  if (stubAuthAllowed()) {
    if (code !== STUB_OTP) {
      return {
        success: false,
        stage: 'code',
        method,
        message: 'invalid_code',
        fields: { code: 'invalid_code' },
        phone,
      };
    }
    // Mint a stub session: the phone is the cookie value, the stub
    // user id is derived from it deterministically (see stub-session.ts).
    const store = await cookies();
    store.set(STUB_SESSION_COOKIE, phone, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: STUB_SESSION_MAX_AGE_SECONDS,
    });
    revalidatePath('/[locale]', 'layout');
    redirect({ href: next, locale });
  }

  try {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.auth.verifyOtp({ phone, token: code, type: 'sms' });
    if (error || !data.session) {
      const message: AuthFailure['message'] =
        error?.status === 410 || error?.status === 401 ? 'invalid_code' : 'server';
      return {
        success: false,
        stage: 'code',
        method,
        message,
        fields: message === 'invalid_code' ? { code: 'invalid_code' } : undefined,
        phone,
      };
    }
  } catch (error) {
    reportError(error, { surface: 'auth:verifyOtp', phone });
    return { success: false, stage: 'code', method, message: 'server', phone };
  }

  revalidatePath('/[locale]', 'layout');
  redirect({ href: next, locale });
}

// ---------- sign out ----------

/**
 * Sign out and redirect to the localised home. Form-level action —
 * the nav renders a tiny `<form action={signOut}>` so this needs no
 * client JS at all.
 */
export async function signOut(formData: FormData): Promise<void> {
  const locale = (formValue(formData, 'locale') === 'ar' ? 'ar' : 'en') as 'ar' | 'en';

  if (hasSupabaseAuth()) {
    try {
      const supabase = await getSupabaseServerClient();
      await supabase.auth.signOut();
    } catch (error) {
      reportError(error, { surface: 'auth:signOut' });
      // fall through to the cookie clear below
    }
  }

  // Always clear the stub cookie — both because we may be in stub
  // mode, and as a safety net if Supabase's own cookies didn't all
  // get cleared (e.g. partial signOut error).
  const store = await cookies();
  store.delete(STUB_SESSION_COOKIE);

  revalidatePath('/[locale]', 'layout');
  redirect({ href: '/', locale });
}
