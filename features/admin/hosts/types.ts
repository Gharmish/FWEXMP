import type { hosts } from '@/db/schema';

export type HostVerificationStatus = (typeof hosts.$inferSelect)['verificationStatus'];

export interface AdminHostRow {
  id: string;
  name: string;
  bioEn: string;
  status: HostVerificationStatus;
  city: string;
  /** Live + paused — what's actually in the host's inventory. */
  publishedExperiences: number;
  /** Includes draft / pending_review / changes_requested too. */
  totalExperiences: number;
  /** Lifetime confirmed + completed bookings. */
  liveBookings: number;
  /** ISO string. */
  createdAt: string;
}

export interface AdminHostExperienceRow {
  id: string;
  slug: string;
  titleEn: string;
  status: 'draft' | 'pending_review' | 'changes_requested' | 'live' | 'paused' | 'archived';
}

export type HostStatusEventType = 'suspended' | 'restored';

export interface AdminHostStatusEventView {
  id: string;
  event: HostStatusEventType;
  reviewerNotes: string | null;
  createdAt: string;
}

export interface AdminHostDetail extends AdminHostRow {
  bioAr: string;
  nationalId: string | null;
  crNumber: string | null;
  /** Payout destination IBAN (self-managed by the host). */
  payoutIban: string | null;
  languages: readonly string[];
  experiences: readonly AdminHostExperienceRow[];
  statusEvents: readonly AdminHostStatusEventView[];
}
