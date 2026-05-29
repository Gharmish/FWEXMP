import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit config. `db:generate` produces SQL migrations offline
 * (no DB needed); `db:push` / `db:studio` require a real connection.
 *
 * Prefer DIRECT_URL (session-mode pooler, port 5432) over DATABASE_URL
 * (transaction-mode pooler, port 6543). Drizzle-kit fans out parallel
 * introspection queries; pgbouncer transaction mode muxes them across
 * backend connections and corrupts the responses, which surfaces as a
 * bogus "Cannot read properties of undefined (reading 'replace')" in
 * the CHECK-constraint path of bin.cjs.
 */
export default defineConfig({
  schema: './db/schema.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  casing: 'snake_case',
  dbCredentials: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '',
  },
  verbose: true,
  strict: true,
});
