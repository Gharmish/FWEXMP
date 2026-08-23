import { cache } from 'react';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';
import type { Host } from '@/db/schema';
import { bookings, experiences } from '@/db/schema';
import { reportError } from '@/lib/log';
import { getCurrentUser } from '@/features/auth/queries';
import type { HostProfile } from '@/features/hosts/types';

/**
 * Host dashboard data access. Reads are scoped to the signed-in user's
 * own host record via `hosts.userId` — never accept a `hostId`/`slug`
 * from the caller (URL or form) on these helpers; that would open the
 * door to one host's dashboard reading another's data.
 *
 * Stub mode (no DATABASE_URL) returns `null` for the host lookup — a
 * dashboard built on Supabase-Auth-only identity is meaningless without
 * the `hosts` row, so the page renders the "complete onboarding" surface.
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

/** How long a pending phone change stays actionable (Twilio Verify codes live 10 min). */
export const PENDING_PHONE_WINDOW_MS = 15 * 60 * 1000;

function toProfile(row: Host): HostDashboardData['host'] {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    bioEn: row.bioEn,
    bioAr: row.bioAr,
    storyEn: row.storyEn,
    storyAr: row.storyAr,
    verified: row.verificationStatus === 'verified',
    languages: row.languages,
    verificationStatus: row.verificationStatus,
    photoUrl: row.photoUrl,
    joinedAt: row.createdAt.toISOString(),
    payoutIbanSet: Boolean(row.payoutIban),
    contactPhone: row.contactPhone,
    contactEmail: row.contactEmail,
    pendingContactPhone:
      row.pendingContactPhone &&
      row.pendingContactPhoneAt &&
      row.pendingContactPhoneAt.getTime() + PENDING_PHONE_WINDOW_MS > Date.now()
        ? row.pendingContactPhone
        : null,
    notificationPrefs: {
      email: row.notifyEmail,
      whatsapp: row.notifyWhatsapp,
      reminders: row.notifyReminders,
      reviews: row.notifyReviews,
    },
  };
}

/**
 * Cheap existence check — does the current request's user own a
 * `hosts` row? Used by the nav to decide whether to surface the
 * "Host" link. Returns false in stub mode (no DB) and false for
 * signed-out users.
 */
export async function currentUserIsHost(): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  if (!serverEnv.DATABASE_URL) return false;
  try {
    const row = await db.query.hosts.findFirst({
      where: (h) => eq(h.userId, user.id),
      columns: { id: true },
    });
    return Boolean(row);
  } catch (error) {
    reportError(error, { surface: 'host-dashboard:currentUserIsHost', userId: user.id });
    return false;
  }
}

/**
 * Resolve the dashboard payload for the current request, or `null` if
 * the caller isn't signed in / isn't a host yet / the DB isn't wired.
 * Page-level code decides where to send the user in each case.
 *
 * Wrapped in React `cache()`: the host layout gates on this and the pages
 * re-read it for host data (defence in depth), so per-request memoisation
 * keeps that at one query instead of two.
 */
export const getHostDashboard = cache(
  async function getHostDashboard(): Promise<HostDashboardData | null> {
    const user = await getCurrentUser();
    if (!user) return null;
    if (!serverEnv.DATABASE_URL) return null;

    try {
      const row = await db.query.hosts.findFirst({
        where: (h) => eq(h.userId, user.id),
      });
      if (!row) return null;
      return { host: toProfile(row) };
    } catch (error) {
      // Rethrow: `null` must mean "not a host" ONLY. Swallowing a DB error
      // here made every host page redirect a verified host to /host/apply
      // during transient outages; throwing lets the error boundary render
      // a retryable failure instead.
      reportError(error, { surface: 'host-dashboard:get', userId: user.id });
      throw error;
    }
  },
);

/** The signed-in host's id + status, or null (signed out / not a host / no DB). */
export interface CurrentHostRef {
  id: string;
  verificationStatus: HostDashboardData['host']['verificationStatus'];
}

/**
 * Request-memoised host resolver for every host-scoped query (2026-08-22
 * dashboard audit P1-5). Before this, each of the six overview queries
 * re-ran `getCurrentUser()` → `hosts.findFirst` before its real work —
 * ~7 redundant lookups per render, each making its consumer a two-deep
 * chain against a DB in eu-central-1. Backed by the already-cached
 * `getHostDashboard`, so the whole request pays for ONE hosts read.
 *
 * Contract for callers: `null` means "no host to scope to" — the same
 * answer the old per-query resolvers gave on a DB error, so list helpers
 * keep their empty-result semantics; the layout's own `getHostDashboard`
 * call has already surfaced a real outage to the error boundary.
 */
export const getCurrentHostRef = cache(
  async function getCurrentHostRef(): Promise<CurrentHostRef | null> {
    try {
      const dashboard = await getHostDashboard();
      if (!dashboard) return null;
      return { id: dashboard.host.id, verificationStatus: dashboard.host.verificationStatus };
    } catch (error) {
      reportError(error, { surface: 'host-dashboard:currentHostRef' });
      return null;
    }
  },
);

/** Host id for READS — status-blind, so a suspended host still sees their own data. */
export async function getCurrentHostId(): Promise<string | null> {
  const ref = await getCurrentHostRef();
  return ref?.id ?? null;
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

/**
 * One round trip each for the two aggregates the Today page needs
 * beyond bookings/earnings/reviews: the listing status mix (setup
 * checklist + attention card) and the host's own cancellation rate
 * (2026-08-22 audit P1-1/P2-4). Null when there's no host to scope to.
 */
export async function getHostTodayFacts(): Promise<HostTodayFacts | null> {
  const ref = await getCurrentHostRef();
  if (!ref || !serverEnv.DATABASE_URL) return null;
  // ISO string + explicit cast: a bare Date param inside a FILTER clause
  // isn't typed by the driver and fails to serialize.
  const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  try {
    const [[listings], changesRequested, [cancellations]] = await Promise.all([
      db
        .select({
          total: sql<number>`count(*)::int`,
          live: sql<number>`count(*) filter (where ${experiences.status} = 'live')::int`,
          draft: sql<number>`count(*) filter (where ${experiences.status} = 'draft')::int`,
          pendingReview: sql<number>`count(*) filter (where ${experiences.status} = 'pending_review')::int`,
          changesRequested: sql<number>`count(*) filter (where ${experiences.status} = 'changes_requested')::int`,
          paused: sql<number>`count(*) filter (where ${experiences.status} = 'paused')::int`,
          withHero: sql<number>`count(*) filter (where ${experiences.heroImage} is not null)::int`,
        })
        .from(experiences)
        .where(eq(experiences.hostId, ref.id)),
      db
        .select({ id: experiences.id, titleEn: experiences.titleEn, titleAr: experiences.titleAr })
        .from(experiences)
        .where(and(eq(experiences.hostId, ref.id), eq(experiences.status, 'changes_requested')))
        .limit(3),
      db
        .select({
          cancellations12m: sql<number>`count(*) filter (where ${bookings.cancellationKind} = 'host' and ${bookings.cancelledAt} >= ${since}::timestamptz)::int`,
          bookings12m: sql<number>`count(*) filter (where ${bookings.approvedAt} >= ${since}::timestamptz or (${bookings.status} in ('confirmed', 'completed') and ${bookings.createdAt} >= ${since}::timestamptz))::int`,
        })
        .from(bookings)
        .innerJoin(experiences, eq(bookings.experienceId, experiences.id))
        .where(eq(experiences.hostId, ref.id)),
    ]);
    return {
      listings: {
        total: listings?.total ?? 0,
        live: listings?.live ?? 0,
        draft: listings?.draft ?? 0,
        pendingReview: listings?.pendingReview ?? 0,
        changesRequested: listings?.changesRequested ?? 0,
        paused: listings?.paused ?? 0,
        withHero: listings?.withHero ?? 0,
      },
      changesRequested,
      cancellations12m: cancellations?.cancellations12m ?? 0,
      bookings12m: cancellations?.bookings12m ?? 0,
    };
  } catch (error) {
    reportError(error, { surface: 'host-dashboard:todayFacts', hostId: ref.id });
    return null;
  }
}
