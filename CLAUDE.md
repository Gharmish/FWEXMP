# CLAUDE.md — Working agreements for Gharmish

> This file is read automatically at the start of every Claude Code session. It defines how Claude works on this codebase.

---

## First action of every session

Before doing anything, read `BRIEF.md` in the repo root. If the conversation contradicts the brief, surface the contradiction — don't silently override.

---

## Before writing any code

1. **Restate the goal** in one sentence so we both agree on the target.
2. **List the files** you'll create or change if there are more than three. Wait for go-ahead.
3. **Name new dependencies** and explain why before installing. Default: no new dependencies. Lean stacks age better.
4. **For non-trivial work**, use plan mode (`Shift+Tab`) so I can review the approach first.

---

## While writing code

### TypeScript
- Strict mode. No `any`. No `@ts-ignore`. No `as unknown as` shortcuts.
- Types live next to the code that uses them, in `types.ts` files inside feature folders.

### Components
- Server Components by default. Add `"use client"` only when truly needed (forms, hooks, browser APIs).
- One component per file. Named exports only.
- Props typed via `interface ComponentNameProps`.

### Styling
- Tailwind v4 only. No CSS modules. No inline styles except for dynamic values that can't be Tailwind classes.
- Use design tokens by name (`bg-saffron-gold`, `text-sarat-black`). Never raw hex.
- Use logical properties (`ps-4`, `pe-2`, `border-inline-end`). Never `pl-`, `pr-`, `border-right`.
- Use `cn()` from `lib/utils.ts` for conditional classes.

### Data & validation
- Every form uses `react-hook-form` + a zod schema.
- The same zod schema validates client, server action, and database insert.
- Server actions return `{ success: true, data }` or `{ success: false, error }`. Never throw to the client.

### Files & naming
- Files: `kebab-case.ts`/`kebab-case.tsx`
- Components: `PascalCase`
- Hooks: `useCamelCase`
- DB tables: `snake_case`
- Feature folders, not type folders.

### Errors
- Wrap risky operations. Log to Sentry with user context.
- User-facing errors are translated through next-intl.
- Never expose stack traces to users.

---

## After writing code

1. Run `pnpm typecheck` and `pnpm lint`.
2. Tell me what changed, in plain English, in two or three sentences.
3. If anything is stubbed, incomplete, or needs a follow-up, list it under "TODO" in your reply.
4. Suggest a conventional commit message (`feat: ...`, `fix: ...`, etc.).

---

## What NOT to do

- Don't install UI component libraries other than shadcn/ui without asking.
- Don't add a state management library (Redux, Zustand, Jotai, etc.) — we use React state + server state from RSC.
- Don't write Arabic translations yourself. Leave `TODO(ar):` placeholders and flag for human review.
- Don't use any color outside the palette in `BRIEF.md`.
- Don't use `console.log` in committed code. Use the logger.
- Don't add features I didn't ask for, even if they seem obviously useful.
- Don't refactor unrelated code in the same change.
- Don't disable ESLint or TypeScript rules to make code compile. Fix the underlying issue.
- Don't `git commit` automatically. I'll commit after reviewing.

---

## Project commands

```
pnpm dev           # local dev server on http://localhost:3000
pnpm build         # production build
pnpm start         # run production build locally
pnpm typecheck     # TypeScript check across the project
pnpm lint          # ESLint
pnpm format        # Prettier write
pnpm test          # Vitest (when added)

pnpm db:push       # push schema to Supabase
pnpm db:studio     # open Drizzle Studio in browser
pnpm db:seed       # run the seed script
pnpm db:generate   # generate migration from schema diff
```

---

## How we handle disagreement

If you think I'm wrong about something — design, architecture, scope, anything — say so. Explain why. I'd rather you push back than silently build the wrong thing.

If the brief is unclear or contradicts a request, ask. Don't guess.
