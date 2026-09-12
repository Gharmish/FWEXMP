import type { HostProfile } from '@/features/hosts/types';

/**
 * Types for the host-dashboard feature (2026-09 engineering audit ARCH-10 — they
 * lived beside the queries that produced them).
 */

export interface HostDashboardData {
  host: HostProfile & {
    id: string;
    verificationStatus: 'pending' | 'verified' | 'suspended';
    /** Whether a payout IBAN is on file — the setup checklist's money step. */
    payoutIbanSet: boolean;
    /** Notification contact — editable on /host/profile, never public. */
    contactPhone: string | null;
    contactEmail: string | null;
    /** A new phone awaiting its verification code (within the window), if any. */
    pendingContactPhone: string | null;
    notificationPrefs: HostNotificationPrefs;
  };
}

export interface HostNotificationPrefs {
  email: boolean;
  whatsapp: boolean;
  reminders: boolean;
  reviews: boolean;
}

/** The signed-in host's id + status, or null (signed out / not a host / no DB). */
export interface CurrentHostRef {
  id: string;
  verificationStatus: HostDashboardData['host']['verificationStatus'];
}

/** Listing + cancellation facts behind the Today page's checklist and "Your numbers". */
export interface HostTodayFacts {
  listings: {
    total: number;
    live: number;
    draft: number;
    pendingReview: number;
    changesRequested: number;
    paused: number;
    /** Listings with a hero photo — the photography step of the checklist. */
    withHero: number;
  };
  /** Listings the reviewer sent back, for the attention card. */
  changesRequested: readonly { id: string; titleEn: string; titleAr: string }[];
  /** Host-initiated cancellations in the trailing 12 months. */
  cancellations12m: number;
  /** Bookings that reached confirmed-or-later in the same window — the rate's denominator. */
  bookings12m: number;
}
