import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serverEnv } from '@/lib/env';

/**
 * Connection-health probe for the Postgres database. Designed to be safe
 * to call from anywhere — never throws — so it can power a health-check
 * endpoint, a CI gate, or the `pnpm db:check` CLI without each caller
 * having to reinvent error handling.
 *
 * Returns a discriminated union: callers narrow on `status` to decide
 * what to log / exit with. The 'not_configured' case is reachable
 * intentionally (DATABASE_URL is optional during sample-data-only
 * development) and is not a failure.
 */
export type DbHealth =
  | { status: 'not_configured'; message: string }
  | { status: 'ok'; latencyMs: number; serverVersion: string | null }
  | { status: 'error'; message: string; latencyMs: number };

type VersionRow = { version: string } & Record<string, unknown>;

export async function checkDb(): Promise<DbHealth> {
  if (!serverEnv.DATABASE_URL) {
    return {
      status: 'not_configured',
      message:
        'DATABASE_URL is not set — the app falls back to in-repo sample data. Add a Supabase connection string to .env to flip on persistence.',
    };
  }

  const start = performance.now();
  try {
    // version() probes connectivity, auth, and that we can read
    // pg_catalog — a stricter signal than SELECT 1, since SELECT 1 can
    // pass under role misconfigurations that block real queries.
    const rows = await db.execute<VersionRow>(sql`SELECT version() AS version`);
    const latencyMs = Math.round(performance.now() - start);
    return {
      status: 'ok',
      latencyMs,
      serverVersion: rows[0]?.version ?? null,
    };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
      latencyMs: Math.round(performance.now() - start),
    };
  }
}
