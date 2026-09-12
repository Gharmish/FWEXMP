import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { KNOWN_ROOTS, collapseVitalsPath } from './vitals-path';

/**
 * Every dynamic route under app/ must collapse to a placeholder, so a
 * future `[id]`-shaped segment cannot leak a reference or a name into
 * the vitals table (2026-09 engineering audit, second-pass verification
 * F17). Sample values look like what the route actually receives.
 */
const APP = path.resolve(__dirname, '../../app');
const SAMPLE: Record<string, string> = {
  '[locale]': 'ar',
  '[slug]': 'abha-sunrise-hike',
  '[id]': 'a2f4c1e0-9b8d-4c2a-8f1e-6d5b4a3c2e10',
  '[ref]': 'GH-7K2M9Q',
  '[reference]': 'a2f4c1e0-9b8d-4c2a-8f1e-6d5b4a3c2e10',
  '[key]': 'auth:a2f4c1e0-9b8d-4c2a-8f1e-6d5b4a3c2e10',
  '[payoutId]': 'a2f4c1e0-9b8d-4c2a-8f1e-6d5b4a3c2e10',
};

function routes(dir: string, segments: string[] = [], out: string[][] = []): string[][] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (!statSync(full).isDirectory()) continue;
    if (entry === 'api' || entry.startsWith('[...')) continue;
    const next = entry.startsWith('(') ? segments : [...segments, entry];
    if (entry.startsWith('[')) out.push(next);
    routes(full, next, out);
  }
  return out;
}

describe('KNOWN_ROOTS covers every top-level route the app serves', () => {
  it('lists each first segment under app/[locale] (route groups flattened)', () => {
    const roots = new Set<string>();
    const visit = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (!statSync(full).isDirectory()) continue;
        if (entry.startsWith('(')) visit(full);
        else if (!entry.startsWith('[')) roots.add(entry);
      }
    };
    visit(path.join(APP, '[locale]'));
    expect([...roots].filter((r) => !KNOWN_ROOTS.has(r))).toEqual([]);
  });
});

describe('collapseVitalsPath over every dynamic route in app/', () => {
  const dynamic = routes(APP).filter((segs) => segs.some((s) => s.startsWith('[')));

  it('found the dynamic routes', () => {
    expect(dynamic.length).toBeGreaterThan(5);
  });

  it.each(dynamic.map((segs) => ['/' + segs.join('/')]))('%s', (template) => {
    const parts = template.split('/').filter(Boolean);
    const concrete =
      '/' +
      parts
        .map((seg) => {
          if (!seg.startsWith('[')) return seg;
          const sample = SAMPLE[seg];
          if (!sample) throw new Error(`no sample value for ${seg} — add one to SAMPLE`);
          return sample;
        })
        .join('/');
    const { path: collapsed } = collapseVitalsPath(concrete);
    for (const seg of parts) {
      if (seg === '[locale]') continue;
      if (seg.startsWith('[')) expect(collapsed).not.toContain(SAMPLE[seg]);
    }
    expect(collapsed).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
    expect(collapsed).not.toMatch(/GH-[A-Z0-9]{6}/);
  });
});
