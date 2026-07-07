import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./lib/request.ts');

const nextConfig: NextConfig = {
  /**
   * Baseline security headers (2026-07 audit M1 — there were none).
   * `frame-ancestors 'none'` matters most: the payment page hosts the
   * HyperPay COPYandPAY card widget and must never be frameable
   * (clickjacking a victim through paying an attacker's booking).
   * Referrer-Policy matters because booking-reference URLs act as
   * partial capabilities — never leak them cross-origin. A full CSP is
   * deliberately deferred: it needs care around the OPPWA widget script
   * origin and inline hydration, and a broken CSP on the pay page is
   * worse than none.
   */
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Nothing in the app uses these browser APIs (grep-verified);
          // deny so an injected script can't either.
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
  experimental: {
    serverActions: {
      // Photo uploads (hero + gallery) travel through server actions.
      // Clients re-encode to a small WebP first, but the default 1MB cap
      // 413'd any fallback-path original — 20MB clears the bucket's 15MB
      // object policy with form-encoding headroom. 25MB since the host
      // KYC form submits up to five 4MB documents in one multipart body
      // (keep in lockstep with MAX_DOCUMENT_BYTES × doc count).
      bodySizeLimit: '25mb',
    },
  },
  // The per-experience opengraph-image route reads brand TTFs off disk
  // (lib/og/fonts) at runtime. Node file-tracing can't infer the dynamic
  // join(process.cwd(), …) path, so bundle the fonts into the function
  // explicitly — otherwise the route 500s in production with ENOENT.
  outputFileTracingIncludes: {
    '/[locale]/experiences/[slug]/opengraph-image': ['./lib/og/fonts/*.ttf'],
    '/[locale]/hosts/[slug]/opengraph-image': ['./lib/og/fonts/*.ttf'],
  },
  images: {
    /**
     * Allowlist Supabase Storage (public bucket `photos`) as a remote
     * image source. next/image refuses unknown hosts at build time —
     * without this entry the experience-card hero <Image> would 404
     * even though the URL is publicly fetchable. Pattern is locked
     * to our specific project ref so a stray URL from another
     * Supabase project can't slip through.
     */
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'xjgpflzkpydfpuomqhuq.supabase.co',
        pathname: '/storage/v1/object/public/photos/**',
      },
      {
        // Guest profile photos (public bucket `avatars`).
        protocol: 'https',
        hostname: 'xjgpflzkpydfpuomqhuq.supabase.co',
        pathname: '/storage/v1/object/public/avatars/**',
      },
    ],
    // BRIEF §3/§6 require AVIF + WebP. next/image only emits the formats
    // listed here (it defaults to WebP only), so AVIF must be opted in.
    // Order matters: AVIF is tried first, WebP is the fallback.
    formats: ['image/avif', 'image/webp'],
    // Dev-only: on NAT64/DNS64 networks the Supabase host resolves to
    // 64:ff9b::/96 addresses, which the optimizer's SSRF guard treats as
    // private and 400s. Production keeps the guard.
    dangerouslyAllowLocalIP: process.env.NODE_ENV === 'development',
  },
};

export default withNextIntl(nextConfig);
