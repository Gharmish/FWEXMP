# Gharmish

A curated experiences marketplace for Abha and the wider Aseer region. Bilingual Next.js 16 App Router app with English (`/en`) and Arabic (`/ar`) routes, full RTL, Gharmish design tokens, Drizzle/Postgres data access, JSON-LD on every public page, and an AI-readable `/llms.txt`.

For brand, design, architecture, and scope: read **`BRIEF.md`**. It's the source of truth.

## Stack

- **Framework** Next.js 16 (App Router · React 19 · Server Components by default)
- **Language** TypeScript, strict mode
- **Styling** Tailwind CSS v4, logical properties only
- **i18n** next-intl, prefix-always routing (`/en/*`, `/ar/*`)
- **Database** PostgreSQL via Supabase, Drizzle ORM (transaction-mode pooler)
- **Validation** zod (shared between client, server actions, and DB writes)
- **Forms** React 19 `useActionState` + `useOptimistic`, server actions
- **Errors** Sentry (`@sentry/nextjs`), routed through a single `reportError` chokepoint
- **Tests** Vitest (pure helpers), gated on pre-commit

## Getting started

```bash
pnpm install
pnpm dev
```

Open <http://localhost:3000>. Locale routes: `/en` and `/ar`. Internal styleguide: `/en/dev`.

## Environment

`.env.example` lists every variable. All are optional in development — the app falls back to in-repo sample data, no-op error reporting, and preview-mode bookings. Production needs the real values.

| Variable                 | Purpose                                                      |
| ------------------------ | ------------------------------------------------------------ |
| `DATABASE_URL`           | Supabase Postgres connection. When unset → sample-data mode. |
| `SENTRY_DSN`             | Server-side Sentry. When unset → no-op SDK.                  |
| `NEXT_PUBLIC_SENTRY_DSN` | Browser-side Sentry. Same no-op behaviour.                   |

## Scripts

```bash
pnpm dev            # Local dev server
pnpm build          # Production build
pnpm start          # Run the production build locally

pnpm typecheck      # tsc --noEmit
pnpm lint           # ESLint
pnpm format         # Prettier write
pnpm test           # Vitest, single run (pre-commit gate runs this)
pnpm test:watch     # Vitest in watch mode

pnpm db:generate    # drizzle-kit generate (migration from schema diff)
pnpm db:push        # Push schema to the configured DATABASE_URL
pnpm db:studio      # Open Drizzle Studio in the browser
pnpm db:seed        # Seed sample experiences + hosts + reviews
pnpm db:check       # Probe the DB connection; soft-pass when DATABASE_URL is unset
```

## When credentials arrive

The app is built so each external dependency flips on independently. Recommended order:

1. **`DATABASE_URL`** — `pnpm db:check` to confirm reachable → `pnpm db:push` to apply the schema → `pnpm db:seed` to load the 6 Abha experiences, 2 hosts, 16 reviews. Every page transparently switches from sample data to live rows.
2. **`SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN`** — errors start flowing through `reportError` automatically. No code change needed.
3. **Moyasar API keys** — booking confirmation page is already in place; payment handoff is the next implementation step.
4. **Resend / Cloudflare R2 / 360dialog** — email, image storage, WhatsApp. All deferred until the lanes above are live.

## Patterns

- **Sample-data fallback.** Every data accessor in `features/*/queries.ts` checks `hasDb()` and delegates to `features/*/lib/sample-data.ts` when `DATABASE_URL` is empty. Page code never branches.
- **Cookie-backed guest state.** Wishlist (`gharmish_wishlist`) and last booking (`gharmish_last_booking`) live in HttpOnly cookies. Used today on `/wishlist` and `/me`; will be migrated to `saved_experiences` and `bookings` tables when auth lands.
- **Server actions return error shapes; success redirects.** See `features/bookings/actions.ts`. `useActionState` only ever observes failure states; the success path throws `redirect()` before the action returns.
- **Pure helpers are tested; React + DB paths are not (yet).** `features/*/lib/*.ts` and `lib/format.ts` carry the unit tests. Component and integration tests are deferred until a real DB is wired.
- **Logical CSS only.** `ps-*` / `pe-*` / `border-inline-*` everywhere; never `pl-` / `pr-` / `border-left`. ESLint doesn't enforce this — the audit grep does.
- **Arabic copy.** Per BRIEF §4, the AI does not author Arabic. New strings land as `TODO(ar):` in `messages/ar.json` and wait for native review. The drafted Arabic in `arabic-content.ts`, `seed.ts`, and parts of `messages/ar.json` was authored by a previous session and also needs review.

## Routes

| Path                                         | Render | Notes                                                                         |
| -------------------------------------------- | ------ | ----------------------------------------------------------------------------- |
| `/[locale]`                                  | `ƒ`    | Home — reads wishlist cookie                                                  |
| `/[locale]/experiences`                      | `ƒ`    | Catalog with search, filter, sort, price + duration buckets                   |
| `/[locale]/experiences/[slug]`               | `●`    | Detail page with booking form + reviews + AggregateRating JSON-LD             |
| `/[locale]/book/confirmed/[ref]`             | `ƒ`    | Post-booking confirmation, `noindex`                                          |
| `/[locale]/hosts`                            | `●`    | Host directory                                                                |
| `/[locale]/hosts/[slug]`                     | `ƒ`    | Host profile with their experience grid                                       |
| `/[locale]/wishlist`                         | `ƒ`    | Saved experiences from the cookie, `noindex`                                  |
| `/[locale]/me`                               | `ƒ`    | Last booking + saved experiences, `noindex`                                   |
| `/[locale]/dev`                              | `●`    | Internal styleguide — every primitive and composite, disallowed in robots.txt |
| `/llms.txt` · `/sitemap.xml` · `/robots.txt` | mixed  | AI manifest, sitemap with hreflang, robots with `LLM:` directive              |

`●` = SSG (static at build) · `ƒ` = dynamic (server-rendered on demand, typically because it reads cookies or searchParams).

## What's not built yet

Per BRIEF §10 (deferred), and noted explicitly so it isn't a surprise to a next contributor:

- Real authentication. `/me` uses a cookie-backed stub today.
- Real Moyasar payment handoff (the form already redirects to a confirmation page; the next step is the payment link).
- Host dashboards, admin panel.
- Meilisearch for proper Arabic-aware search (current `?q=` is a substring match on title + place + host).
- WhatsApp confirmation via 360dialog.
- Email via Resend.
- Mobile app.

When in doubt about whether something belongs in scope, BRIEF.md wins.
