import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Every `revalidatePath(...)` literal must name a route that exists
 * (2026-09 engineering audit ACTIONS-02). Next derives a page's implicit
 * cache tag from its FULL route string — route groups included — so
 * `'/[locale]/host/bookings'` never matched the page that actually lives
 * at `app/[locale]/host/(dashboard)/bookings`, and 50 invalidations were
 * silent no-ops. Template literals are refused too: the cached entry is
 * keyed by the dynamic-segment template (`[id]`), not by a concrete id.
 */

const ROOT = path.resolve(__dirname, '..');
const CALL = /revalidatePath\(\s*(['"`])([^'"`]*)\1\s*(?:,\s*'(page|layout)')?\s*\)/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

interface Site {
  file: string;
  quote: string;
  route: string;
  type: string;
}

function sites(): Site[] {
  const found: Site[] = [];
  for (const dir of ['features', 'app', 'lib']) {
    for (const file of walk(path.join(ROOT, dir))) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(CALL)) {
        found.push({
          file: path.relative(ROOT, file),
          quote: m[1],
          route: m[2],
          type: m[3] ?? 'page',
        });
      }
    }
  }
  return found;
}

describe('revalidatePath literals', () => {
  const all = sites();

  it('finds call sites (sanity)', () => {
    expect(all.length).toBeGreaterThan(30);
  });

  it('never uses template literals — cache entries are keyed by the segment template', () => {
    const templated = all.filter((s) => s.quote === '`' || s.route.includes('${'));
    expect(templated.map((s) => `${s.file}: ${s.route}`)).toEqual([]);
  });

  it('every path exists under app/ with the matching page.tsx or layout.tsx', () => {
    const missing = all
      .filter((s) => {
        const target = path.join(ROOT, 'app', s.route, `${s.type}.tsx`);
        return !existsSync(target);
      })
      .map((s) => `${s.file}: revalidatePath('${s.route}', '${s.type}')`);
    expect(missing).toEqual([]);
  });
});
