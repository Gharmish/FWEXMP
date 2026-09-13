import { faqSettingsValues } from '@/lib/platform-settings';

/** The `helpFaq.items.*` entries the public /hosting page shows — a subset of /help. */
export const HOSTING_FAQ_KEYS = [
  'becomeHost',
  'requestWindow',
  'payout',
  'hostCancel',
  'editListing',
] as const;

export type HostingFaqSettings = Parameters<typeof faqSettingsValues>[0];

/**
 * Every ICU argument those entries (and the `hosting.stages.*` copy) use —
 * the settings-derived set shared with /help and the support agent
 * (lib/platform-settings.ts). `faq.test.ts` pins it to both catalogs.
 */
export function hostingFaqValues(settings: HostingFaqSettings) {
  return faqSettingsValues(settings);
}
