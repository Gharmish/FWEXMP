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

- Every form uses `useActionState` + a zod schema validated in the server
  action. **`react-hook-form` is NOT installed and is not used anywhere**
  — this rule previously mandated it, which would mean adding a
  dependency in violation of the no-new-dependencies rule above
  (corrected 2026-07-28, sixth audit).
- The same zod schema validates client, server action, and database insert.
- Failure states must echo `values` as well as `fields`: React resets
  uncontrolled inputs after an action, so an un-echoed field silently
  reverts to its server-rendered default.
- Server actions never throw to the client. Failures return a discriminated
  state: `{ success: false, message: <per-feature union>, fields?, values? }`.
  Success either returns `{ success: true, ... }` or throws Next's
  `redirect()` — for redirect-on-success actions the observable state is
  always a failure shape. (2026-07: doc updated to match the convention the
  codebase actually uses.)

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
- ~~Don't write Arabic translations yourself.~~ **WAIVED by the owner** —
  there is no human translator, so Claude writes `ar.json` strings
  directly. (`messages/ar.json` has zero `TODO(ar)` markers.) The
  DB-content `TODO(ar):` marker mechanism still exists for seeded rows.
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

## Shared checkout — commit & deploy discipline

Several Claude sessions (and I) often work in this ONE checkout at the same time. A real collision happened on 2026-07-19: one session's staged files were swept into another session's bare `git commit`.

- Expect foreign files in `git status`. Never `git add .`.
- Commit with explicit pathspecs (`git commit <your files> -m ...`) — never a bare `git commit`, even right after `git add`; another session can stage files in between.
- If a shared file (especially `db/schema.ts`) contains hunks that aren't yours, stage only your hunks (`git apply --cached` with a filtered patch).
- After committing, verify with `git show --stat HEAD` that nothing foreign was swept in.
- Never `vercel deploy --prod` from a dirty tree — it uploads the whole directory, including other sessions' half-finished work. Deploy from a clean export: `git archive HEAD | tar -x -C <scratch>/deploy` + copy only `.vercel/project.json` into a fresh `.vercel/` there.

## How we handle disagreement

If you think I'm wrong about something — design, architecture, scope, anything — say so. Explain why. I'd rather you push back than silently build the wrong thing.

If the brief is unclear or contradicts a request, ask. Don't guess.
