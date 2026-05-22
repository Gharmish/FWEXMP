import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/**
 * Only the 'not_configured' branch is testable without a real Postgres.
 * The success + error branches depend on a real (or test-container)
 * database; they're left for a Sprint 3+ integration test once
 * DATABASE_URL lands.
 *
 * We mock @/lib/env so we can flip DATABASE_URL between tests without
 * mutating process.env (which is shared across the test runner).
 */

vi.mock('@/lib/env', () => ({
  serverEnv: { DATABASE_URL: '', NODE_ENV: 'test' },
}));

describe('checkDb (not configured)', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock('@/lib/env');
  });

  it('returns not_configured with a helpful message when DATABASE_URL is empty', async () => {
    const { checkDb } = await import('./db-health');
    const result = await checkDb();
    expect(result.status).toBe('not_configured');
    if (result.status === 'not_configured') {
      expect(result.message).toMatch(/DATABASE_URL/);
      expect(result.message).toMatch(/sample data/i);
    }
  });
});
