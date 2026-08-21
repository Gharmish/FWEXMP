import 'server-only';

import { getTranslations } from 'next-intl/server';
import { SITE_URL, SUPPORT_EMAIL } from '@/lib/site';
import { getPlatformSettings } from '@/lib/platform-settings';
import { getCancellationTiers } from '@/lib/cancellation-policy';
import { GRACE_MIN_LEAD_HOURS, POST_BOOKING_GRACE_HOURS } from '@/features/bookings/lib/policy';
import { tierDescriptions } from '@/features/bookings/lib/policy-copy';

/**
 * The agent's knowledge base, rendered from the SAME strings the public
 * site shows (help FAQ, cancellation tiers, platform settings) so the
 * bot can never contradict the page a guest might be reading. Bilingual
 * on purpose: the model answers in the guest's language and the facts
 * are identical in both. Cached per process for ten minutes — it sits
 * in the cached prefix of the prompt, so it must also be byte-stable
 * between requests.
 */

const FAQ_KEYS = [
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

let cached: { at: number; text: string } | null = null;
const TTL_MS = 10 * 60 * 1000;

export async function buildKnowledge(): Promise<string> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.text;
  const [settings, tiers] = await Promise.all([getPlatformSettings(), getCancellationTiers()]);
  const sections: string[] = [];
  for (const locale of ['en', 'ar'] as const) {
    const [t, tTiers] = await Promise.all([
      getTranslations({ locale, namespace: 'helpFaq' }),
      getTranslations({ locale, namespace: 'cancellationTiers' }),
    ]);
    const tierDesc = tierDescriptions(tiers, tTiers);
    const values = {
      approvalHours: settings.approvalWindowHours,
      flexDesc: tierDesc.flexible,
      modDesc: tierDesc.moderate,
      strictDesc: tierDesc.strict,
      graceHours: POST_BOOKING_GRACE_HOURS,
      graceLead: GRACE_MIN_LEAD_HOURS,
    };
    const lines = FAQ_KEYS.map(
      (key) => `Q: ${t(`items.${key}.q`, values)}\nA: ${t(`items.${key}.a`, values)}`,
    );
    sections.push(`## FAQ (${locale === 'en' ? 'English' : 'Arabic'})\n\n${lines.join('\n\n')}`);
  }
  const facts = [
    '## Platform facts',
    `- Website: ${SITE_URL} (Arabic at ${SITE_URL}/ar, English at ${SITE_URL}/en).`,
    `- Support email: ${SUPPORT_EMAIL}.`,
    `- Host decision window for request-to-book: ${settings.approvalWindowHours} hours.`,
    `- Post-booking grace: cancelling within ${POST_BOOKING_GRACE_HOURS} hours of booking refunds in full when the start is at least ${GRACE_MIN_LEAD_HOURS} hours away.`,
    '- Reschedule: one free move to another open date, before the tier cutoff.',
    '- Payments: mada, Visa, Mastercard, Apple Pay. Prices are in SAR and VAT-inclusive.',
    '- Refunds: paid by bank transfer to the account the guest provides (bank name, account holder name, Saudi IBAN), wired by the Gharmish team within a few business days of the cancellation. Not returned to the card.',
    '- Gharmish does not provide insurance; hosts carry liability for their experiences.',
    '- Emergency numbers in Saudi Arabia: 911 (unified), 997 (ambulance), 998 (civil defence).',
  ];
  sections.push(facts.join('\n'));
  const text = sections.join('\n\n');
  cached = { at: Date.now(), text };
  return text;
}
