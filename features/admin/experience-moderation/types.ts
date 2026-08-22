import type { experiences, experienceModerationEvents } from '@/db/schema';

export type ExperienceStatus = (typeof experiences.$inferSelect)['status'];
export type ModerationEventType = (typeof experienceModerationEvents.$inferSelect)['event'];

/** Compact view of an experience awaiting (or recently past) admin review. */
export interface ModerationQueueRow {
  id: string;
  slug: string;
  titleEn: string;
  titleAr: string;
  hostName: string;
  status: ExperienceStatus;
  city: string;
  priceSar: number;
  /** Wall-clock ISO timestamp of the most recent host submit. */
  submittedAt: string | null;
}

/** A single decision/submission event in an experience's history. */
export interface ModerationEventView {
  id: string;
  event: ModerationEventType;
  fromStatus: ExperienceStatus;
  toStatus: ExperienceStatus;
  reviewerNotes: string | null;
  createdAt: string;
}

/** Full detail page payload — everything the reviewer needs in one read. */
export interface ModerationDetail {
  id: string;
  slug: string;
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
  category: (typeof experiences.$inferSelect)['category'];
  durationMinutes: number;
  maxGroupSize: number;
  minAge: number;
  priceSar: number;
  city: string;
  region: string;
  placeName: string;
  inclusions: readonly string[];
  whatToBring: readonly string[];
  /**
   * The ENFORCED cancellation policy — the tier every booking snapshots.
   * The legacy free-text `cancellationPolicy` column is dead and is
   * deliberately not surfaced here (it can contradict the tier).
   */
  cancellationTier: (typeof experiences.$inferSelect)['cancellationTier'];
  inclusionsAr: readonly string[];
  whatToBringAr: readonly string[];
  availabilityWeekdays: readonly number[];
  status: ExperienceStatus;
  heroImage: string | null;
  images: readonly string[];
  hostName: string;
  hostSlug: string | null;
  events: readonly ModerationEventView[];
  /** Wall-clock ISO timestamp of the most recent host submit, if any. */
  submittedAt: string | null;
}
