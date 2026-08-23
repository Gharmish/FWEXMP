'use server';

import { and, eq, isNotNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { serverEnv, hasSupabaseAuth, hasTwilioVerify, stubAuthAllowed } from '@/lib/env';
import { checkPhoneVerification, startPhoneVerification } from '@/lib/twilio-verify';
import { STUB_OTP } from '@/features/auth/lib/stub-session';
import {
  authClientIp,
  otpSendAllowed,
  otpVerifyAllowed,
  recordOtpSend,
  recordOtpVerifyFailure,
} from '@/features/auth/lib/throttle';
import { PENDING_PHONE_WINDOW_MS } from '@/features/host-dashboard/queries';
import { hostContactAddresses } from '@/lib/notifications/host-contact';
import {
  maskContact,
  sendHostContactChangedEmail,
} from '@/features/host-profile/lib/contact-change-email';
import { conversations, hosts, userProfileEvents } from '@/db/schema';
import { AR_PLACEHOLDER } from '@/lib/ar-placeholder';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import { getSupabaseUserStorage } from '@/lib/supabase/server';
import { validatePhoto, objectKeyFromPublicUrl } from '@/features/host-experiences/lib/photo';
import {
  hostContactCodeSchema,
  hostContactSchema,
  hostNotificationPrefsSchema,
  hostProfileSchema,
} from '@/features/host-profile/schemas';
import type {
  HostContactErrorKey,
  HostContactField,
  HostContactFormState,
  HostNotificationPrefsState,
  HostProfileFormState,
  HostProfileField,
  HostPhotoActionState,
} from '@/features/host-profile/types';

const PHOTO_BUCKET = 'photos';

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

/**
 * Resolve the caller's own host row — always via `hosts.userId` from the
 * session, never a hostId/slug from the form (one host must not be able
 * to edit another's public face).
 *
 * Returns null for a SUSPENDED host (2026-07-28 audit): name, bio, and
 * photo render on public surfaces, so suspension has to freeze them the
 * same way it freezes listings and bookings.
 */
async function getOwnHost() {
  const user = await getCurrentUser();
  if (!user) return null;
  const host = await db.query.hosts.findFirst({
    where: (h) => eq(h.userId, user.id),
    columns: { id: true, slug: true, photoUrl: true, verificationStatus: true },
  });
  if (!host || host.verificationStatus === 'suspended') return null;
  return { ...host, userId: user.id };
}

/**
 * Audit row for a self-service contact/preference change (2026-08-22
 * review): the same `user_profile_events` table the admin User 360
 * writes, with the host as both subject and actor. Sensitive values are
 * masked. Best-effort — an audit hiccup never blocks the change.
 */
async function recordHostProfileEvent(
  host: { id: string; userId: string },
  field: string,
  previousValue: string | null,
  newValue: string | null,
): Promise<void> {
  try {
    await db.insert(userProfileEvents).values({
      subjectHostId: host.id,
      subjectAuthUserId: host.userId,
      actorUserId: host.userId,
      field,
      previousValue,
      newValue,
    });
  } catch (error) {
    reportError(error, { surface: 'host-profile:audit', field });
  }
}

/** Everywhere the host's name/bio/photo shows: dashboard shell + public surfaces. */
function revalidateHostSurfaces() {
  revalidatePath('/[locale]/host', 'layout');
  revalidatePath('/[locale]/hosts', 'page');
  revalidatePath('/[locale]/hosts/[slug]', 'page');
  revalidatePath('/[locale]/experiences/[slug]', 'page');
}

/**
 * Save the host's public identity (name, English bio, Arabic bio,
 * languages). The slug is intentionally untouched — it's the stable
 * public URL (see db/schema.ts) — so renames never break shared links.
 * Hosts author their own Arabic bio directly (they're Arabic-first Saudis
 * writing their own copy, not translating). Leaving it blank stores the
 * `TODO(ar)` marker so the public page falls back to English via
 * `pickLocalized` — the `bioAr` column is notNull.
 */
export async function updateHostProfile(
  _previous: HostProfileFormState,
  formData: FormData,
): Promise<HostProfileFormState> {
  const raw = {
    name: formValue(formData, 'name'),
    bioEn: formValue(formData, 'bioEn'),
    bioAr: formValue(formData, 'bioAr'),
    storyEn: formValue(formData, 'storyEn'),
    storyAr: formValue(formData, 'storyAr'),
    languages: formData.getAll('languages').filter((v): v is string => typeof v === 'string'),
  };

  const parsed = hostProfileSchema.safeParse(raw);
  if (!parsed.success) {
    const fields: Partial<Record<HostProfileField, true>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (
        key === 'name' ||
        key === 'bioEn' ||
        key === 'bioAr' ||
        key === 'storyEn' ||
        key === 'storyAr' ||
        key === 'languages'
      ) {
        fields[key] = true;
      }
    }
    return { status: 'error', message: 'validation', fields, values: raw };
  }

  if (!serverEnv.DATABASE_URL) return { status: 'error', message: 'no_db', values: raw };

  try {
    const host = await getOwnHost();
    if (!host) return { status: 'error', message: 'no_auth', values: raw };

    await db
      .update(hosts)
      .set({
        name: parsed.data.name,
        bioEn: parsed.data.bioEn,
        // Blank Arabic → keep the fallback marker; otherwise store what
        // the host wrote.
        bioAr: parsed.data.bioAr.length > 0 ? parsed.data.bioAr : AR_PLACEHOLDER,
        // Story columns are nullable — blank means "no story yet" and the
        // public section hides itself (no placeholder marker needed).
        storyEn: parsed.data.storyEn.length > 0 ? parsed.data.storyEn : null,
        storyAr: parsed.data.storyAr.length > 0 ? parsed.data.storyAr : null,
        languages: parsed.data.languages,
      })
      .where(eq(hosts.id, host.id));
  } catch (error) {
    reportError(error, { surface: 'host-profile:update' });
    return { status: 'error', message: 'server', values: raw };
  }

  revalidateHostSurfaces();
  return { status: 'success' };
}

/**
 * Upload (or replace) the host's profile photo. Same chassis as the
 * experience hero upload: the `photos` bucket via the request-scoped
 * Supabase client (its "authenticated write" RLS sees the host's
 * session), a stable object key `hosts/{slug}/profile.{ext}` with
 * upsert, and a `?v=` cache-buster so replacements actually refresh.
 */
export async function updateHostPhoto(
  _previous: HostPhotoActionState,
  formData: FormData,
): Promise<HostPhotoActionState> {
  if (!serverEnv.DATABASE_URL) return { status: 'error', message: 'no_db' };
  if (!hasSupabaseAuth()) return { status: 'error', message: 'no_storage' };

  const file = formData.get('photo');
  if (!(file instanceof File) || file.size === 0) {
    return { status: 'error', message: 'no_file' };
  }
  const check = validatePhoto({ size: file.size, type: file.type });
  if (!check.ok) {
    return {
      status: 'error',
      message:
        check.reason === 'type'
          ? 'invalid_type'
          : check.reason === 'size'
            ? 'too_large'
            : 'no_file',
    };
  }

  try {
    const host = await getOwnHost();
    if (!host) return { status: 'error', message: 'no_auth' };

    const key = `hosts/${host.slug}/profile.${check.ext}`;
    const storage = await getSupabaseUserStorage();
    if (!storage) return { status: 'error', message: 'no_storage' };
    const { error: uploadError } = await storage.from(PHOTO_BUCKET).upload(key, file, {
      upsert: true,
      contentType: check.contentType,
    });
    if (uploadError) {
      reportError(uploadError, { surface: 'host-profile:uploadPhoto' });
      return { status: 'error', message: 'server' };
    }

    const {
      data: { publicUrl },
    } = storage.from(PHOTO_BUCKET).getPublicUrl(key);
    // Cache-bust: the object key is stable across replacements, so a
    // version query param forces next/image + browsers to refetch.
    const versioned = `${publicUrl}?v=${Date.now()}`;

    await db.update(hosts).set({ photoUrl: versioned }).where(eq(hosts.id, host.id));

    revalidateHostSurfaces();
    return { status: 'success', photoUrl: versioned };
  } catch (error) {
    reportError(error, { surface: 'host-profile:uploadPhoto' });
    return { status: 'error', message: 'server' };
  }
}

/**
 * Clear the profile photo. Storage cleanup is best-effort — the row no
 * longer references the object, so a storage hiccup never blocks the
 * photo disappearing from the UI.
 */
export async function removeHostPhoto(): Promise<HostPhotoActionState> {
  if (!serverEnv.DATABASE_URL) return { status: 'error', message: 'no_db' };

  try {
    const host = await getOwnHost();
    if (!host) return { status: 'error', message: 'no_auth' };

    await db.update(hosts).set({ photoUrl: null }).where(eq(hosts.id, host.id));

    if (hasSupabaseAuth() && host.photoUrl) {
      const key = objectKeyFromPublicUrl(host.photoUrl);
      if (key) {
        const storage = await getSupabaseUserStorage();
        await storage?.from(PHOTO_BUCKET).remove([key]);
      }
    }

    revalidateHostSurfaces();
    return { status: 'success', photoUrl: null };
  } catch (error) {
    reportError(error, { surface: 'host-profile:removePhoto' });
    return { status: 'error', message: 'server' };
  }
}

/**
 * Contact details (2026-08-22). Every host notification lands on these,
 * so they are editable — but a NEW PHONE must be proven before it takes
 * over: the number is parked in `pendingContactPhone`, a Twilio Verify
 * code goes to it over WhatsApp, and only `confirmHostContactPhone`
 * promotes it. Notifications keep flowing to the old number meanwhile.
 *
 * What the proof does and doesn't give: it shows the host can receive
 * messages at the new number (so guest PII never gets pointed at a
 * stranger's phone) — it does NOT authenticate the actor, who already
 * holds a host session. That gap is covered the way every platform
 * covers it: every change is announced to the PREVIOUS address with a
 * support path to revert (`sendHostContactChangedEmail`), audited in
 * `user_profile_events`, and the old number's WhatsApp identity is
 * dropped (`conversations.hostId`) the moment the new one takes over.
 *
 * The email (no proof step) saves on the same submit. Send/verify
 * throttles are the sign-in ones (features/auth/lib/throttle), keyed on
 * the target phone + client IP — a paid WhatsApp per send.
 */
export async function updateHostContact(
  _previous: HostContactFormState,
  formData: FormData,
): Promise<HostContactFormState> {
  const raw = {
    contactPhone: formValue(formData, 'contactPhone'),
    contactEmail: formValue(formData, 'contactEmail'),
  };
  const locale = formValue(formData, 'locale') === 'en' ? 'en' : 'ar';
  const parsed = hostContactSchema.safeParse(raw);
  if (!parsed.success) {
    const fields: Partial<Record<HostContactField, true>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key === 'contactPhone' || key === 'contactEmail') fields[key] = true;
    }
    return { status: 'error', message: 'validation', fields, values: raw };
  }
  if (!serverEnv.DATABASE_URL) return { status: 'error', message: 'no_db', values: raw };

  let host: { id: string; userId: string } | null = null;
  let current: { contactPhone: string | null; contactEmail: string | null } | null = null;
  try {
    host = await getOwnHost();
    if (!host) return { status: 'error', message: 'no_auth', values: raw };
    current =
      (await db.query.hosts.findFirst({
        where: eq(hosts.id, host.id),
        columns: { contactPhone: true, contactEmail: true },
      })) ?? null;
    if (!current) return { status: 'error', message: 'no_auth', values: raw };
  } catch (error) {
    reportError(error, { surface: 'host-profile:updateContact:read' });
    return { status: 'error', message: 'server', values: raw };
  }

  const emailChanged = parsed.data.contactEmail !== (current.contactEmail ?? '');
  const phoneChanged = parsed.data.contactPhone !== (current.contactPhone ?? '');

  // Email saves immediately (it carries no proof step) — announced to
  // the previous address so a silent redirect is never silent.
  if (emailChanged) {
    try {
      await db
        .update(hosts)
        .set({ contactEmail: parsed.data.contactEmail })
        .where(eq(hosts.id, host.id));
    } catch (error) {
      reportError(error, { surface: 'host-profile:updateContact:email' });
      return { status: 'error', message: 'server', values: raw };
    }
    await recordHostProfileEvent(
      host,
      'host.contactEmail',
      maskContact(current.contactEmail),
      maskContact(parsed.data.contactEmail),
    );
    await sendHostContactChangedEmail(
      host.id,
      { kind: 'email', previous: current.contactEmail, next: parsed.data.contactEmail },
      { previousEmail: current.contactEmail, currentEmail: parsed.data.contactEmail },
    );
  }

  if (!phoneChanged) {
    revalidatePath('/[locale]/host/profile', 'page');
    return { status: 'success', message: 'saved' };
  }

  // ---- phone changed: park it and send the code ----
  const phone = parsed.data.contactPhone;
  const sent = await sendContactPhoneCode(host, phone, locale);
  if (!sent.ok) {
    return { status: 'error', message: sent.message, values: raw, emailSaved: emailChanged };
  }

  revalidatePath('/[locale]/host/profile', 'page');
  return { status: 'verify', phone, emailSaved: emailChanged };
}

/**
 * Throttle → (stub | Twilio Verify) → park as pending. Shared by the
 * first request and "send a new code".
 */
async function sendContactPhoneCode(
  host: { id: string },
  phone: string,
  locale: 'en' | 'ar',
): Promise<{ ok: true } | { ok: false; message: HostContactErrorKey }> {
  const stub = stubAuthAllowed();
  if (!stub && !hasTwilioVerify()) return { ok: false, message: 'verify_unavailable' };

  const ip = await authClientIp();
  if (!(await otpSendAllowed(phone, ip))) return { ok: false, message: 'rate_limited' };
  await recordOtpSend(phone, ip);

  if (stub) {
    // Stub auth (no Supabase locally): the verify step accepts STUB_OTP.
    reportError(new Error(`[host-contact:stub] code requested for ${phone} — use ${STUB_OTP}`), {
      surface: 'host-profile:stub:startVerification',
      phone,
    });
  } else {
    const sent = await startPhoneVerification(phone, locale);
    if (!sent.ok) {
      return {
        ok: false,
        message:
          sent.reason === 'invalid_phone'
            ? 'phone_unreachable'
            : sent.reason === 'rate_limited'
              ? 'rate_limited'
              : sent.reason === 'unconfigured'
                ? 'verify_unavailable'
                : 'server',
      };
    }
  }

  try {
    await db
      .update(hosts)
      .set({ pendingContactPhone: phone, pendingContactPhoneAt: new Date() })
      .where(eq(hosts.id, host.id));
  } catch (error) {
    reportError(error, { surface: 'host-profile:updateContact:pending' });
    return { ok: false, message: 'server' };
  }
  return { ok: true };
}

/** Send a fresh code to the pending number (the first one expired or never arrived). */
export async function resendHostContactPhoneCode(
  _previous: HostContactFormState,
  formData: FormData,
): Promise<HostContactFormState> {
  const locale = formValue(formData, 'locale') === 'en' ? 'en' : 'ar';
  if (!serverEnv.DATABASE_URL) return { status: 'error', message: 'no_db' };
  try {
    const host = await getOwnHost();
    if (!host) return { status: 'error', message: 'no_auth' };
    const row = await db.query.hosts.findFirst({
      where: eq(hosts.id, host.id),
      columns: { pendingContactPhone: true },
    });
    // Any parked number can be re-sent, expired or not — the window
    // restarts with the new code.
    if (!row?.pendingContactPhone) return { status: 'error', message: 'expired' };
    const sent = await sendContactPhoneCode(host, row.pendingContactPhone, locale);
    if (!sent.ok) {
      return {
        status: 'error',
        message: sent.message,
        step: 'verify',
        phone: row.pendingContactPhone,
      };
    }
    return { status: 'verify', phone: row.pendingContactPhone, emailSaved: false, resent: true };
  } catch (error) {
    reportError(error, { surface: 'host-profile:resendCode' });
    return { status: 'error', message: 'server' };
  }
}

/** Check the code the host typed; on success the pending number becomes the contact phone. */
export async function confirmHostContactPhone(
  _previous: HostContactFormState,
  formData: FormData,
): Promise<HostContactFormState> {
  const parsed = hostContactCodeSchema.safeParse({ code: formValue(formData, 'code') });
  if (!serverEnv.DATABASE_URL) return { status: 'error', message: 'no_db' };

  let host: { id: string; userId: string } | null = null;
  let pending: { phone: string; previousPhone: string | null; email: string | null } | null = null;
  let stale = false;
  try {
    host = await getOwnHost();
    if (!host) return { status: 'error', message: 'no_auth' };
    const row = await db.query.hosts.findFirst({
      where: eq(hosts.id, host.id),
      columns: {
        contactPhone: true,
        contactEmail: true,
        pendingContactPhone: true,
        pendingContactPhoneAt: true,
      },
    });
    if (row?.pendingContactPhone) {
      if (
        row.pendingContactPhoneAt &&
        row.pendingContactPhoneAt.getTime() + PENDING_PHONE_WINDOW_MS > Date.now()
      ) {
        pending = {
          phone: row.pendingContactPhone,
          previousPhone: row.contactPhone,
          email: row.contactEmail,
        };
      } else {
        stale = true;
      }
    }
  } catch (error) {
    reportError(error, { surface: 'host-profile:confirmPhone:read' });
    return { status: 'error', message: 'server' };
  }
  if (!pending) {
    // A stale pending row is cleared so the page stops offering a dead code step.
    if (stale) await clearPendingPhone(host.id);
    return { status: 'error', message: 'expired' };
  }

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'invalid_code',
      step: 'verify',
      phone: pending.phone,
      fields: { code: true },
    };
  }

  // Wrong-code throttle — keyed on the target phone like sign-in.
  if (!(await otpVerifyAllowed(pending.phone))) {
    return { status: 'error', message: 'rate_limited', step: 'verify', phone: pending.phone };
  }
  const ip = await authClientIp();

  if (stubAuthAllowed()) {
    if (parsed.data.code !== STUB_OTP) {
      await recordOtpVerifyFailure(pending.phone, ip);
      return {
        status: 'error',
        message: 'invalid_code',
        step: 'verify',
        phone: pending.phone,
        fields: { code: true },
      };
    }
  } else {
    const checked = await checkPhoneVerification(pending.phone, parsed.data.code);
    if (!checked.ok) {
      if (checked.reason === 'invalid_code') await recordOtpVerifyFailure(pending.phone, ip);
      const message: HostContactErrorKey =
        checked.reason === 'invalid_code'
          ? 'invalid_code'
          : checked.reason === 'expired'
            ? 'expired'
            : checked.reason === 'rate_limited'
              ? 'rate_limited'
              : checked.reason === 'unconfigured'
                ? 'verify_unavailable'
                : 'server';
      // Twilio's own code lifetime (10 min) is shorter than our pending
      // window: an expired code keeps the step open so the host can ask
      // for a new one instead of retyping the number.
      return {
        status: 'error',
        message,
        step: 'verify',
        phone: pending.phone,
        fields: message === 'invalid_code' ? { code: true } : undefined,
      };
    }
  }

  try {
    await db
      .update(hosts)
      .set({
        contactPhone: pending.phone,
        pendingContactPhone: null,
        pendingContactPhoneAt: null,
      })
      .where(eq(hosts.id, host.id));
    // The OLD number stops being this host on the WhatsApp support line
    // the moment the new one takes over (conversations.hostId is sticky
    // otherwise — late identification only fills a null).
    if (pending.previousPhone && pending.previousPhone !== pending.phone) {
      await db
        .update(conversations)
        .set({ hostId: null })
        .where(
          and(
            eq(conversations.address, pending.previousPhone),
            eq(conversations.hostId, host.id),
            isNotNull(conversations.hostId),
          ),
        );
    }
  } catch (error) {
    reportError(error, { surface: 'host-profile:confirmPhone:write' });
    return { status: 'error', message: 'server', step: 'verify', phone: pending.phone };
  }
  await recordHostProfileEvent(
    host,
    'host.contactPhone',
    maskContact(pending.previousPhone),
    maskContact(pending.phone),
  );
  await sendHostContactChangedEmail(
    host.id,
    { kind: 'phone', previous: pending.previousPhone, next: pending.phone },
    { previousEmail: pending.email, currentEmail: pending.email },
  );
  revalidatePath('/[locale]/host/profile', 'page');
  return { status: 'success', message: 'phone_verified' };
}

async function clearPendingPhone(hostId: string): Promise<void> {
  try {
    await db
      .update(hosts)
      .set({ pendingContactPhone: null, pendingContactPhoneAt: null })
      .where(eq(hosts.id, hostId));
  } catch (error) {
    reportError(error, { surface: 'host-profile:clearPending' });
  }
}

/** Drop a pending phone change (the host changed their mind or wants to retype the number). */
// `useActionState` passes (previous, formData); neither is needed here.
export async function cancelHostContactPhoneChange(): Promise<HostContactFormState> {
  if (!serverEnv.DATABASE_URL) return { status: 'error', message: 'no_db' };
  try {
    const host = await getOwnHost();
    if (!host) return { status: 'error', message: 'no_auth' };
    await db
      .update(hosts)
      .set({ pendingContactPhone: null, pendingContactPhoneAt: null })
      .where(eq(hosts.id, host.id));
  } catch (error) {
    reportError(error, { surface: 'host-profile:cancelPhoneChange' });
    return { status: 'error', message: 'server' };
  }
  revalidatePath('/[locale]/host/profile', 'page');
  return { status: 'success', message: 'cancelled' };
}

/**
 * Notification preferences (2026-08-22). Channel toggles are applied by
 * the host-contact resolvers (a switched-off channel reads as "no
 * address"); category toggles are checked by the reminder and review
 * senders. At least one channel must stay on — and it must be one the
 * host can actually be reached on (an address exists for it), otherwise
 * "WhatsApp only" with no phone on file would silence everything.
 */
export async function updateHostNotificationPrefs(
  _previous: HostNotificationPrefsState,
  formData: FormData,
): Promise<HostNotificationPrefsState> {
  const values = {
    email: formValue(formData, 'email') === 'on',
    whatsapp: formValue(formData, 'whatsapp') === 'on',
    reminders: formValue(formData, 'reminders') === 'on',
    reviews: formValue(formData, 'reviews') === 'on',
  };
  const parsed = hostNotificationPrefsSchema.safeParse(values);
  if (!parsed.success) return { status: 'error', message: 'channel_required', values };
  if (!serverEnv.DATABASE_URL) return { status: 'error', message: 'no_db', values };
  try {
    const host = await getOwnHost();
    if (!host) return { status: 'error', message: 'no_auth', values };

    const addresses = await hostContactAddresses(host.id);
    const reachable =
      (parsed.data.email && Boolean(addresses?.email)) ||
      (parsed.data.whatsapp && Boolean(addresses?.phone));
    if (!reachable) return { status: 'error', message: 'channel_unreachable', values };

    const before = await db.query.hosts.findFirst({
      where: eq(hosts.id, host.id),
      columns: {
        notifyEmail: true,
        notifyWhatsapp: true,
        notifyReminders: true,
        notifyReviews: true,
      },
    });
    await db
      .update(hosts)
      .set({
        notifyEmail: parsed.data.email,
        notifyWhatsapp: parsed.data.whatsapp,
        notifyReminders: parsed.data.reminders,
        notifyReviews: parsed.data.reviews,
      })
      .where(eq(hosts.id, host.id));

    const summarise = (p: {
      notifyEmail: boolean;
      notifyWhatsapp: boolean;
      notifyReminders: boolean;
      notifyReviews: boolean;
    }) =>
      [
        `email:${p.notifyEmail ? 'on' : 'off'}`,
        `whatsapp:${p.notifyWhatsapp ? 'on' : 'off'}`,
        `reminders:${p.notifyReminders ? 'on' : 'off'}`,
        `reviews:${p.notifyReviews ? 'on' : 'off'}`,
      ].join(' ');
    const next = {
      notifyEmail: parsed.data.email,
      notifyWhatsapp: parsed.data.whatsapp,
      notifyReminders: parsed.data.reminders,
      notifyReviews: parsed.data.reviews,
    };
    const changedChannel =
      before !== undefined &&
      (before.notifyEmail !== next.notifyEmail || before.notifyWhatsapp !== next.notifyWhatsapp);
    await recordHostProfileEvent(
      host,
      'host.notificationPrefs',
      before ? summarise(before) : null,
      summarise(next),
    );
    // A channel being switched off is a redirect of sorts — announce it
    // to the email on file (the address a phone-side hijacker doesn't hold).
    if (changedChannel) {
      await sendHostContactChangedEmail(
        host.id,
        { kind: 'prefs', summary: summarise(next) },
        { previousEmail: addresses?.email ?? null, currentEmail: addresses?.email ?? null },
      );
    }
  } catch (error) {
    reportError(error, { surface: 'host-profile:updateNotificationPrefs' });
    return { status: 'error', message: 'server', values };
  }
  revalidatePath('/[locale]/host/profile', 'page');
  return { status: 'success' };
}
