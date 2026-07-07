'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { SPRING } from '@/components/ui/motion';

const COOKIE_NAME = 'gharmish_cookie_notice';
const COOKIE_MAX_AGE_S = 60 * 60 * 24 * 365;

/**
 * First-visit cookie notice. Gharmish sets only strictly necessary
 * cookies (Supabase session, NEXT_LOCALE, this dismissal) — nothing
 * optional exists to accept or refuse, so this is a one-button notice
 * that points at the privacy policy, not a consent dialog with a fake
 * "decline" choice.
 *
 * Visibility is decided client-side via a tiny external store over
 * `document.cookie` (server snapshot: hidden): reading `cookies()` in
 * the locale layout would work too, but keeping the layout out of it
 * means one less server dependency and no hydration mismatch — the
 * banner simply springs in once, and returning visitors render nothing.
 */
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): boolean {
  return !document.cookie.split('; ').some((entry) => entry.startsWith(`${COOKIE_NAME}=`));
}

function getServerSnapshot(): boolean {
  return false;
}

export function CookieNotice() {
  const t = useTranslations('cookieNotice');
  const reduce = useReducedMotion();
  const visible = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const dismiss = () => {
    const secure = window.location.protocol === 'https:' ? '; secure' : '';
    document.cookie = `${COOKIE_NAME}=1; max-age=${COOKIE_MAX_AGE_S}; path=/; samesite=lax${secure}`;
    for (const listener of listeners) listener();
  };

  return (
    <AnimatePresence>
      {visible ? (
        <motion.aside
          aria-label={t('regionLabel')}
          initial={reduce ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, y: 12 }}
          transition={SPRING}
          className="rounded-card border-sarat-black/8 fixed start-4 bottom-4 z-[60] w-[calc(100%-2rem)] max-w-sm [border-width:0.5px] bg-white p-4 shadow-[var(--shadow-overlay)] print:hidden"
        >
          <p className="text-sarat-black text-sm leading-relaxed">{t('body')}</p>
          <div className="mt-3 flex items-center justify-between gap-3">
            <Link
              href="/privacy"
              className="text-sarat-black-600 hover:text-sarat-black text-sm underline underline-offset-2 transition-colors duration-200"
            >
              {t('privacyLink')}
            </Link>
            <Button size="sm" onClick={dismiss}>
              {t('cta')}
            </Button>
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
