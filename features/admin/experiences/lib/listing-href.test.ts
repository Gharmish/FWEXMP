import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { adminListingHref } from './listing-href';

describe('adminListingHref', () => {
  it('links a live listing to its public page', () => {
    expect(adminListingHref('abha-walk', 'live')).toBe('/experiences/abha-walk');
  });

  it.each(['paused', 'draft', 'pending_review', 'changes_requested', 'archived'] as const)(
    'links a %s listing to the owner preview, since the public page 404s',
    (status) => {
      expect(adminListingHref('abha-walk', status)).toBe('/experiences/abha-walk?preview=1');
    },
  );
});

// The admin pages that list a listing next to its status must not link
// to the live-only public page directly.
describe('admin listing links', () => {
  const pages = [
    'app/[locale]/admin/hosts/[id]/page.tsx',
    'app/[locale]/admin/users/[key]/page.tsx',
    'app/[locale]/admin/experience-moderation/[id]/page.tsx',
  ];

  it.each(pages)('%s links listings through adminListingHref', (page) => {
    const source = readFileSync(join(process.cwd(), page), 'utf8');
    expect(source).toContain('adminListingHref(');
    expect(source).not.toMatch(/href=\{`\/experiences\/\$\{(exp|e|detail)\.slug\}`\}/);
  });
});
