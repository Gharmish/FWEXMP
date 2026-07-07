/**
 * Public types for the host-application feature. The DB row type lives
 * in `db/schema.ts`; this file mirrors only what the UI and the stub
 * cookie need to consume — so swapping storage backends never ripples
 * into page code.
 */

export type HostApplicationStatus = 'pending' | 'approved' | 'rejected';
export type HostIdentityType = 'national_id' | 'cr';

/** Mirrors `host_document_type` / `host_document_status` in db/schema.ts. */
export type HostDocumentType =
  | 'national_id'
  | 'cr_certificate'
  | 'tourism_license'
  | 'signatory_id'
  | 'vat_certificate'
  | 'iban_letter';
export type HostDocumentStatus = 'pending' | 'approved' | 'rejected';

/** One uploaded KYC document as the UI consumes it (host + admin). */
export interface HostApplicationDocumentView {
  id: string;
  type: HostDocumentType;
  fileName: string;
  status: HostDocumentStatus;
  /** Set on per-document rejection — tells the host what to fix. */
  reviewerNotes: string | null;
  /** ISO 8601 upload time of the current file. */
  createdAt: string;
}

/** Shape returned by the queries layer, sample-data or DB. */
export interface HostApplicationView {
  /** `null` when storage is cookie-backed (no row id exists). */
  id: string | null;
  userId: string;
  contactPhone: string;
  contactEmail: string | null;
  displayName: string;
  bioEn: string;
  bioAr: string | null;
  languages: readonly string[];
  identityType: HostIdentityType;
  identityNumber: string;
  /**
   * KYC fields — null on rows filed before the KYC form shipped
   * (2026-07-07) and in cookie-backed stub records where noted.
   */
  legalName: string | null;
  /** ISO date (YYYY-MM-DD). Individuals only. */
  dateOfBirth: string | null;
  iban: string | null;
  bankName: string | null;
  bankAccountHolder: string | null;
  vatNumber: string | null;
  city: string;
  region: string;
  status: HostApplicationStatus;
  reviewerNotes: string | null;
  /** ISO 8601. Cookie-backed records snapshot the submit moment. */
  createdAt: string;
  reviewedAt: string | null;
  /** Uploaded KYC documents. Always empty in cookie-backed stub mode. */
  documents: readonly HostApplicationDocumentView[];
}

/**
 * Admin-side document view: adds file metadata and a short-lived signed
 * URL into the private bucket (null when storage is unreachable —
 * the row still renders, just without a View link).
 */
export interface HostApplicationDocumentAdminView extends HostApplicationDocumentView {
  contentType: string;
  sizeBytes: number;
  signedUrl: string | null;
}

export type HostApplicationEventType = 'submitted' | 'approved' | 'rejected';

/** One entry in the application's audit timeline (DB-backed only). */
export interface HostApplicationEventView {
  id: string;
  event: HostApplicationEventType;
  reviewerNotes: string | null;
  /** ISO 8601. */
  createdAt: string;
}

/** Languages the form offers, in display order. Subset of BRIEF §8. */
export const HOST_LANGUAGE_OPTIONS = ['ar', 'en', 'fr', 'ur'] as const;
export type HostLanguage = (typeof HOST_LANGUAGE_OPTIONS)[number];
