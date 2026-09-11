import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * Schema provenance guard (2026-09 engineering audit DATA-01). Between
 * 2026-08-02 and 2026-09-11 eight tables were added to db/schema.ts and
 * applied to production by hand while the Drizzle journal stood still, so
 * the repository could no longer reproduce the live schema. These checks
 * make that drift a failing test instead of a discovery:
 *
 *  - every `pgTable` in db/schema.ts appears in the LATEST migration
 *    snapshot (so `pnpm db:generate` was run after the schema change);
 *  - the snapshot has no table the schema lacks (a dropped table needs a
 *    migration too);
 *  - the journal, the *.sql files and the *_snapshot.json files agree.
 *
 * Pure filesystem — no database. When this fails, run `pnpm db:generate`,
 * review the SQL, and commit it with the schema change.
 */

const ROOT = path.resolve(__dirname, '..');
const MIGRATIONS = path.join(ROOT, 'db', 'migrations');
const META = path.join(MIGRATIONS, 'meta');

function schemaTables(): Set<string> {
  const src = readFileSync(path.join(ROOT, 'db', 'schema.ts'), 'utf8');
  return new Set([...src.matchAll(/pgTable\(\s*'([a-z_0-9]+)'/g)].map((m) => m[1]));
}

interface Journal {
  entries: Array<{ idx: number; tag: string }>;
}

function journal(): Journal {
  return JSON.parse(readFileSync(path.join(META, '_journal.json'), 'utf8')) as Journal;
}

function latestSnapshotTables(j: Journal): Set<string> {
  const last = j.entries.at(-1);
  if (!last) throw new Error('empty migration journal');
  const idx = String(last.idx).padStart(4, '0');
  const snap = JSON.parse(readFileSync(path.join(META, `${idx}_snapshot.json`), 'utf8')) as {
    tables: Record<string, unknown>;
  };
  return new Set(Object.keys(snap.tables).map((k) => k.split('.').at(-1) ?? k));
}

describe('db/schema.ts vs the migration snapshot', () => {
  const j = journal();

  it('every schema table is in the latest snapshot (run pnpm db:generate)', () => {
    const missing = [...schemaTables()].filter((t) => !latestSnapshotTables(j).has(t)).sort();
    expect(missing).toEqual([]);
  });

  it('the latest snapshot has no table the schema dropped', () => {
    const stale = [...latestSnapshotTables(j)].filter((t) => !schemaTables().has(t)).sort();
    expect(stale).toEqual([]);
  });

  it('journal entries, SQL files and snapshots agree', () => {
    const sql = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    const snapshots = readdirSync(META)
      .filter((f) => f.endsWith('_snapshot.json'))
      .sort();
    expect(sql).toHaveLength(j.entries.length);
    expect(snapshots).toHaveLength(j.entries.length);
    for (const entry of j.entries) {
      expect(sql).toContain(`${entry.tag}.sql`);
    }
    // Contiguous, zero-based indexes — a skipped or duplicated idx is how
    // two sessions' parallel generates collide.
    expect(j.entries.map((e) => e.idx)).toEqual(j.entries.map((_, i) => i));
  });
});
