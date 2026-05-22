import { z } from 'zod';

/**
 * Validated environment variables. Parsed once at module load — a missing
 * or malformed required variable throws immediately at boot rather than
 * failing deep in a request.
 *
 * Keep server-only secrets in `serverEnv` and never import it from a
 * client component. `clientEnv` holds only `NEXT_PUBLIC_*` values.
 */

const serverSchema = z.object({
  // Optional for now (no DB wired yet — Sprint 1 task 8). Empty string ok.
  DATABASE_URL: z.string().default(''),
  // Optional Sentry DSN — when unset the SDK is a no-op so dev builds
  // stay quiet. Set in Vercel as a Sensitive var when production
  // monitoring is wanted (BRIEF §5).
  SENTRY_DSN: z.string().default(''),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

const clientSchema = z.object({
  NEXT_PUBLIC_SENTRY_DSN: z.string().default(''),
});

function parse<T extends z.ZodType>(schema: T, source: unknown, scope: string): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid ${scope} environment variables:\n${issues}`);
  }
  return result.data;
}

export const serverEnv = parse(
  serverSchema,
  {
    DATABASE_URL: process.env.DATABASE_URL,
    SENTRY_DSN: process.env.SENTRY_DSN,
    NODE_ENV: process.env.NODE_ENV,
  },
  'server',
);

export const clientEnv = parse(
  clientSchema,
  {
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  },
  'client',
);
