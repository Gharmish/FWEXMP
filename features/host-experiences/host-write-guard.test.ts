import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Structural pin for host-side authorization (2026-09 engineering audit
 * TEST-10). The admin side has features/admin/guard.test.ts asserting that
 * every admin write goes through requireAdminActor; the host side had no
 * equivalent, although host actions are the only thing stopping host A
 * from editing host B's listings, bookings, profile or payout IBAN.
 *
 * Every 'use server' module under features/host-* must resolve the acting
 * host through one of the session-derived resolvers below (or through
 * `requireOwnership`, which wraps one). A new host action that forgets to
 * fails this test before it ships.
 */

const ROOT = path.resolve(__dirname, '..');
const RESOLVERS = [
  'getCurrentHostIdForWrite',
  'getCurrentHostRef',
  'getCurrentHostId',
  'requireOwnership',
  'getCurrentHostForWrite',
];

/**
 * The other sanctioned shape: resolve the signed-in user, then read the
 * host row by `hosts.userId = user.id` (host-profile, host-earnings). What
 * matters is that the host identity comes from the session and never from
 * a form field.
 */
function scopesBySessionUser(src: string): boolean {
  return src.includes('getCurrentUser(') && /eq\(h(?:osts)?\.userId,\s*user\.id\)/.test(src);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.ts$/.test(entry) && !/\.test\.ts$/.test(entry)) out.push(full);
  }
  return out;
}

describe('host server actions resolve the acting host from the session', () => {
  const hostFeatures = readdirSync(ROOT).filter((d) => d.startsWith('host-'));

  it('covers the host feature folders', () => {
    expect(hostFeatures.length).toBeGreaterThanOrEqual(4);
  });

  it("every 'use server' module under features/host-* uses a host resolver", () => {
    const offenders: string[] = [];
    for (const feature of hostFeatures) {
      // host-applications is the APPLICANT side (a signed-in user who is
      // not yet a host) and is guarded by getCurrentUser — out of scope.
      if (feature === 'host-applications') continue;
      for (const file of walk(path.join(ROOT, feature))) {
        const src = readFileSync(file, 'utf8');
        if (!/^'use server';/m.test(src)) continue;
        if (!RESOLVERS.some((r) => src.includes(r)) && !scopesBySessionUser(src)) {
          offenders.push(path.relative(ROOT, file));
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
