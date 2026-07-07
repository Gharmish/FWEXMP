import type { HostDocumentType, HostIdentityType } from '@/features/host-applications/types';

/**
 * KYC document upload constraints, mirrored from the Supabase
 * `kyc-documents` bucket (private, 10MB hard cap, image + PDF MIME
 * types). Kept pure so the rules are shared by the client (fail fast
 * before uploading) and the server action (authoritative check).
 */

/** Private Supabase Storage bucket holding KYC uploads. Never public. */
export const KYC_DOCUMENTS_BUCKET = 'kyc-documents';

/**
 * Per-file cap. Deliberately below the bucket's 10MB backstop: the
 * submit action receives every document in one multipart request, and
 * the worst case (5 files for a CR applicant) must stay under the
 * server-action `bodySizeLimit` in next.config.ts.
 */
export const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;

/** Accepted content types → canonical file extension for the object key. */
const ACCEPTED: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

export const ACCEPTED_DOCUMENT_MIME = Object.keys(ACCEPTED);
/** For the file input's `accept` attribute. */
export const ACCEPTED_DOCUMENT_ATTR = ACCEPTED_DOCUMENT_MIME.join(',');

export type DocumentValidationError = 'missing' | 'type' | 'size';

export type DocumentValidationResult =
  | { ok: true; ext: string; contentType: string }
  | { ok: false; reason: DocumentValidationError };

/**
 * Validate a candidate KYC document by declared type and size. We trust
 * the browser-reported MIME for the extension mapping but gate on our
 * allow-list, so an unexpected type is rejected rather than stored with
 * a guessed extension.
 */
export function validateDocument(input: { size: number; type: string }): DocumentValidationResult {
  if (!input.size) return { ok: false, reason: 'missing' };
  const ext = ACCEPTED[input.type];
  if (!ext) return { ok: false, reason: 'type' };
  if (input.size > MAX_DOCUMENT_BYTES) return { ok: false, reason: 'size' };
  return { ok: true, ext, contentType: input.type };
}

/**
 * Which documents each identity type must / may provide (owner decision
 * 2026-07-07 — no insurance or civil-defense documents; hosts carry full
 * liability for their experiences):
 *
 *   - Individuals: ID + IBAN letter required. The MoT freelance tourism
 *     document is encouraged but optional — requiring it would block
 *     genuine early hosts, and the partnerships call covers licensing.
 *   - Companies: CR + tourism license + authorized-signatory ID + IBAN
 *     letter required; VAT certificate only if VAT-registered.
 */
const REQUIRED: Record<HostIdentityType, readonly HostDocumentType[]> = {
  national_id: ['national_id', 'iban_letter'],
  cr: ['cr_certificate', 'tourism_license', 'signatory_id', 'iban_letter'],
};

const OPTIONAL: Record<HostIdentityType, readonly HostDocumentType[]> = {
  national_id: ['tourism_license'],
  cr: ['vat_certificate'],
};

export function requiredDocumentTypes(identity: HostIdentityType): readonly HostDocumentType[] {
  return REQUIRED[identity];
}

/** Required first, then optional — the display order for form + admin. */
export function documentTypesFor(identity: HostIdentityType): readonly HostDocumentType[] {
  return [...REQUIRED[identity], ...OPTIONAL[identity]];
}

export function isRequiredDocument(identity: HostIdentityType, type: HostDocumentType): boolean {
  return REQUIRED[identity].includes(type);
}

/**
 * Object key inside the private `kyc-documents` bucket:
 * `{userId}/{type}-{token}.{ext}`. The user-id folder is what the
 * bucket's own-folder RLS policies key on; the token (a timestamp)
 * makes each upload unique so a replacement never clobbers the previous
 * object before the DB row has moved over.
 */
export function kycObjectKey(
  userId: string,
  type: HostDocumentType,
  token: string | number,
  ext: string,
): string {
  return `${userId}/${type}-${token}.${ext}`;
}
