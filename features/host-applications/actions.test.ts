import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * submitHostApplication DB path: fresh insert, resubmission upsert, and
 * the post-rejection cooldown (2026-07 audit L2). The zod boundary is
 * exercised by the schema itself; these tests pin the decision ladder
 * around the upsert.
 */

vi.mock('server-only', () => ({}));

const reportError = vi.fn();
vi.mock('@/lib/log', () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));

vi.mock('@/lib/env', () => ({
  serverEnv: { DATABASE_URL: 'postgres://test' },
  // No storage in the unit harness — the action skips the document
  // staging/upload path entirely (documentsEnabled === false).
  hasSupabaseAuth: () => false,
}));

vi.mock('next/cache', () => ({
  revalidatePath: () => undefined,
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ set: () => undefined, get: () => undefined }),
}));

const notifyAdmin = vi.fn(async () => undefined);
vi.mock('@/lib/admin-alerts', () => ({
  notifyAdmin: (...args: unknown[]) => notifyAdmin(...(args as [])),
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
  getCurrentUser: async () => ({ id: 'user-1', phone: '+966500000001', email: null }),
}));

let existingApp:
  | { id: string; status: 'pending' | 'approved' | 'rejected'; reviewedAt: Date | null }
  | undefined;
const updates: Array<Record<string, unknown>> = [];
const insertedApplications: Array<Record<string, unknown>> = [];
const insertedEvents: Array<Record<string, unknown>> = [];

vi.mock('@/lib/db', () => {
  const handlers = {
    query: {
      hostApplications: { findFirst: async () => existingApp },
    },
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: () => {
          updates.push(values);
          return Promise.resolve(undefined);
        },
      }),
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        if ('event' in values) {
          insertedEvents.push(values);
          return Promise.resolve(undefined);
        }
        insertedApplications.push(values);
        const p = Promise.resolve(undefined) as Promise<unknown> & {
          returning: () => Promise<Array<{ id: string }>>;
        };
        p.returning = async () => [{ id: 'app-new' }];
        return p;
      },
    }),
  };
  return {
    db: {
      ...handlers,
      // The submit path wraps its writes in a transaction; the unit
      // harness just replays them against the same recording handlers.
      transaction: async (fn: (tx: typeof handlers) => Promise<void>) => fn(handlers),
    },
  };
});

import { submitHostApplication, type HostApplyState } from '@/features/host-applications/actions';

const INITIAL: HostApplyState = { success: false };
const HOURS = 60 * 60 * 1000;

function applyForm() {
  const form = new FormData();
  form.set('displayName', 'Asir Highlands Walks');
  form.set(
    'bioEn',
    'Guided juniper-forest walks above Abha with a local family of mountain guides.',
  );
  form.append('languages', 'ar');
  form.append('languages', 'en');
  form.set('identityType', 'national_id');
  form.set('identityNumber', '1234567890');
  form.set('legalName', 'Saad bin Nasser Al-Shahrani');
  form.set('dateOfBirth', '1985-03-12');
  // Published SAMA example IBAN — checksum-valid by construction.
  form.set('iban', 'SA0380000000608010167519');
  form.set('bankName', 'Al Rajhi Bank');
  form.set('bankAccountHolder', 'Saad bin Nasser Al-Shahrani');
  form.set('termsAccepted', 'on');
  form.set('contactEmail', 'host@example.com');
  form.set('city', 'Abha');
  form.set('region', 'Asir');
  form.set('locale', 'en');
  return form;
}

async function runSubmit(form: FormData): Promise<HostApplyState | RedirectSentinel> {
  try {
    return await submitHostApplication(INITIAL, form);
  } catch (error) {
    if (error instanceof Error && 'redirectTo' in error) return error as RedirectSentinel;
    throw error;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  existingApp = undefined;
  updates.length = 0;
  insertedApplications.length = 0;
  insertedEvents.length = 0;
});

describe('submitHostApplication', () => {
  it('inserts a fresh application, logs the event, and redirects', async () => {
    const result = await runSubmit(applyForm());
    expect(result).toBeInstanceOf(Error);
    expect((result as RedirectSentinel).redirectTo.href).toBe('/host/apply/submitted');
    expect(insertedApplications).toHaveLength(1);
    expect(insertedApplications[0]).toMatchObject({ userId: 'user-1', status: 'pending' });
    expect(insertedEvents).toEqual([expect.objectContaining({ event: 'submitted' })]);
    expect(notifyAdmin).toHaveBeenCalledWith(
      'host_application_submitted',
      expect.objectContaining({ displayName: 'Asir Highlands Walks' }),
    );
  });

  it('blocks a refile inside the 24h post-rejection cooldown', async () => {
    existingApp = {
      id: 'app-1',
      status: 'rejected',
      reviewedAt: new Date(Date.now() - 2 * HOURS),
    };
    const result = await runSubmit(applyForm());
    expect(result).toMatchObject({ success: false, message: 'cooldown' });
    expect(updates).toHaveLength(0);
    expect(insertedEvents).toHaveLength(0);
  });

  it('accepts a refile once the cooldown has passed and resets to pending', async () => {
    existingApp = {
      id: 'app-1',
      status: 'rejected',
      reviewedAt: new Date(Date.now() - 25 * HOURS),
    };
    const result = await runSubmit(applyForm());
    expect(result).toBeInstanceOf(Error);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ status: 'pending', reviewerNotes: null, reviewedAt: null });
    expect(insertedEvents).toEqual([expect.objectContaining({ event: 'submitted' })]);
  });

  it('does not apply the cooldown to a pending resubmission', async () => {
    existingApp = { id: 'app-1', status: 'pending', reviewedAt: null };
    const result = await runSubmit(applyForm());
    expect(result).toBeInstanceOf(Error);
    expect(updates).toHaveLength(1);
  });
});
