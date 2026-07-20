'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import { guests, hosts, payoutIbanEvents, userProfileEvents } from '@/db/schema';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import { isAdminUser } from '@/features/admin/auth';
import { isValidSaudiIban, normalizeIban } from '@/features/host-applications/lib/iban';
import { maskIban } from '@/features/admin/hosts/lib/mask';
import { resolveEditTargets } from '@/features/admin/users/queries';
import { adminGuestEditSchema, adminHostEditSchema } from '@/features/admin/users/schemas';
import { diffFields, maskAuditValue, type FieldChange } from '@/features/admin/users/lib/audit';
import { decryptPii, encryptPii } from '@/lib/pii-crypto';
import type { AdminUserEditState } from '@/features/admin/users/types';

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

async function requireAdmin(): Promise<{ adminUserId: string } | { error: AdminUserEditState }> {
  const admin = await getCurrentUser();
  if (!admin || !isAdminUser(admin)) return { error: { success: false, message: 'forbidden' } };
  if (!serverEnv.DATABASE_URL) return { error: { success: false, message: 'no_db' } };
  return { adminUserId: admin.id };
}

/** Postgres unique-violation SQLSTATE. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}

/**
 * Persist the field-level audit trail for an admin edit. One row per
 * changed field, sensitive values masked. Best-effort within the caller's
 * try/catch — the edit itself already succeeded before we get here.
 */
async function logProfileEdits(
  subject: { guestId: string | null; hostId: string | null; authUserId: string | null },
  actorUserId: string,
  changes: readonly FieldChange[],
): Promise<void> {
  if (changes.length === 0) return;
  await db.insert(userProfileEvents).values(
    changes.map((change) => ({
      subjectAuthUserId: subject.authUserId,
      subjectGuestId: subject.guestId,
      subjectHostId: subject.hostId,
      actorUserId,
      field: change.field,
      previousValue: maskAuditValue(change.field, change.previous),
      newValue: maskAuditValue(change.field, change.next),
    })),
  );
}

function revalidateUser(key: string): void {
  revalidatePath('/[locale]/admin/users', 'page');
  revalidatePath('/[locale]/admin/users/[key]', 'page');
  revalidatePath('/[locale]/admin/guests', 'page');
  revalidatePath('/[locale]/admin/guests/[id]', 'page');
  revalidatePath('/[locale]/admin/hosts', 'page');
  revalidatePath('/[locale]/admin/hosts/[id]', 'page');
  void key;
}

const GUEST_ECHO_KEYS = [
  'name',
  'email',
  'phone',
  'preferredLanguage',
  'billingStreet1',
  'billingCity',
  'billingState',
  'billingPostcode',
  'billingCountry',
] as const;
const HOST_ECHO_KEYS = [
  'name',
  'bioEn',
  'bioAr',
  'contactEmail',
  'city',
  'region',
  'nationalId',
  'crNumber',
  'payoutIban',
] as const;

function echoValues(formData: FormData, keys: readonly string[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const key of keys) values[key] = formValue(formData, key);
  return values;
}

function echoLanguages(formData: FormData): string[] {
  return formData.getAll('languages').filter((v): v is string => typeof v === 'string');
}

export async function updateGuestProfile(
  _previous: AdminUserEditState,
  formData: FormData,
): Promise<AdminUserEditState> {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const key = formValue(formData, 'key');
  const parsed = adminGuestEditSchema.safeParse({
    name: formValue(formData, 'name'),
    email: formValue(formData, 'email'),
    phone: formValue(formData, 'phone'),
    preferredLanguage: formValue(formData, 'preferredLanguage'),
    billingStreet1: formValue(formData, 'billingStreet1'),
    billingCity: formValue(formData, 'billingCity'),
    billingState: formValue(formData, 'billingState'),
    billingPostcode: formValue(formData, 'billingPostcode'),
    billingCountry: formValue(formData, 'billingCountry'),
  });
  if (!parsed.success) {
    const fields: Record<string, true> = {};
    for (const issue of parsed.error.issues) {
      const k = issue.path[0];
      if (typeof k === 'string') fields[k] = true;
    }
    return {
      success: false,
      message: 'validation',
      fields,
      values: echoValues(formData, GUEST_ECHO_KEYS),
    };
  }

  try {
    const targets = await resolveEditTargets(key);
    if (!targets?.guestId) return { success: false, message: 'not_found' };

    const current = await db.query.guests.findFirst({ where: (g) => eq(g.id, targets.guestId!) });
    if (!current) return { success: false, message: 'not_found' };

    const next = parsed.data;
    const before: Record<string, string | null> = {
      'guest.name': current.name,
      'guest.email': current.email,
      'guest.phone': current.phone,
      'guest.preferredLanguage': current.preferredLanguage,
      'guest.billingStreet1': current.billingStreet1,
      'guest.billingCity': current.billingCity,
      'guest.billingState': current.billingState,
      'guest.billingPostcode': current.billingPostcode,
      'guest.billingCountry': current.billingCountry,
    };
    const after: Record<string, string | null> = {
      'guest.name': next.name,
      'guest.email': next.email ?? null,
      'guest.phone': next.phone ?? null,
      'guest.preferredLanguage': next.preferredLanguage,
      'guest.billingStreet1': next.billingStreet1 ?? null,
      'guest.billingCity': next.billingCity ?? null,
      'guest.billingState': next.billingState ?? null,
      'guest.billingPostcode': next.billingPostcode ?? null,
      'guest.billingCountry': next.billingCountry ? next.billingCountry.toUpperCase() : null,
    };

    try {
      await db
        .update(guests)
        .set({
          name: next.name,
          email: next.email ?? null,
          phone: next.phone ?? null,
          preferredLanguage: next.preferredLanguage,
          billingStreet1: next.billingStreet1 ?? null,
          billingCity: next.billingCity ?? null,
          billingState: next.billingState ?? null,
          billingPostcode: next.billingPostcode ?? null,
          billingCountry: next.billingCountry ? next.billingCountry.toUpperCase() : null,
        })
        .where(eq(guests.id, targets.guestId));
    } catch (error) {
      if (isUniqueViolation(error)) {
        return {
          success: false,
          message: 'phone_taken',
          fields: { phone: true },
          values: echoValues(formData, GUEST_ECHO_KEYS),
        };
      }
      throw error;
    }

    await logProfileEdits(targets, guard.adminUserId, diffFields(before, after));
  } catch (error) {
    reportError(error, { surface: 'admin:updateGuestProfile', key });
    return { success: false, message: 'server', values: echoValues(formData, GUEST_ECHO_KEYS) };
  }

  revalidateUser(key);
  return { success: true };
}

export async function updateHostProfile(
  _previous: AdminUserEditState,
  formData: FormData,
): Promise<AdminUserEditState> {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const key = formValue(formData, 'key');
  const parsed = adminHostEditSchema.safeParse({
    name: formValue(formData, 'name'),
    bioEn: formValue(formData, 'bioEn'),
    bioAr: formValue(formData, 'bioAr'),
    contactEmail: formValue(formData, 'contactEmail'),
    city: formValue(formData, 'city'),
    region: formValue(formData, 'region'),
    languages: formData.getAll('languages').filter((v): v is string => typeof v === 'string'),
    nationalId: formValue(formData, 'nationalId'),
    crNumber: formValue(formData, 'crNumber'),
    payoutIban: formValue(formData, 'payoutIban'),
  });
  if (!parsed.success) {
    const fields: Record<string, true> = {};
    for (const issue of parsed.error.issues) {
      const k = issue.path[0];
      if (typeof k === 'string') fields[k] = true;
    }
    return {
      success: false,
      message: 'validation',
      fields,
      values: echoValues(formData, HOST_ECHO_KEYS),
      valuesLanguages: echoLanguages(formData),
    };
  }

  const next = parsed.data;

  // Normalise + checksum the IBAN when present. Empty clears it.
  let normalizedIban: string | null = null;
  if (next.payoutIban && next.payoutIban.length > 0) {
    normalizedIban = normalizeIban(next.payoutIban);
    if (!isValidSaudiIban(normalizedIban)) {
      return {
        success: false,
        message: 'iban_invalid',
        fields: { payoutIban: true },
        values: echoValues(formData, HOST_ECHO_KEYS),
        valuesLanguages: echoLanguages(formData),
      };
    }
  }

  try {
    const targets = await resolveEditTargets(key);
    if (!targets?.hostId) return { success: false, message: 'not_found' };

    const current = await db.query.hosts.findFirst({ where: (h) => eq(h.id, targets.hostId!) });
    if (!current) return { success: false, message: 'not_found' };

    // PII columns may be encrypted at rest — diff/mask on decrypted
    // values so the audit trail's masked last-4s stay meaningful.
    const currentNationalId = decryptPii(current.nationalId);
    const currentCrNumber = decryptPii(current.crNumber);
    const currentPayoutIban = decryptPii(current.payoutIban);

    const before: Record<string, string | null> = {
      'host.name': current.name,
      'host.bioEn': current.bioEn,
      'host.bioAr': current.bioAr,
      'host.contactEmail': current.contactEmail,
      'host.city': current.city,
      'host.region': current.region,
      'host.languages': current.languages.join(','),
      'host.nationalId': currentNationalId,
      'host.crNumber': currentCrNumber,
      'host.payoutIban': currentPayoutIban,
    };
    const after: Record<string, string | null> = {
      'host.name': next.name,
      'host.bioEn': next.bioEn,
      'host.bioAr': next.bioAr.length > 0 ? next.bioAr : current.bioAr,
      'host.contactEmail': next.contactEmail ?? null,
      'host.city': next.city,
      'host.region': next.region,
      'host.languages': next.languages.join(','),
      'host.nationalId': next.nationalId ?? null,
      'host.crNumber': next.crNumber ?? null,
      'host.payoutIban': normalizedIban,
    };

    await db
      .update(hosts)
      .set({
        name: next.name,
        bioEn: next.bioEn,
        // Keep the existing Arabic bio when the admin left the field blank.
        bioAr: next.bioAr.length > 0 ? next.bioAr : current.bioAr,
        contactEmail: next.contactEmail ?? null,
        city: next.city,
        region: next.region,
        languages: next.languages,
        nationalId: encryptPii(next.nationalId ?? null),
        crNumber: encryptPii(next.crNumber ?? null),
        payoutIban: encryptPii(normalizedIban),
      })
      .where(eq(hosts.id, targets.hostId));

    // The IBAN gets its own tamper-evident trail (masked), mirroring the
    // host's own self-edit — an unexpected change re-routes money.
    if ((currentPayoutIban ?? null) !== normalizedIban) {
      await db.insert(payoutIbanEvents).values({
        hostId: targets.hostId,
        actorUserId: guard.adminUserId,
        previousIbanMasked: maskIban(currentPayoutIban),
        newIbanMasked: maskIban(normalizedIban) ?? '—',
      });
    }

    await logProfileEdits(targets, guard.adminUserId, diffFields(before, after));
  } catch (error) {
    reportError(error, { surface: 'admin:updateHostProfile', key });
    return {
      success: false,
      message: 'server',
      values: echoValues(formData, HOST_ECHO_KEYS),
      valuesLanguages: echoLanguages(formData),
    };
  }

  revalidateUser(key);
  return { success: true };
}
