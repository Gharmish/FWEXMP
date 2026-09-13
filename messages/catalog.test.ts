import { describe, expect, it } from 'vitest';
import { createTranslator } from 'next-intl';
import en from './en.json';
import ar from './ar.json';
import { icuArgs, icuDummyArgValues, icuDummyTagValues, icuTags } from '@/test/icu';

/**
 * Message-catalog integrity (2026-09 engineering audit I18N-04 / I18N-05).
 * en.json and ar.json were in perfect parity by hand — 3,461 keys — with
 * nothing guarding it while several sessions edit both files in a shared
 * checkout. The first missing key renders as a raw `namespace.key` on the
 * live Arabic site; the first Arabic-Indic digit breaks BRIEF §4.
 */

type Catalog = Record<string, unknown>;

function flatten(
  obj: Catalog,
  prefix = '',
  out: Record<string, string> = {},
): Record<string, string> {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') flatten(v as Catalog, key, out);
    else if (typeof v === 'string') out[key] = v;
  }
  return out;
}
const EN = flatten(en);
const AR = flatten(ar);

/** Values that are legitimately identical in both locales. */
const IDENTICAL_ALLOWLIST = new Set([
  'auth.phonePlaceholder',
  'auth.emailPlaceholder',
  'admin.settings.vatRateSuffix',
  'admin.settings.policyPctSuffix',
  'hostProfileSettings.contact.phonePlaceholder',
  'hostBookings.calendar.cell',
  'hostExperiences.commission.pctValue',
  // The ENGLISH inclusions / what-to-bring fields show English examples in
  // both locales on purpose — the placeholder demonstrates what to type.
  'hostExperiences.form.inclusionsPlaceholder',
  'hostExperiences.form.whatToBringPlaceholder',
  // …and the Arabic fields show Arabic examples in both locales.
  'hostExperiences.form.inclusionsArPlaceholder',
  'hostExperiences.form.whatToBringArPlaceholder',
  'hostExperiences.form.counter',
  'experiencesIndex.price.200-500',
  'experiencesIndex.price.500-1000',
  'availabilityCalendar.spots',
  'bookingRequest.phonePlaceholder',
  'payment.methodApplePay',
  'notFound.eyebrow',
  'reviews.charCount',
  'footer.brandApplePay',
  // A statistics label, identical in both scripts.
  'admin.analytics.vitals.p75',
]);

/** Keys whose Arabic deliberately drops an argument (shorter titles). */
const ARG_DIFF_ALLOWLIST = new Set([
  'hostProfile.meta.title',
  'ogImage.host.unverified',
  // Arabic nests `{formatted}` inside the plural so the dual form
  // (تجربتان already means "two") prints without a redundant digit.
  'ogImage.host.experienceCount',
]);

describe('messages/en.json vs messages/ar.json', () => {
  it('have identical key sets', () => {
    const onlyEn = Object.keys(EN).filter((k) => !(k in AR));
    const onlyAr = Object.keys(AR).filter((k) => !(k in EN));
    expect(onlyEn).toEqual([]);
    expect(onlyAr).toEqual([]);
  });

  it('use the same ICU arguments per key', () => {
    const diffs = Object.keys(EN)
      .filter((k) => k in AR && !ARG_DIFF_ALLOWLIST.has(k))
      .filter((k) => {
        const a = icuArgs(EN[k]);
        const b = icuArgs(AR[k]);
        return a.size !== b.size || [...a].some((x) => !b.has(x));
      })
      .map(
        (k) => `${k}: en ${[...icuArgs(EN[k])].join(',')} | ar ${[...icuArgs(AR[k])].join(',')}`,
      );
    expect(diffs).toEqual([]);
  });

  it('never carry Arabic-Indic digits (BRIEF §4: Latin digits in both locales)', () => {
    const hits = Object.entries(AR)
      .filter(([, v]) => /[٠-٩]/.test(v))
      .map(([k]) => k);
    expect(hits).toEqual([]);
  });

  it('spell the brand غارميش, never غرميش', () => {
    const hits = Object.entries(AR)
      .filter(([, v]) => v.includes('غرميش'))
      .map(([k]) => k);
    expect(hits).toEqual([]);
  });

  it('have no untranslated Arabic values outside the allowlist', () => {
    const same = Object.keys(EN).filter(
      (k) => k in AR && EN[k] === AR[k] && !IDENTICAL_ALLOWLIST.has(k),
    );
    expect(same).toEqual([]);
  });

  it('every Arabic plural distinguishes few (3–10) and many (11–99)', () => {
    // A plural with only `one`/`other` reads "5 تجربة" where Arabic needs
    // "5 تجارب"; CLDR Arabic has six categories and the two mid ones are
    // the ones an English-first author forgets.
    const incomplete = Object.entries(AR)
      .filter(([, v]) => /,\s*plural,/.test(v))
      .filter(([, v]) => !/\bfew\s*\{/.test(v) || !/\bmany\s*\{/.test(v))
      .map(([k]) => k);
    expect(incomplete).toEqual([]);
  });
});

describe('Arabic number rendering through next-intl', () => {
  const t = createTranslator({ locale: 'ar', messages: ar });

  it('renders plural counts with Latin digits', () => {
    for (const count of [3, 11, 25, 100]) {
      const text = t('hostBookings.countLabel', { count });
      expect(text).toMatch(/[0-9]/);
      expect(text).not.toMatch(/[٠-٩]/);
    }
  });

  it('renders the host card experience count for the common host size', () => {
    const text = t('ogImage.host.experienceCount', { formatted: '3', count: 3 });
    expect(text).toBe('3 تجارب');
    // The dual form carries its own "two" — no digit in front of it.
    expect(t('ogImage.host.experienceCount', { formatted: '2', count: 2 })).toBe('تجربتان');
  });
});

describe('every message formats', () => {
  // INVALID_MESSAGE (a placeholder the ICU parser rejects) and
  // FORMATTING_ERROR (an argument or tag the message needs) only ever
  // surfaced at runtime — /hosting rendered one on every view for a week
  // (2026-09-13 runtime logs). Format each key with values derived from
  // its own placeholders so the catalog itself cannot ship a broken string.
  it.each([
    ['en', EN],
    ['ar', AR],
  ] as const)('%s', (locale, flat) => {
    const errors: string[] = [];
    for (const [key, message] of Object.entries(flat)) {
      // One single-message translator per key keeps the key a literal for
      // next-intl's typed API and attributes every error to its key.
      const t = createTranslator({
        locale,
        messages: { m: message },
        onError: (error) => errors.push(`${key}: ${error.message}`),
      });
      const args = icuDummyArgValues(message);
      if (icuTags(message).size > 0) t.rich('m', { ...args, ...icuDummyTagValues(message) });
      else t('m', args);
    }
    expect(errors).toEqual([]);
  });
});
