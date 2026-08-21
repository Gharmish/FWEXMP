import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthUser } from '@/features/auth/types';

const getCurrentUser = vi.fn<() => Promise<AuthUser | null>>();
vi.mock('@/features/auth/queries', () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock('@/lib/env', () => ({ serverEnv: { DATABASE_URL: 'postgres://test' } }));

import { adminFailureMessage, adminGuard, requireAdminActor } from './guard';

const ADMIN_ID = 'a1b2c3d4-0000-4000-8000-000000000000';

function user(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: ADMIN_ID,
    phone: '+966500000000',
    email: undefined,
    isStub: false,
    isAdmin: true,
    mfa: { enrolled: true, verified: true },
    ...overrides,
  };
}

/**
 * The gate that stands between a first-factor-only session and every
 * admin write. The 2026-08-21 security audit found the second factor was
 * enforced on reads and on rendering but on none of the 40 mutating
 * actions or either PII export, because each of those carried its own
 * copy of the check. `adminGuard` is now derived from
 * `requireAdminActor`, so the negative cases below cover both.
 */
describe('requireAdminActor', () => {
  beforeEach(() => getCurrentUser.mockReset());

  it('returns the actor id for a verified admin', async () => {
    getCurrentUser.mockResolvedValue(user());
    await expect(requireAdminActor()).resolves.toEqual({ adminUserId: ADMIN_ID });
  });

  it('refuses a signed-out caller', async () => {
    getCurrentUser.mockResolvedValue(null);
    await expect(requireAdminActor()).resolves.toEqual({ reason: 'not_admin' });
  });

  it('refuses a signed-in non-admin', async () => {
    getCurrentUser.mockResolvedValue(user({ isAdmin: false }));
    await expect(requireAdminActor()).resolves.toEqual({ reason: 'not_admin' });
  });

  it('refuses an admin who has not completed the second factor', async () => {
    getCurrentUser.mockResolvedValue(user({ mfa: { enrolled: true, verified: false } }));
    await expect(requireAdminActor()).resolves.toEqual({ reason: 'mfa_required' });
  });

  it('refuses an admin who has never enrolled a factor', async () => {
    getCurrentUser.mockResolvedValue(user({ mfa: { enrolled: false, verified: false } }));
    await expect(requireAdminActor()).resolves.toEqual({ reason: 'mfa_required' });
  });

  it('lets stub-mode dev through — there is no Supabase and so no factor', async () => {
    getCurrentUser.mockResolvedValue(
      user({ isStub: true, mfa: { enrolled: false, verified: false } }),
    );
    await expect(requireAdminActor()).resolves.toEqual({ adminUserId: ADMIN_ID });
  });

  it('adminGuard mirrors it exactly, minus the id', async () => {
    getCurrentUser.mockResolvedValue(user());
    await expect(adminGuard()).resolves.toBeNull();
    getCurrentUser.mockResolvedValue(user({ mfa: { enrolled: true, verified: false } }));
    await expect(adminGuard()).resolves.toEqual({ reason: 'mfa_required' });
  });

  it('surfaces mfa_required to an action caller as forbidden, not as no_db', () => {
    expect(adminFailureMessage({ reason: 'mfa_required' })).toBe('forbidden');
    expect(adminFailureMessage({ reason: 'not_admin' })).toBe('forbidden');
    expect(adminFailureMessage({ reason: 'no_db' })).toBe('no_db');
  });
});

/**
 * Structural guard, not a behavioural one.
 *
 * `isAdminUser()` answers "does this session hold the admin role" and
 * says nothing about the second factor. Calling it directly from an
 * action or an admin route handler is how the audit's gap was written in
 * the first place — 18 files each grew their own `requireAdmin()`. This
 * fails the build if a new one appears.
 */
const REPO_ROOT = path.join(__dirname, '..', '..');

/** The enrolment flow is the one legitimate caller — see mfa-actions.ts. */
const ALLOWED = new Set(['features/admin/mfa-actions.ts']);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !entry.includes('.test.')) out.push(full);
  }
  return out;
}

describe('no admin write bypasses the second factor', () => {
  it('no server action reaches for isAdminUser instead of the shared gate', () => {
    const offenders = walk(path.join(REPO_ROOT, 'features'))
      .filter((file) => {
        const source = readFileSync(file, 'utf8');
        return source.includes("'use server'") && source.includes('isAdminUser');
      })
      .map((file) => path.relative(REPO_ROOT, file))
      .filter((rel) => !ALLOWED.has(rel));

    expect(offenders).toEqual([]);
  });

  it('no admin route handler reaches for isAdminUser instead of the shared gate', () => {
    const offenders = walk(path.join(REPO_ROOT, 'app', 'api'))
      .filter((file) => readFileSync(file, 'utf8').includes('isAdminUser'))
      .map((file) => path.relative(REPO_ROOT, file));

    expect(offenders).toEqual([]);
  });
});
