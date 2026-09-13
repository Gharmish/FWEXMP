import { describe, expect, it } from 'vitest';
import en from '@/messages/en.json';
import ar from '@/messages/ar.json';
import { icuArgs } from '@/test/icu';
import { HOSTING_FAQ_KEYS, hostingFaqValues } from './faq';

/**
 * The /hosting page formats `helpFaq.items.*` and `hosting.stages.*` with
 * one values object. A placeholder the catalog uses but the page does not
 * provide is a FORMATTING_ERROR on every render (2026-09-13 runtime logs:
 * `refundRail` missing since 2026-09-06). Pin the argument sets together.
 */

type FaqItems = Record<string, { q: string; a: string }>;

const provided = new Set(
  Object.keys(hostingFaqValues({ approvalWindowHours: 24, refundsViaBankTransfer: true })),
);

const catalogs = [
  ['en', en.helpFaq.items, en.hosting.stages],
  ['ar', ar.helpFaq.items, ar.hosting.stages],
] as const;

describe('hosting page copy arguments', () => {
  it.each(catalogs)('%s: every placeholder of the shown FAQ items is provided', (_, items) => {
    const faq: FaqItems = items;
    const missing: string[] = [];
    for (const key of HOSTING_FAQ_KEYS) {
      for (const field of ['q', 'a'] as const) {
        for (const arg of icuArgs(faq[key][field])) {
          if (!provided.has(arg)) missing.push(`helpFaq.items.${key}.${field}: {${arg}}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it.each(catalogs)('%s: every placeholder of the stages copy is provided', (_, __, stages) => {
    const missing: string[] = [];
    for (const [key, value] of Object.entries(stages)) {
      // `heading` sits beside the four stage objects.
      if (typeof value !== 'object' || value === null || !('body' in value)) continue;
      for (const arg of icuArgs(value.body)) {
        if (!provided.has(arg)) missing.push(`hosting.stages.${key}.body: {${arg}}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('selects the bank-transfer wording only while the manual rail is on', () => {
    expect(hostingFaqValues({ approvalWindowHours: 24, refundsViaBankTransfer: true }).refundRail).toBe(
      'bank',
    );
    expect(
      hostingFaqValues({ approvalWindowHours: 24, refundsViaBankTransfer: false }).refundRail,
    ).toBe('card');
  });
});
