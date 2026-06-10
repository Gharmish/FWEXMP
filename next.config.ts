import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./lib/request.ts');

const nextConfig: NextConfig = {
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
  },
};

export default withNextIntl(nextConfig);
