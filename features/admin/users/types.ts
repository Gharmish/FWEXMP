import type { AdminBookingStatus } from '@/features/admin/bookings/types';
import type { HostVerificationStatus } from '@/features/admin/hosts/types';

/**
 * The "User 360" model. A person's identity is fragmented across
 * `guests` (authUserId), `hosts` (userId) and `host_applications`
 * (userId) — the same Supabase account can be a guest AND a host. These
 * types describe the merged view the admin sees for a single person.
 */

export type UserRole = 'guest' | 'host' | 'applicant' | 'admin';

export type HostApplicationStatus = 'pending' | 'approved' | 'rejected';
export type HostDocumentStatus = 'pending' | 'approved' | 'rejected';
export type HostDocumentType =
  | 'national_id'
  | 'cr_certificate'
  | 'tourism_license'
  | 'signatory_id'
  | 'vat_certificate'
  | 'iban_letter';

/** Directory row — one per resolved person (see `lib/keys.ts`). */
export interface AdminUserRow {
  /** Composite person key: `auth:<id>` | `guest:<id>` | `host:<id>`. */
  key: string;
  name: string;
  phone: string | null;
  email: string | null;
  roles: readonly UserRole[];
  hostStatus: HostVerificationStatus | null;
  guestSuspended: boolean;
  applicationStatus: HostApplicationStatus | null;
  bookings: number;
  spentSar: number;
  publishedExperiences: number;
  /** Earliest createdAt across the merged rows. */
  createdAt: string;
}

export interface AdminUserBooking {
  id: string;
  reference: string;
  status: AdminBookingStatus;
  paymentStatus: 'unpaid' | 'processing' | 'paid' | 'failed';
  date: string;
  experienceTitleEn: string;
  experienceSlug: string;
  totalAmountSar: number;
  discountSar: number;
  promoCode: string | null;
}

export interface AdminUserReview {
  id: string;
  rating: number;
  textEn: string | null;
  experienceTitleEn: string;
  experienceSlug: string;
  hidden: boolean;
  createdAt: string;
}

export interface AdminUserDispute {
  id: string;
  bookingReference: string;
  message: string;
  status: 'open' | 'resolved';
  createdAt: string;
}

export interface AdminUserGuestFacet {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  preferredLanguage: string;
  suspendedAt: string | null;
  billing: {
    street1: string | null;
    city: string | null;
    state: string | null;
    postcode: string | null;
    country: string | null;
  };
  bookingsCount: number;
  spentSar: number;
  savedCount: number;
  bookings: AdminUserBooking[];
  reviews: AdminUserReview[];
  disputes: AdminUserDispute[];
}

export interface AdminUserExperience {
  id: string;
  slug: string;
  titleEn: string;
  status: 'draft' | 'pending_review' | 'changes_requested' | 'live' | 'paused' | 'archived';
}

export interface AdminUserPayout {
  id: string;
  amountSar: number;
  bookingCount: number;
  bankReference: string | null;
  createdAt: string;
}

export interface AdminUserIbanEvent {
  id: string;
  previousIbanMasked: string | null;
  newIbanMasked: string;
  createdAt: string;
}

export interface AdminUserHostStatusEvent {
  id: string;
  event: 'suspended' | 'restored';
  reviewerNotes: string | null;
  createdAt: string;
}

export interface AdminUserHostFacet {
  id: string;
  name: string;
  slug: string;
  verificationStatus: HostVerificationStatus;
  bioEn: string;
  bioAr: string;
  contactEmail: string | null;
  city: string;
  region: string;
  languages: readonly string[];
  nationalId: string | null;
  crNumber: string | null;
  /** Full IBAN — the page masks it and copies the full value. */
  payoutIban: string | null;
  liveBookings: number;
  revenueSar: number;
  experiences: AdminUserExperience[];
  payouts: AdminUserPayout[];
  ibanEvents: AdminUserIbanEvent[];
  statusEvents: AdminUserHostStatusEvent[];
}

export interface AdminUserApplicationDoc {
  type: HostDocumentType;
  status: HostDocumentStatus;
}

export interface AdminUserApplicationEvent {
  id: string;
  event: string;
  reviewerNotes: string | null;
  createdAt: string;
}

export interface AdminUserApplicationFacet {
  id: string;
  status: HostApplicationStatus;
  identityType: 'national_id' | 'cr';
  legalName: string | null;
  iban: string | null;
  vatNumber: string | null;
  reviewerNotes: string | null;
  documents: AdminUserApplicationDoc[];
  events: AdminUserApplicationEvent[];
}

export interface AdminUserProfileEdit {
  id: string;
  field: string;
  previousValue: string | null;
  newValue: string | null;
  actorUserId: string;
  createdAt: string;
}

/** Discriminated result for the admin profile-edit actions (BRIEF §7). */
export interface AdminUserEditState {
  success: boolean;
  message?:
    | 'forbidden'
    | 'no_db'
    | 'not_found'
    | 'validation'
    | 'phone_taken'
    | 'iban_invalid'
    | 'server';
  /** Field keys that failed validation, for inline highlighting. */
  fields?: Record<string, true>;
  /**
   * Raw submitted strings echoed back on failure — React 19 resets
   * uncontrolled inputs after a form action, so without this a failed
   * save silently reverts the admin's edits to the stored values.
   */
  values?: Record<string, string>;
  /** Echo for the multi-select languages checkboxes (host form). */
  valuesLanguages?: string[];
}

export interface AdminUserDetail {
  key: string;
  name: string;
  roles: readonly UserRole[];
  authUserId: string | null;
  createdAt: string;
  guest: AdminUserGuestFacet | null;
  host: AdminUserHostFacet | null;
  application: AdminUserApplicationFacet | null;
  profileEdits: AdminUserProfileEdit[];
}
