#!/usr/bin/env tsx
import { checkDb } from '@/lib/db-health';

/**
 * `pnpm db:check` — sanity-probe the database connection.
 *
 * Exit codes:
 *   0  — ok, or DATABASE_URL not configured (sample-data mode is valid)
 *   1  — connection or query error
 *
 * The "not configured" case is intentionally a soft pass: it's the
 * normal state until a developer pastes a Supabase URL into .env, and
 * we don't want CI to red on a perfectly valid sample-data build.
 */
async function main(): Promise<void> {
  const result = await checkDb();

  switch (result.status) {
    case 'not_configured':
      process.stdout.write(`⚫  ${result.message}\n`);
      process.exit(0);
    case 'ok': {
      const version = result.serverVersion ?? 'unknown server version';
      process.stdout.write(`✅  Database reachable in ${result.latencyMs}ms\n`);
      process.stdout.write(`    ${version}\n`);
      process.exit(0);
    }
    case 'error':
      process.stderr.write(`❌  Database check failed after ${result.latencyMs}ms\n`);
      process.stderr.write(`    ${result.message}\n`);
      process.exit(1);
  }
}

void main();
