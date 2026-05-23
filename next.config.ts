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
    ],
    // BRIEF §3 prefers AVIF + WebP; next/image already negotiates
    // both via Accept headers, no extra config needed here.
  },
};

export default withNextIntl(nextConfig);
