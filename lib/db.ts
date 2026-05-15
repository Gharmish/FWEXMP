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
 * `prepare: false` keeps us safe behind Supabase's transaction-mode
 * pgbouncer pooler.
 */
type Database = PostgresJsDatabase<typeof schema>;

let instance: Database | undefined;

export function getDb(): Database {
  if (!instance) {
    if (!serverEnv.DATABASE_URL) {
      throw new Error(
        'DATABASE_URL is not set. Copy .env.example to .env and add your Supabase connection string before using the database.',
      );
    }
    const client = postgres(serverEnv.DATABASE_URL, { prepare: false });
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
