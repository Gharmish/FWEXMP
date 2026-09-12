#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

/**
 * `pnpm db:preflight` — is the LIVE database ready for the code at HEAD?
 * (2026-09 engineering audit, second-pass verification F22/F23.)
 *
 * Read-only. Checks that every migration in db/migrations/meta/_journal.json
 * is recorded in drizzle's journal table, then spot-checks the schema facts
 * HEAD depends on. Run it against the production DATABASE_URL before
 * `vercel deploy --prod`; anything red means the deploy would write into a
 * schema that cannot take it.
 *
 * Exit codes: 0 all green · 1 something missing · 2 no DATABASE_URL.
 */
interface Check {
  label: string;
  sql: string;
}

/** Each query must return one row with a boolean `ok` column. */
const CHECKS: Check[] = [
  {
    label: "enum cancellation_kind has 'agent' (0033)",
    sql: `select exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
          where t.typname = 'cancellation_kind' and e.enumlabel = 'agent') as ok`,
  },
  {
    label: 'index bookings_promo_code_idx (0034)',
    sql: `select exists (select 1 from pg_indexes where indexname = 'bookings_promo_code_idx') as ok`,
  },
  {
    label: 'table web_vitals (0035)',
    sql: `select exists (select 1 from information_schema.tables
          where table_schema = 'public' and table_name = 'web_vitals') as ok`,
  },
  {
    label: 'guests.auth_user_id is uuid (0035)',
    sql: `select coalesce((select data_type = 'uuid' from information_schema.columns
          where table_schema = 'public' and table_name = 'guests' and column_name = 'auth_user_id'), false) as ok`,
  },
  {
    label: 'disputes.ticket_id foreign key (0035)',
    sql: `select exists (select 1 from pg_constraint
          where conname = 'disputes_ticket_id_support_tickets_id_fk' and convalidated) as ok`,
  },
  {
    label: "enum auth_throttle_kind has 'vital' (0036)",
    sql: `select exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
          where t.typname = 'auth_throttle_kind' and e.enumlabel = 'vital') as ok`,
  },
];

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    process.stdout.write('⚫  DATABASE_URL is not set — nothing to preflight.\n');
    process.exit(2);
  }
  const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 10 });
  let failures = 0;
  const report = (ok: boolean, label: string, extra = ''): void => {
    if (!ok) failures += 1;
    process.stdout.write(`${ok ? '✅' : '❌'}  ${label}${extra ? ` — ${extra}` : ''}\n`);
  };
  try {
    const journal = JSON.parse(
      readFileSync(path.resolve(__dirname, '../db/migrations/meta/_journal.json'), 'utf8'),
    ) as { entries: Array<{ tag: string; when: number }> };
    const [{ present }] = await sql<[{ present: boolean }]>`
      select exists (select 1 from information_schema.tables
        where table_schema = 'drizzle' and table_name = '__drizzle_migrations') as present`;
    if (!present) {
      report(
        false,
        'drizzle.__drizzle_migrations exists',
        'run supabase/2026-09-12-drizzle-journal-baseline.sql first',
      );
    } else {
      const applied = new Set(
        (
          await sql<
            Array<{ created_at: string }>
          >`select created_at from drizzle.__drizzle_migrations`
        ).map((r) => Number(r.created_at)),
      );
      const missing = journal.entries.filter((e) => !applied.has(e.when)).map((e) => e.tag);
      report(
        missing.length === 0,
        `journal: ${journal.entries.length - missing.length}/${journal.entries.length} migrations recorded`,
        missing.length ? `missing ${missing.join(', ')}` : '',
      );
    }
    for (const check of CHECKS) {
      const [row] = await sql.unsafe<[{ ok: boolean }]>(check.sql);
      report(Boolean(row?.ok), check.label);
    }
  } catch (error) {
    process.stderr.write(
      `❌  preflight failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    failures += 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
  process.stdout.write(
    failures === 0
      ? '\nAll green — the live schema can take HEAD.\n'
      : `\n${failures} check(s) red — apply the migrations above before deploying.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

void main();
