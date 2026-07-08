import type { MetadataRoute } from 'next';
import { SITE_NAME, SITE_DESCRIPTION } from '@/lib/site';

/**
 * PWA manifest. Saudi audience is mobile-majority (BRIEF.md), so a clean
 * home-screen install matters. Theme is Saffron Gold (the brand accent) on a
 * white surface, matching the premium-redesign palette. Icons reuse the
 * existing app/icon.svg (scalable, maskable) and app/apple-icon.png — Next.js
 * serves both from the app root via the file conventions.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — Experiences in Aseer`,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: '/',
    display: 'standalone',
    background_color: '#FFFFFF',
    theme_color: '#F5B800',
    icons: [
      {
        src: '/icon.svg',
        type: 'image/svg+xml',
        sizes: 'any',
        purpose: 'maskable',
      },
      {
        src: '/apple-icon.png',
        type: 'image/png',
        sizes: '180x180',
      },
    ],
  };
}
