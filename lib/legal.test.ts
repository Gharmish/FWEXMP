import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import ar from '@/messages/ar.json';
import en from '@/messages/en.json';
import { termsCarriedOver } from '@/features/payments/lib/terms';
import { CURRENT_TERMS_VERSION } from './legal';

/**
 * The consent stamp and the legal copy must move together (#105,
 * 2026-10-30). `CURRENT_TERMS_VERSION` is what every `terms_accepted`
 * ledger event and booking row records as "the wording the guest
 * agreed to"; the 2026-08-02 legal audit found it pointing at a version
 * no user ever saw, and on 2026-10-11 the Terms' credit clause changed
 * without a bump, so earlier acceptances carried over to new wording.
 *
 * Two pins, so the next copy change cannot slip through:
 * 1. the "Last updated" date shown on /terms and /privacy, in both
 *    locales, is the version date;
 * 2. the legal copy subtrees hash to the value recorded for this
 *    version. Changing the Terms, Privacy or Cancellation copy fails
 *    here until `CURRENT_TERMS_VERSION` is bumped to the date of the
 *    change AND the hashes below are updated. (A non-material fix — a
 *    typo — updates only the hashes; the version stays.)
 */
const LEGAL_COPY_SHA256: Record<'en' | 'ar', string> = {
  en: '0733f2a26368c15085968fa87d3f4ce648fbe6decd1994ec53976d4367e61b21',
  ar: '908440e5dbebd7a8744b0e772178c383124055d8e468abd7595f5511af307df5',
};

const MESSAGES = { en, ar } as const;

function legalCopyHash(locale: 'en' | 'ar'): string {
  const m = MESSAGES[locale];
  const copy = {
    termsPage: m.termsPage,
    privacyPage: m.privacyPage,
    cancellationPolicyPage: m.cancellationPolicyPage,
  };
  return createHash('sha256').update(JSON.stringify(copy)).digest('hex');
}

function versionDate(locale: 'en' | 'ar'): string {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-u-nu-latn-ca-gregory' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${CURRENT_TERMS_VERSION}T00:00:00Z`));
}

describe('CURRENT_TERMS_VERSION', () => {
  it('is an ISO date', () => {
    expect(CURRENT_TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(new Date(CURRENT_TERMS_VERSION).getTime())).toBe(false);
  });

  it.each(['en', 'ar'] as const)(
    'is the "Last updated" date shown on /terms and /privacy (%s)',
    (locale) => {
      const date = versionDate(locale);
      expect(MESSAGES[locale].termsPage.intro).toContain(date);
      expect(MESSAGES[locale].privacyPage.intro).toContain(date);
    },
  );

  it.each(['en', 'ar'] as const)('pins the legal copy to this version (%s)', (locale) => {
    expect(
      { version: CURRENT_TERMS_VERSION, hash: legalCopyHash(locale) },
      'The Terms / Privacy / Cancellation copy changed. Bump CURRENT_TERMS_VERSION in lib/legal.ts to the date of the change, update the "Last updated" line in both locales, and record the new hash in LEGAL_COPY_SHA256 (lib/legal.test.ts).',
    ).toEqual({ version: CURRENT_TERMS_VERSION, hash: LEGAL_COPY_SHA256[locale] });
  });

  it('no longer carries a pre-2026-10-11 acceptance over to checkout', () => {
    expect(
      termsCarriedOver(
        { termsAcceptedAt: '2026-10-05T09:00:00.000Z', termsVersion: '2026-08-02' },
        CURRENT_TERMS_VERSION,
      ),
    ).toBe(false);
    expect(
      termsCarriedOver(
        { termsAcceptedAt: '2026-10-12T09:00:00.000Z', termsVersion: CURRENT_TERMS_VERSION },
        CURRENT_TERMS_VERSION,
      ),
    ).toBe(true);
  });
});
