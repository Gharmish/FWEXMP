import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Issue #56 (2026-10-12): the admin layout renders the TOTP screen IN
 * PLACE of `children`, but the App Router still renders the page segment
 * and serialises it into the flight payload. Admin queries re-gate with
 * `adminGuard()`; `getPlatformSettings` is core domain config shared far
 * beyond admin and cannot. Every admin page that reads it must stop on
 * `mfa_required` itself, before the read.
 */

const ADMIN = join(__dirname, '..', '..', 'app', '[locale]', 'admin');

function pages(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) pages(full, out);
    else if (name === 'page.tsx') out.push(full);
  }
  return out;
}

describe('admin pages stop on a pending second factor', () => {
  it('every page that reads platform settings handles mfa_required first', () => {
    const offenders = pages(ADMIN).filter((file) => {
      const src = readFileSync(file, 'utf8');
      const read = src.indexOf('getPlatformSettings(');
      if (read === -1) return false;
      const gate = src.indexOf("block?.reason === 'mfa_required'");
      return gate === -1 || gate > read;
    });
    expect(offenders.map((f) => relative(ADMIN, f))).toEqual([]);
  });
});
