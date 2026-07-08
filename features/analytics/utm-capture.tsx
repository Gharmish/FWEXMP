'use client';

import { useEffect } from 'react';
import type { UtmParams } from '@/features/analytics/types';

const KEY = 'gharmish_utm';

/**
 * First-touch UTM capture for booking attribution. Renders nothing;
 * mounted once in the locale layout. On any page load whose URL carries
 * `utm_source`, the triplet is stored in **sessionStorage** — not a
 * cookie (the cookie notice promises "no advertising or tracking
 * cookies, ever"), so attribution lives and dies with the tab. First
 * touch wins: a stored triplet is never overwritten, because the ad
 * click that started the session is the one marketing paid for.
 */
export function UtmCapture() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem(KEY)) return;
      const params = new URLSearchParams(window.location.search);
      const source = params.get('utm_source')?.trim().slice(0, 100);
      if (!source) return;
      const utm: UtmParams = {
        source,
        medium: params.get('utm_medium')?.trim().slice(0, 100) || null,
        campaign: params.get('utm_campaign')?.trim().slice(0, 100) || null,
      };
      sessionStorage.setItem(KEY, JSON.stringify(utm));
    } catch {
      // Storage unavailable (private mode, quota) — attribution is best-effort.
    }
  }, []);
  return null;
}

/** The stored first-touch triplet, or all-null when none was captured. */
export function readStoredUtm(): UtmParams {
  const none: UtmParams = { source: null, medium: null, campaign: null };
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return none;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return none;
    const pick = (v: unknown): string | null =>
      typeof v === 'string' && v.trim() ? v.trim().slice(0, 100) : null;
    const record = parsed as Record<string, unknown>;
    return {
      source: pick(record.source),
      medium: pick(record.medium),
      campaign: pick(record.campaign),
    };
  } catch {
    return none;
  }
}
