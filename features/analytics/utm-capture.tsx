'use client';

import { useEffect } from 'react';
import type { UtmParams } from '@/features/analytics/types';

const KEY = 'gharmish_utm';

/** Attribution labels, not free text: trimmed and length-capped. */
const UTM_MAX = 100;
/** Click ids are opaque platform tokens and run longer than UTM labels. */
const CLICK_ID_MAX = 200;

/**
 * First-touch UTM + ad-click-id capture for booking attribution. Renders
 * nothing; mounted once in the locale layout. On any page load whose URL
 * carries `utm_source` OR a platform click id (`gclid` / `ttclid` /
 * `fbclid` — auto-appended by Google/TikTok/Meta ads, often WITHOUT any
 * utm params), the record is stored in **sessionStorage** — not a cookie
 * (the cookie notice promises "no advertising or tracking cookies,
 * ever"), so attribution lives and dies with the tab. First touch wins:
 * a stored record is never overwritten, because the ad click that
 * started the session is the one marketing paid for.
 */
export function UtmCapture() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem(KEY)) return;
      const params = new URLSearchParams(window.location.search);
      const label = (name: string): string | null =>
        params.get(name)?.trim().slice(0, UTM_MAX) || null;
      const clickId = (name: string): string | null =>
        params.get(name)?.trim().slice(0, CLICK_ID_MAX) || null;
      const utm: UtmParams = {
        // A click-id-only landing still stores a record (source null) —
        // the click id alone is what ties the booking back to the ad.
        source: label('utm_source'),
        medium: label('utm_medium'),
        campaign: label('utm_campaign'),
        gclid: clickId('gclid'),
        ttclid: clickId('ttclid'),
        fbclid: clickId('fbclid'),
        // Guest-to-guest referral code — same first-touch posture: the
        // friend's share is the touch that earned the visit.
        ref: clickId('ref'),
      };
      if (!utm.source && !utm.gclid && !utm.ttclid && !utm.fbclid && !utm.ref) return;
      sessionStorage.setItem(KEY, JSON.stringify(utm));
    } catch {
      // Storage unavailable (private mode, quota) — attribution is best-effort.
    }
  }, []);
  return null;
}

/** The stored first-touch record, or all-null when none was captured. */
export function readStoredUtm(): Required<UtmParams> {
  const none: Required<UtmParams> = {
    source: null,
    medium: null,
    campaign: null,
    gclid: null,
    ttclid: null,
    fbclid: null,
    ref: null,
  };
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return none;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return none;
    const pick = (v: unknown, max: number): string | null =>
      typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
    // Spread-over-defaults semantics: payloads stored before the click-id
    // fields existed simply resolve those fields to null.
    const record = parsed as Record<string, unknown>;
    return {
      source: pick(record.source, UTM_MAX),
      medium: pick(record.medium, UTM_MAX),
      campaign: pick(record.campaign, UTM_MAX),
      gclid: pick(record.gclid, CLICK_ID_MAX),
      ttclid: pick(record.ttclid, CLICK_ID_MAX),
      fbclid: pick(record.fbclid, CLICK_ID_MAX),
      ref: pick(record.ref, CLICK_ID_MAX),
    };
  } catch {
    return none;
  }
}
