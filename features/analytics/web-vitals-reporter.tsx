'use client';

import { useReportWebVitals } from 'next/web-vitals';
import { collapseVitalsPath } from '@/features/analytics/vitals-path';

const SAMPLE_RATE = 0.25;
const NAMES = new Set(['LCP', 'INP', 'CLS', 'TTFB', 'FCP']);
/** Decided once per page load so one visit reports all or none of its vitals. */
const sampled = typeof window !== 'undefined' && Math.random() < SAMPLE_RATE;

/**
 * Real-user Core Web Vitals → /api/vitals (2026-09 engineering audit
 * ROADMAP-06). No identifiers: the payload is the metric, the route
 * template and the locale. Beacons survive the page unloading.
 */
export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    if (!sampled || !NAMES.has(metric.name)) return;
    const { locale, path } = collapseVitalsPath(window.location.pathname);
    const body = JSON.stringify({
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
      path,
      locale,
      navigationType: metric.navigationType,
    });
    if (typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon('/api/vitals', new Blob([body], { type: 'application/json' }));
      return;
    }
    fetch('/api/vitals', {
      method: 'POST',
      body,
      keepalive: true,
      headers: { 'content-type': 'application/json' },
    }).catch(() => undefined);
  });
  return null;
}
