import { z } from 'zod';

/**
 * Client-safe environment access: ONLY `NEXT_PUBLIC_*` values, inlined
 * by Next at build time. Client components import from here; server
 * code may import `clientEnv` via `lib/env.ts`, which re-exports these
 * and is itself `server-only`-guarded so no future client module can
 * pull `serverEnv` (and its secrets' names/shape) into a browser bundle.
 */

export function parseEnv<T extends z.ZodType>(
  schema: T,
  source: unknown,
  scope: string,
): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid ${scope} environment variables:\n${issues}`);
  }
  return result.data;
}

const clientSchema = z.object({
  NEXT_PUBLIC_SENTRY_DSN: z.string().default(''),
  // Supabase Auth — BRIEF §5 ("Supabase Auth for guest and host accounts,
  // email + phone OTP"). Both must be set for real auth; if either is
  // empty the auth layer falls back to a dev-mode cookie stub so the
  // UX stays demoable creds-free. Same boundary pattern as `hasDb()`.
  NEXT_PUBLIC_SUPABASE_URL: z.string().default(''),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().default(''),
  // Snap Pixel + TikTok Pixel ids for ad conversion tracking, and the
  // GA4 measurement id (G-XXXXXXXXXX) for site analytics. Optional —
  // `hasMarketingPixels()` gates both the script loader and the cookie
  // banner's consent mode, so until at least one id is set the site sets
  // zero marketing/analytics cookies and the banner stays a plain notice.
  // Even when set, the trackers load only after "Accept all".
  NEXT_PUBLIC_SNAP_PIXEL_ID: z.string().default(''),
  NEXT_PUBLIC_TIKTOK_PIXEL_ID: z.string().default(''),
  NEXT_PUBLIC_GA_MEASUREMENT_ID: z.string().default(''),
});

export const clientEnv = parseEnv(
  clientSchema,
  {
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SNAP_PIXEL_ID: process.env.NEXT_PUBLIC_SNAP_PIXEL_ID,
    NEXT_PUBLIC_TIKTOK_PIXEL_ID: process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID,
    NEXT_PUBLIC_GA_MEASUREMENT_ID: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
  },
  'client',
);

/**
 * Is real Supabase Auth configured? Mirrors the `hasDb()` boundary in
 * spirit: every auth code path checks this and falls back to the
 * stub-session cookie when false. Flips the moment both vars arrive
 * in production — no code change.
 */
export function hasSupabaseAuth(): boolean {
  return Boolean(clientEnv.NEXT_PUBLIC_SUPABASE_URL && clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/**
 * Is at least one tracker (Snap / TikTok pixel, Google Analytics)
 * configured? Client-safe. Gates the tracker loader and switches the
 * cookie banner from a plain notice into its Accept-all /
 * Essential-only consent mode.
 */
export function hasMarketingPixels(): boolean {
  return Boolean(
    clientEnv.NEXT_PUBLIC_SNAP_PIXEL_ID ||
      clientEnv.NEXT_PUBLIC_TIKTOK_PIXEL_ID ||
      clientEnv.NEXT_PUBLIC_GA_MEASUREMENT_ID,
  );
}
