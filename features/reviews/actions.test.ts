import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * submitReview gates (completed booking, viewer access, one-per-booking)
 * plus the per-guest throttle (2026-07 audit M1). The zod boundary is
 * pinned separately in schemas.test.ts; these tests exercise the action's
 * decision ladder around the insert.
 */

vi.mock('server-only', () => ({}));

const reportError = vi.fn();
vi.mock('@/lib/log', () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));

vi.mock('@/lib/env', () => ({
  serverEnv: { DATABASE_URL: 'postgres://test' },
}));

vi.mock('next/cache', () => ({
  revalidatePath: () => undefined,
}));

const revalidateReviewCaches = vi.fn();
vi.mock('@/lib/cache-tags', () => ({
  revalidateReviewCaches: () => revalidateReviewCaches(),
}));

interface RedirectSentinel extends Error {
  redirectTo: { href: string; locale: string };
}
vi.mock('@/lib/i18n', () => ({
  redirect: (args: { href: string; locale: string }) => {
    const err = new Error('REDIRECT') as RedirectSentinel;
    err.redirectTo = args;
    throw err;
  },
}));

vi.mock('@/features/auth/queries', () => ({
  getCurrentUser: async () => null,
}));

let viewerCanAccess = true;
vi.mock('@/features/bookings/lib/access', () => ({
  bookingViewerCanAccess: async () => viewerCanAccess,
}));

vi.mock('@/features/reviews/lib/review-email', () => ({
  sendHostRepliedEmail: async () => undefined,
}));

let bookingRow: { id: string; guestId: string; experienceId: string; status: string } | undefined;
let existingReview: { id: string } | undefined;
let recentByGuest = 0;
const insertedReviews: Array<Record<string, unknown>> = [];

vi.mock('@/lib/db', () => ({
  db: {
    query: {
      bookings: { findFirst: async () => bookingRow },
      reviews: { findFirst: async () => existingReview },
    },
    select: () => ({
      from: () => ({
        where: async () => [{ recentByGuest }],
      }),
    }),
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        insertedReviews.push(v);
        return Promise.resolve(undefined);
      },
    }),
  },
}));

import { submitReview, type SubmitReviewState } from '@/features/reviews/actions';

const REFERENCE = '4bb44dab-6f13-4d96-8b44-2f7c76ffbe17';
const INITIAL: SubmitReviewState = { success: false };

function reviewForm(overrides: Record<string, string> = {}) {
  const form = new FormData();
  form.set('bookingReference', REFERENCE);
  form.set('rating', '5');
  form.set('text', 'A wonderful evening in the mountains.');
  form.set('locale', 'en');
  for (const [key, value] of Object.entries(overrides)) form.set(key, value);
  return form;
}

async function runSubmit(form: FormData): Promise<SubmitReviewState | RedirectSentinel> {
  try {
    return await submitReview(INITIAL, form);
  } catch (error) {
    if (error instanceof Error && 'redirectTo' in error) return error as RedirectSentinel;
    throw error;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  viewerCanAccess = true;
  bookingRow = { id: 'b1', guestId: 'g1', experienceId: 'e1', status: 'completed' };
  existingReview = undefined;
  recentByGuest = 0;
  insertedReviews.length = 0;
});

describe('submitReview', () => {
  it('inserts the review and redirects to /me on success', async () => {
    const result = await runSubmit(reviewForm());
    expect(result).toBeInstanceOf(Error);
    expect((result as RedirectSentinel).redirectTo).toEqual({ href: '/me', locale: 'en' });
    expect(insertedReviews).toHaveLength(1);
    expect(insertedReviews[0]).toMatchObject({
      bookingId: 'b1',
      guestId: 'g1',
      experienceId: 'e1',
      rating: 5,
      textEn: 'A wonderful evening in the mountains.',
      textAr: null,
    });
    expect(revalidateReviewCaches).toHaveBeenCalled();
  });

  it('refuses a booking that is not completed', async () => {
    bookingRow = { ...bookingRow!, status: 'confirmed' };
    const result = await runSubmit(reviewForm());
    expect(result).toMatchObject({ success: false, message: 'wrong_state' });
    expect(insertedReviews).toHaveLength(0);
  });

  it('refuses a caller who cannot access the booking', async () => {
    viewerCanAccess = false;
    const result = await runSubmit(reviewForm());
    expect(result).toMatchObject({ success: false, message: 'forbidden' });
    expect(insertedReviews).toHaveLength(0);
  });

  it('refuses a second review for the same booking', async () => {
    existingReview = { id: 'r1' };
    const result = await runSubmit(reviewForm());
    expect(result).toMatchObject({ success: false, message: 'already_reviewed' });
    expect(insertedReviews).toHaveLength(0);
  });

  it('throttles a guest who has posted too many reviews this hour', async () => {
    recentByGuest = 5;
    const result = await runSubmit(reviewForm());
    expect(result).toMatchObject({ success: false, message: 'throttled' });
    expect(insertedReviews).toHaveLength(0);
  });

  it('lets a guest under the throttle through', async () => {
    recentByGuest = 4;
    const result = await runSubmit(reviewForm());
    expect(result).toBeInstanceOf(Error);
    expect(insertedReviews).toHaveLength(1);
  });
});
