'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useSyncExternalStore } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { SPRING } from '@/components/ui/motion';
import { clientEnv, hasMarketingPixels } from '@/lib/env-client';
import { readConsent, subscribeConsent, writeConsent } from '@/components/layout/consent';

/**
 * First-visit cookie banner, in one of two modes:
 *
 * - **Notice** (no ad pixels configured): Gharmish sets only strictly
 *   necessary cookies (Supabase session, NEXT_LOCALE, the consent cookie
 *   itself) — nothing optional exists to refuse, so a single "Got it"
 *   acknowledges the notice. No fake "decline" choice.
 * - **Consent** (a Snap/TikTok pixel or Google Analytics id is
 *   configured): marketing/analytics cookies are now a real option, so
 *   the banner offers "Accept all" / "Essential only". Trackers load
 *   only after "Accept all" — see `marketing-pixels.tsx`. Visitors who
 *   only ever dismissed the plain notice are asked once when trackers
 *   first appear.
 *
 * Visibility is decided client-side via the shared consent store over
 * `document.cookie` (server snapshot: hidden): reading `cookies()` in
 * the locale layout would work too, but keeping the layout out of it
 * means one less server dependency and no hydration mismatch — the
 * banner simply springs in once, and returning visitors render nothing.
 */

function getSnapshot(): boolean {
  const consent = readConsent();
  if (consent === null) return true;
  return hasMarketingPixels() && consent === 'acknowledged';
}

function getServerSnapshot(): boolean {
  return false;
}

export function CookieNotice() {
  const t = useTranslations('cookieNotice');
  const locale = useLocale();
  const reduce = useReducedMotion();
  const visible = useSyncExternalStore(subscribeConsent, getSnapshot, getServerSnapshot);
  const consentMode = hasMarketingPixels();

  // Banner honesty: name only the trackers this deployment actually
  // configures. The legacy `consentBody` string hard-names Snapchat and
  // TikTok — untrue when e.g. only GA4 + TikTok ids are set. GA4-only →
  // an analytics-only body; any ad pixel(s) → the full body with the
  // real network list interpolated. `t.has` keeps the legacy string as
  // the fallback until the new keys land in messages/*.json.
  const adNetworks = [
    clientEnv.NEXT_PUBLIC_TIKTOK_PIXEL_ID
      ? t.has('networkTikTok')
        ? t('networkTikTok')
        : 'TikTok'
      : null,
    clientEnv.NEXT_PUBLIC_SNAP_PIXEL_ID
      ? t.has('networkSnapchat')
        ? t('networkSnapchat')
        : 'Snapchat'
      : null,
  ].filter((n): n is string => n !== null);
  let consentBody = t('consentBody');
  if (adNetworks.length === 0 && t.has('bodyAnalyticsOnly')) {
    consentBody = t('bodyAnalyticsOnly');
  } else if (adNetworks.length > 0 && t.has('bodyFull')) {
    consentBody = t('bodyFull', { networks: adNetworks.join(locale === 'ar' ? ' و' : ' and ') });
  }

  return (
    <AnimatePresence>
      {visible ? (
        <motion.aside
          aria-label={t('regionLabel')}
          initial={reduce ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, y: 12 }}
          transition={SPRING}
          className="rounded-card border-sarat-black/8 fixed start-4 bottom-[calc(1rem+var(--bottom-dock,0px))] z-[60] w-[calc(100%-2rem)] max-w-sm [border-width:0.5px] bg-white p-4 shadow-[var(--shadow-overlay)] print:hidden"
        >
          <p className="text-sarat-black text-sm leading-relaxed">
            {consentMode ? consentBody : t('body')}
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            <Link
              href="/privacy"
              className="text-sarat-black-600 hover:text-sarat-black me-auto text-sm underline underline-offset-2 transition-colors duration-200"
            >
              {t('privacyLink')}
            </Link>
            {consentMode ? (
              <>
                <Button variant="secondary" size="sm" onClick={() => writeConsent('essential')}>
                  {t('essentialOnly')}
                </Button>
                <Button size="sm" onClick={() => writeConsent('all')}>
                  {t('acceptAll')}
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={() => writeConsent('acknowledged')}>
                {t('cta')}
              </Button>
            )}
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
