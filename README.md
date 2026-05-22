# Gharmish

Gharmish is a curated experiences marketplace for Abha and the wider Asir region. The app is a bilingual Next.js 16 App Router project with English and Arabic routes, RTL support, Gharmish design tokens, Drizzle/Postgres data access, SEO foundations, and AI-readable `/llms.txt`.

## Stack

- Next.js 16 App Router with React 19
- TypeScript strict mode
- Tailwind CSS v4
- next-intl for `/en` and `/ar`
- Drizzle ORM with Postgres/Supabase
- Framer Motion for approved spring motion

## Getting Started

Install dependencies and run the local server:

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Locale-prefixed routes are available at `/en` and `/ar`.

## Environment

Copy `.env.example` to `.env` when connecting a database:

```bash
cp .env.example .env
```

`DATABASE_URL` is optional for local UI work. When it is unset, the app uses the in-repo sample experience dataset so builds and previews stay green. When it is set, experience queries read live rows through Drizzle.

## Scripts

```bash
pnpm dev
pnpm build
pnpm start
pnpm typecheck
pnpm lint
pnpm format
pnpm db:generate
pnpm db:push
pnpm db:studio
pnpm db:seed
```

## Project Notes

- Read `BRIEF.md` before changing product scope, design, architecture, or localization.
- Arabic copy is currently draft translation and should be reviewed before launch.
- Keep components server-first. Add `"use client"` only for browser APIs, hooks, or interactive error boundaries.
- Use named color tokens from the brief. Do not introduce raw hex values outside the central token files.

## Current Scope

Implemented Sprint 1 foundations include localized routing, layout shell, UI primitives, home page, experiences index, experience detail pages, Drizzle schema/seed support, sitemap, robots, `/llms.txt`, and structured data.

Out-of-scope until a later sprint: real auth, payments, host dashboards, admin tools, search/filtering UI, WhatsApp, email, and AI features.
