import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
const env = vi.hoisted(() => ({ DATABASE_URL: 'postgres://test', ADMIN_PHONES: '+966541104000' }));
vi.mock('@/lib/env', () => ({ serverEnv: env }));

let row: { revokedAt: Date | null } | undefined;
let fail = false;
vi.mock('@/lib/db', () => ({
  db: {
    query: {
      userRoles: {
        findFirst: async () => {
          if (fail) throw new Error('pooler down');
          return row;
        },
      },
    },
  },
}));

import { resolveIsAdmin } from './admin-roles';

const OWNER = '+966541104000';
const OTHER = '+966500000001';

beforeEach(() => {
  row = undefined;
  fail = false;
  env.DATABASE_URL = 'postgres://test';
});

describe('resolveIsAdmin (2026-09 engineering audit SEC-07)', () => {
  it('grants on a live table row regardless of the env allowlist', async () => {
    row = { revokedAt: null };
    expect(await resolveIsAdmin('u1', OTHER)).toBe(true);
  });

  it('a revoked row beats the env allowlist', async () => {
    row = { revokedAt: new Date('2026-09-01T00:00:00Z') };
    expect(await resolveIsAdmin('u1', OWNER)).toBe(false);
  });

  it('falls back to the bootstrap allowlist only when no row exists', async () => {
    expect(await resolveIsAdmin('u1', OWNER)).toBe(true);
    expect(await resolveIsAdmin('u1', OTHER)).toBe(false);
  });

  it('fails closed for table admins on a DB error but keeps the env owner in', async () => {
    fail = true;
    expect(await resolveIsAdmin('u1', OTHER)).toBe(false);
    expect(await resolveIsAdmin('u1', OWNER)).toBe(true);
  });

  it('uses the allowlist alone in sample-data mode', async () => {
    env.DATABASE_URL = '';
    expect(await resolveIsAdmin('u1', OWNER)).toBe(true);
  });
});
