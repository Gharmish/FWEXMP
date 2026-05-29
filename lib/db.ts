import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { serverEnv } from '@/lib/env';
import * as schema from '@/db/schema';

/**
 * Drizzle client over postgres.js (BRIEF §5: Postgres via Supabase,
 * Drizzle ORM).
 *
 * Lazily instantiated: importing this module never connects or throws,
 * so builds stay green while DATABASE_URL is absent (no page touches the
 * DB yet in Sprint 1). The connection is created on first use and a
 * clear error is thrown if DATABASE_URL is unset.
 *
 * Connection options, all required to stay healthy behind Supabase's
 * transaction-mode pgbouncer pooler (port 6543):
 *   - `prepare: false` — pgbouncer transaction mode can't keep named
 *     prepared statements across pooled backends.
 *   - `idle_timeout` — postgres.js defaults to keeping idle connections
 *     forever, but the pooler silently recycles idle server backends.
 *     Reusing one the pooler already dropped surfaces as
 *     `CONNECTION_CLOSED` / `invalid frontend message type 101`. Closing
 *     our side first (20s) avoids stale-connection reuse. This is
 *     invisible on Vercel — serverless invocations are too short-lived
 *     to go idle — but it breaks a long-lived dev server hard.
 *   - `max_lifetime` — recycle connections well before any upstream cap.
 *   - `connect_timeout` — fail fast instead of hanging a render.
 *
 * The client is cached on `globalThis` so Next.js dev HMR reuses one
 * pool instead of leaking a fresh pool (and its connections) on every
 * module re-evaluation.
 */
type Database = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as {
  __gharmishPgClient?: ReturnType<typeof postgres>;
};

let instance: Database | undefined;

export function getDb(): Database {
  if (!instance) {
    if (!serverEnv.DATABASE_URL) {
      throw new Error(
        'DATABASE_URL is not set. Copy .env.example to .env and add your Supabase connection string before using the database.',
      );
    }
    const client =
      globalForDb.__gharmishPgClient ??
      postgres(serverEnv.DATABASE_URL, {
        prepare: false,
        idle_timeout: 20,
        max_lifetime: 60 * 30,
        connect_timeout: 15,
      });
    if (process.env.NODE_ENV !== 'production') {
      globalForDb.__gharmishPgClient = client;
    }
    instance = drizzle(client, { schema, casing: 'snake_case' });
  }
  return instance;
}

/** Ergonomic accessor — proxies to the lazily-created client. */
export const db = new Proxy({} as Database, {
  get(_target, prop) {
    return getDb()[prop as keyof Database];
  },
});
