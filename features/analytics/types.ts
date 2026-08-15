/**
 * UTM triplet plus ad-platform click ids as captured from a request URL;
 * null = absent/organic. The click ids (`gclid` Google, `ttclid` TikTok,
 * `fbclid` Meta) are OPTIONAL properties so existing producers that only
 * know the triplet (`utmFromSearchParams` in capture.ts, old stored
 * sessionStorage payloads) remain assignable — readers treat a missing
 * field exactly like null.
 */
export interface UtmParams {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  gclid?: string | null;
  ttclid?: string | null;
  fbclid?: string | null;
  /** Referral code from a `?ref=` landing (guest-to-guest share links). */
  ref?: string | null;
}
