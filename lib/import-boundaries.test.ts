import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Layer rules, enforced without an ESLint plugin (2026-09 engineering
 * audit DEPS-05 / ARCH-02 / ARCH-03 / ARCH-05):
 *
 *   app/        → may import anything
 *   features/   → never imports app/
 *   components/ → never imports app/ or features/ (layout shells get their
 *                 data from the layout that renders them — ARCH-12)
 *   lib/        → never imports app/, features/ or components/: it is the
 *                 leaf layer every feature builds on
 *   features/auth → never imports features/admin (ARCH-02): the identity
 *                 layer (session, roles, MFA) sits under the admin feature,
 *                 never beside it, so the pair cannot become a cycle
 *
 * Tests are exempt (they mock whatever they need). Add an entry to
 * ALLOWED only with a comment saying why the dependency is legitimate.
 */

const ROOT = join(__dirname, '..');
const ALLOWED: ReadonlySet<string> = new Set<string>([
  // `signOut` is a server action; the shell button must post to it.
  'components/layout/sign-out-button.tsx → features/auth/actions',
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

function imports(file: string): string[] {
  const src = readFileSync(file, 'utf8');
  return [...src.matchAll(/from\s+'(@\/[^']+)'/g)].map((m) => m[1].slice(2));
}

function violations(layer: string, forbidden: string[]): string[] {
  const out: string[] = [];
  for (const file of walk(join(ROOT, layer))) {
    const rel = relative(ROOT, file);
    for (const target of imports(file)) {
      const top = target.split('/')[0];
      if (!forbidden.includes(top)) continue;
      const key = `${rel} → ${target}`;
      if (!ALLOWED.has(key)) out.push(key);
    }
  }
  return out.sort();
}

describe('import boundaries', () => {
  it('features never import app/', () => {
    expect(violations('features', ['app'])).toEqual([]);
  });

  it('components never import app/ or features/', () => {
    expect(violations('components', ['app', 'features'])).toEqual([]);
  });

  it('lib is a leaf: never imports app/, features/ or components/', () => {
    expect(violations('lib', ['app', 'features', 'components'])).toEqual([]);
  });

  it('features/auth never imports features/admin (ARCH-02)', () => {
    const out: string[] = [];
    for (const file of walk(join(ROOT, 'features/auth'))) {
      for (const target of imports(file)) {
        if (target.startsWith('features/admin/')) out.push(`${relative(ROOT, file)} → ${target}`);
      }
    }
    expect(out).toEqual([]);
  });
});
