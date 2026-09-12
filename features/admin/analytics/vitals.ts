import type { WebVitalName, WebVitalRating } from '@/db/schema';

/** web.dev thresholds: good ≤ first, poor > second. */
export const WEB_VITAL_THRESHOLDS: Record<WebVitalName, [good: number, poor: number]> = {
  LCP: [2500, 4000],
  INP: [200, 500],
  CLS: [0.1, 0.25],
  TTFB: [800, 1800],
  FCP: [1800, 3000],
};

export function rateVital(name: WebVitalName, value: number): WebVitalRating {
  const [good, poor] = WEB_VITAL_THRESHOLDS[name];
  if (value <= good) return 'good';
  if (value <= poor) return 'needs-improvement';
  return 'poor';
}

/** Milliseconds as whole numbers; CLS to two decimals. */
export function formatVital(name: WebVitalName, value: number): string {
  return name === 'CLS' ? value.toFixed(2) : `${Math.round(value)} ms`;
}
