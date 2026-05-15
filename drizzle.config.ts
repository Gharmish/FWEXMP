import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit config. `db:generate` produces SQL migrations offline
 * (no DB needed); `db:push` / `db:studio` require a real DATABASE_URL.
 */
export default defineConfig({
  schema: './db/schema.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  casing: 'snake_case',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  verbose: true,
  strict: true,
});
