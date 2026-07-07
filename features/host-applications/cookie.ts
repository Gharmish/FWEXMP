import type {
  HostApplicationView,
  HostApplicationStatus,
  HostIdentityType,
} from '@/features/host-applications/types';
import { HOST_LANGUAGE_OPTIONS } from '@/features/host-applications/types';

/**
 * Cookie-backed host-application storage. Same boundary pattern as
 * `gharmish_wishlist` and `gharmish_last_booking`: a single
 * HttpOnly+SameSite=Lax cookie holds a serialized application so the
 * UX works end-to-end without a DB.
 *
 * The cookie value is a JSON string. We accept the size hit (≤ ~2KB)
 * because the alternative (compact field encoding) would diverge
 * from the DB row shape and add a translation layer we don't need.
 *
 * Migration: when DATABASE_URL arrives, the user's next visit to
 * `/host/apply` reads the DB first (signed-in identity ↔ DB row). If
 * the DB has nothing but the cookie has a record, the queries layer
 * could one-day backfill — but for now the application form simply
 * re-presents and the user re-submits. The cookie's lifetime is
 * deliberately short (30 days) to keep that window small.
 */
export const HOST_APPLICATION_COOKIE = 'gharmish_host_application';
export const HOST_APPLICATION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

const STATUSES: readonly HostApplicationStatus[] = ['pending', 'approved', 'rejected'];
const IDENTITY_TYPES: readonly HostIdentityType[] = ['national_id', 'cr'];
const LANG_SET = new Set<string>(HOST_LANGUAGE_OPTIONS);

/** Permissive parse — anything malformed yields `null`. */
export function parseHostApplicationCookie(value: string | undefined): HostApplicationView | null {
  if (!value) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(value);
  } catch {
    return null;
  }
  if (!isPlainObject(raw)) return null;

  const identityType = raw.identityType;
  const status = raw.status;
  if (
    typeof identityType !== 'string' ||
    !IDENTITY_TYPES.includes(identityType as HostIdentityType)
  ) {
    return null;
  }
  if (typeof status !== 'string' || !STATUSES.includes(status as HostApplicationStatus)) {
    return null;
  }

  // Required string fields. Cookies are user-controlled so we re-validate
  // every shape; nothing leans on the JSON typing.
  const userId = stringField(raw, 'userId');
  const contactPhone = stringField(raw, 'contactPhone');
  const displayName = stringField(raw, 'displayName');
  const bioEn = stringField(raw, 'bioEn');
  const identityNumber = stringField(raw, 'identityNumber');
  const createdAt = stringField(raw, 'createdAt');
  if (!userId || !contactPhone || !displayName || !bioEn || !identityNumber || !createdAt) {
    return null;
  }

  const languagesRaw = raw.languages;
  const languages: string[] = Array.isArray(languagesRaw)
    ? Array.from(
        new Set(languagesRaw.filter((l): l is string => typeof l === 'string' && LANG_SET.has(l))),
      )
    : [];
  if (languages.length === 0) return null;

  return {
    id: null,
    userId,
    contactPhone,
    contactEmail: stringField(raw, 'contactEmail') || null,
    displayName,
    bioEn,
    bioAr: stringField(raw, 'bioAr') || null,
    languages,
    identityType: identityType as HostIdentityType,
    identityNumber,
    // KYC scalars ride the cookie unvalidated-but-typed; a pre-KYC
    // cookie simply yields nulls, same as a pre-KYC DB row.
    legalName: stringField(raw, 'legalName') || null,
    dateOfBirth: stringField(raw, 'dateOfBirth') || null,
    iban: stringField(raw, 'iban') || null,
    bankName: stringField(raw, 'bankName') || null,
    bankAccountHolder: stringField(raw, 'bankAccountHolder') || null,
    vatNumber: stringField(raw, 'vatNumber') || null,
    city: stringField(raw, 'city') || 'Abha',
    region: stringField(raw, 'region') || 'Asir',
    status: status as HostApplicationStatus,
    reviewerNotes: stringField(raw, 'reviewerNotes') || null,
    createdAt,
    reviewedAt: stringField(raw, 'reviewedAt') || null,
    // Stub mode has no real storage — uploads are DB-mode only.
    documents: [],
  };
}

export function serializeHostApplicationCookie(view: HostApplicationView): string {
  // Drop `id` (always null in cookie mode) and `documents` (always
  // empty — uploads need real storage) so the payload stays compact
  // and the parse round-trips cleanly.
  const rest = { ...view } as Partial<HostApplicationView>;
  delete rest.id;
  delete rest.documents;
  return JSON.stringify(rest);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(obj: Record<string, unknown>, key: string): string {
  const value = obj[key];
  return typeof value === 'string' ? value : '';
}
