/**
 * Canonical site identity for SEO / metadata / sitemap / llms.txt.
 * Override the origin per environment with NEXT_PUBLIC_SITE_URL.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://gharmish.com').replace(
  /\/$/,
  '',
);

export const SITE_NAME = 'Gharmish';

export const SUPPORT_EMAIL = 'hello@gharmish.com';

export const SITE_DESCRIPTION = 'Experiences hosted by the people who know Aseer best.';
