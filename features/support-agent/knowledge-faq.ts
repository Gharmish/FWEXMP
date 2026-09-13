import { faqSettingsValues } from '@/lib/platform-settings';

/** The `helpFaq.items.*` entries the agent's knowledge base recites. */
export const KNOWLEDGE_FAQ_KEYS = [
  'booking',
  'payment',
  'pending',
  'cancel',
  'contactHost',
  'becomeHost',
  'payout',
  'hostCancel',
  'requestWindow',
  'editListing',
] as const;

export interface KnowledgeFaqInputs {
  settings: Parameters<typeof faqSettingsValues>[0];
  tierDesc: { flexible: string; moderate: string; strict: string };
  graceHours: number;
  graceLead: number;
}

/**
 * Every ICU argument those entries use. Kept pure (no next-intl, no
 * server-only) so knowledge-faq.test.ts can pin the set to both catalogs;
 * `hostCancel.a` had been formatted without `refundRail` since 2026-09-05
 * and the agent's prompt carried the raw key (2026-09-13 review).
 */
export function knowledgeFaqValues({ settings, tierDesc, graceHours, graceLead }: KnowledgeFaqInputs) {
  return {
    ...faqSettingsValues(settings),
    flexDesc: tierDesc.flexible,
    modDesc: tierDesc.moderate,
    strictDesc: tierDesc.strict,
    graceHours,
    graceLead,
  };
}
