import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '@/messages/en.json';
import { CLIENT_NAMESPACES, clientNamespacesFor, pickClientMessages } from './client-messages';

const ROOT = join(__dirname, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.tsx') && !name.endsWith('.test.tsx')) out.push(full);
  }
  return out;
}

/** Top-level namespace of every `useTranslations('…')` in a client component. */
function clientNamespaceUses(): Array<{ file: string; ns: string }> {
  const uses: Array<{ file: string; ns: string }> = [];
  for (const layer of ['app', 'features', 'components']) {
    for (const file of walk(join(ROOT, layer))) {
      const src = readFileSync(file, 'utf8');
      if (!/^\s*'use client';/m.test(src)) continue;
      for (const m of src.matchAll(/useTranslations\('([A-Za-z0-9]+)(?:\.[A-Za-z0-9.]+)?'\)/g)) {
        uses.push({ file: relative(ROOT, file), ns: m[1] });
      }
    }
  }
  return uses;
}

const ALL = new Set<string>([
  ...CLIENT_NAMESPACES.base,
  ...CLIENT_NAMESPACES.admin,
  ...CLIENT_NAMESPACES.host,
]);

/** Components that read a dashboard namespace but render only inside that dashboard. */
const RENDERED_IN_DASHBOARD = new Set<string>([
  // Rendered by app/[locale]/host/(dashboard)/page.tsx only.
  'features/hosts/components/host-share-card.tsx',
]);

describe('client message namespaces', () => {
  it('every namespace a client component reads is shipped somewhere', () => {
    const missing = clientNamespaceUses()
      .filter((u) => !ALL.has(u.ns))
      .map((u) => `${u.file}: ${u.ns}`);
    expect(missing).toEqual([]);
  });

  it('admin and host namespaces are used only under their own routes', () => {
    const misplaced = clientNamespaceUses()
      .filter((u) => !RENDERED_IN_DASHBOARD.has(u.file))
      .filter(
        (u) =>
          (CLIENT_NAMESPACES.admin.includes(u.ns as 'admin') &&
            !/^(app\/\[locale\]\/admin|features\/admin)\//.test(u.file)) ||
          (CLIENT_NAMESPACES.host.includes(u.ns as 'hostDashboard') &&
            !/^(app\/\[locale\]\/host|features\/host-)/.test(u.file)),
      )
      .map((u) => `${u.file}: ${u.ns}`);
    expect(misplaced).toEqual([]);
  });

  it('every shipped namespace exists in the catalog', () => {
    expect([...ALL].filter((ns) => !(ns in en))).toEqual([]);
  });

  it('a public page gets neither dashboard namespace; dashboards get theirs', () => {
    expect(clientNamespacesFor('/en/experiences')).not.toContain('admin');
    expect(clientNamespacesFor('/ar/admin/bookings')).toContain('admin');
    expect(clientNamespacesFor('/en/host/bookings')).toContain('hostDashboard');
    expect(clientNamespacesFor(null)).toEqual(expect.arrayContaining(['admin', 'hostDashboard']));
    const picked = pickClientMessages(en, '/en/experiences');
    expect(Object.keys(picked)).not.toContain('admin');
    expect(picked.common).toBe(en.common);
  });
});
