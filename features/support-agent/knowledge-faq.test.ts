import { describe, expect, it } from 'vitest';
import en from '@/messages/en.json';
import ar from '@/messages/ar.json';
import { icuArgs } from '@/test/icu';
import { KNOWLEDGE_FAQ_KEYS, knowledgeFaqValues } from './knowledge-faq';

/**
 * The agent's knowledge base recites `helpFaq.items.*` with one values
 * object. A placeholder the catalog uses but the values omit is a
 * FORMATTING_ERROR and the raw key lands in the model's prompt — which is
 * what happened to `hostCancel.a` (`refundRail`) from 2026-09-05 until the
 * 2026-09-13 review. Pin the argument set to both catalogs.
 */

type FaqItems = Record<string, { q: string; a: string }>;

const provided = new Set(
  Object.keys(
    knowledgeFaqValues({
      settings: { approvalWindowHours: 24, refundsViaBankTransfer: true },
      tierDesc: { flexible: 'f', moderate: 'm', strict: 's' },
      graceHours: 24,
      graceLead: 72,
    }),
  ),
);

describe('support-agent knowledge FAQ arguments', () => {
  it.each([
    ['en', en.helpFaq.items],
    ['ar', ar.helpFaq.items],
  ] as const)('%s: every placeholder of the recited items is provided', (_, items) => {
    const faq: FaqItems = items;
    const missing: string[] = [];
    for (const key of KNOWLEDGE_FAQ_KEYS) {
      for (const field of ['q', 'a'] as const) {
        for (const arg of icuArgs(faq[key][field])) {
          if (!provided.has(arg)) missing.push(`helpFaq.items.${key}.${field}: {${arg}}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('carries the refund rail from the settings', () => {
    const values = knowledgeFaqValues({
      settings: { approvalWindowHours: 24, refundsViaBankTransfer: false },
      tierDesc: { flexible: 'f', moderate: 'm', strict: 's' },
      graceHours: 24,
      graceLead: 72,
    });
    expect(values.refundRail).toBe('card');
    expect(values.approvalHours).toBe(24);
    expect(values.flexDesc).toBe('f');
  });
});
