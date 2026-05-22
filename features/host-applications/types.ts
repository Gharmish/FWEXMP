/**
 * Public types for the host-application feature. The DB row type lives
 * in `db/schema.ts`; this file mirrors only what the UI and the stub
 * cookie need to consume — so swapping storage backends never ripples
 * into page code.
 */

export type HostApplicationStatus = 'pending' | 'approved' | 'rejected';
export type HostIdentityType = 'national_id' | 'cr';

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
  city: string;
  region: string;
  status: HostApplicationStatus;
  reviewerNotes: string | null;
  /** ISO 8601. Cookie-backed records snapshot the submit moment. */
  createdAt: string;
  reviewedAt: string | null;
}

/** Languages the form offers, in display order. Subset of BRIEF §8. */
export const HOST_LANGUAGE_OPTIONS = ['ar', 'en', 'fr', 'ur'] as const;
export type HostLanguage = (typeof HOST_LANGUAGE_OPTIONS)[number];
