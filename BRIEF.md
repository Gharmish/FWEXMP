# Gharmish — Project Brief

> This document is the single source of truth for the Gharmish project. Every Claude Code session starts by reading this file. When in doubt about brand, design, architecture, or scope, this brief wins.

---

## 1. What we're building

Gharmish (غارميش) is a curated experiences marketplace for Saudi Arabia, launching in Abha (Asir region). We connect vetted local hosts — individual Saudis and tourism companies — with guests seeking authentic Asiri experiences: heritage tours, mountain adventures, food, wellness, family activities, and premium "Originals."

We are not a passive listing platform. We are a **partnership marketplace**: we co-create experiences with hosts, provide photography, training, insurance, and distribution, in exchange for a fair revenue share. Quality and curation are the moat.

**Initial launch market**: Abha and surrounding Asir region, summer 2026.
**Primary audience year 1**: Saudi domestic travelers (Arabic-first).
**Secondary audience year 2+**: International visitors (English).

---

## 2. Brand

### Name

**Gharmish** (English) / **غارميش** (Arabic). The name evokes Garmisch-Partenkirchen, positioning Abha as Saudi Arabia's alpine destination — green, cool, cultural, distinct from desert KSA.

### Tone of voice

Calm, confident, culturally rooted, premium without pretension. Apple-like restraint. Never markety, never loud, never discount-driven. We speak as a host introducing a friend to their hometown.

### Positioning statement

> Experiences hosted by the people who know Asir best.

### Brand pillars

1. **Authenticity** — every experience ties to Asiri culture, geography, or community.
2. **Partnership** — hosts are partners, not inventory.
3. **Restraint** — design, copy, and feature set are deliberate. Less is the point.

---

## 3. Design system

### Color palette

Use these tokens exclusively. No off-palette hex values anywhere in the codebase.

| Token           | Hex       | Role                                           |
| --------------- | --------- | ---------------------------------------------- |
| `sarat-black`   | `#0A0A0A` | Text, dark sections, Originals tier            |
| `saffron-gold`  | `#F5B800` | Primary CTAs, premium accent, emphasis         |
| `sarawat-blue`  | `#2E5BFF` | Family category, informational links           |
| `soudah-sunset` | `#E85D27` | Adventure category, warmth                     |
| `juniper-green` | `#1F7A5C` | Nature category, success states                |
| `al-qatt-red`   | `#C8312A` | Heritage category, destructive/error states    |
| `fog-white`     | `#F5F2EC` | Primary background, surfaces in dark mode text |
| `honey-amber`   | `#F4B898` | Soft accent, secondary surfaces                |
| `habala-mist`   | `#BFD4E8` | Soft accent, info surfaces                     |
| `tihama-coral`  | `#FFB089` | Soft accent                                    |
| `wadi-mint`     | `#9FD9C0` | Wellness category                              |
| `rijal-clay`    | `#8B2E20` | Deep accent, sold-out / past states            |

Each primary color has a `-50`, `-100`, `-200`, `-400`, `-600`, `-800`, `-900` ramp generated for fills and tints — keep these in `tailwind.config.ts`.

### Category-to-color map (immutable)

| Category                 | Color                                | Arabic         |
| ------------------------ | ------------------------------------ | -------------- |
| Nature                   | Juniper Green                        | الطبيعة        |
| Heritage                 | Al-Qatt Red                          | التراث         |
| Food & coffee            | Saffron Gold                         | الطعام والقهوة |
| Wellness                 | Wadi Mint                            | العافية        |
| Adventure                | Soudah Sunset                        | المغامرة       |
| Family                   | Sarawat Blue                         | العائلة        |
| Originals (premium tier) | Sarat Black bg + Saffron Gold accent | أصول غارميش    |

### Typography

**English**: Bricolage Grotesque (variable font, weights 200–800, exploit the `opsz` optical-size axis aggressively).
**Arabic**: IBM Plex Sans Arabic (weights 100–700).

**Weights used in product: only 400 and 500.** Never 600, 700, or 800. The restraint is the brand.

Load both via `next/font` with `display: swap`. Self-host, do not link to Google Fonts in production.

#### Type scale (English)

| Role       | Size  | Weight | opsz | Tracking           |
| ---------- | ----- | ------ | ---- | ------------------ |
| Display    | 72–96 | 500    | 96   | -0.04em            |
| H1         | 48–64 | 500    | 56   | -0.035em           |
| H2         | 32–36 | 500    | 36   | -0.03em            |
| H3         | 24    | 500    | 24   | -0.025em           |
| Body large | 18    | 400    | 18   | -0.01em            |
| Body       | 16    | 400    | 16   | 0                  |
| Caption    | 13    | 500    | 13   | 0.02em (uppercase) |
| Eyebrow    | 10–11 | 500    | 11   | 0.2em (uppercase)  |

#### Type scale (Arabic)

Arabic text is visually denser; bump each tier +1 step. Line-height for Arabic body is `1.7–1.8` (vs `1.4–1.5` English). Set `direction: rtl` at the document root in Arabic locale.

**Sentence case always.** Never Title Case, never ALL CAPS except for eyebrow/caption labels with letter-spacing.

### Spacing

Use the 8-point grid exclusively: `4, 8, 12, 16, 24, 32, 48, 64, 80, 120` (pixels). Configure in Tailwind as `space-1` through `space-30`. No arbitrary values.

### Border radius

| Element         | Radius         |
| --------------- | -------------- |
| Buttons (pills) | `100px` (full) |
| Cards           | `20px`         |
| Inputs          | `12px`         |
| Images          | `16px`         |
| Avatars         | `50%` (full)   |
| Modals          | `24px`         |

### Borders

`0.5px` hairlines, never `1px+`. Use `rgba(10,10,10,0.06)` to `0.12` for default borders.

### Shadows

**None on UI components.** Use 0.5px borders for separation. Shadows are reserved exclusively for hero atmospheric imagery where they represent real light.

### Motion

- Spring physics only: Framer Motion `spring` with `damping: 25, stiffness: 280`.
- Never `linear` or `ease-*` curves.
- Card hovers: lift `2px`, `200ms` spring.
- Sheets/modals: spring slide-up from bottom.
- Page transitions: subtle 200ms crossfade only.
- Always respect `prefers-reduced-motion: reduce` — disable all springs and parallax.

### Iconography

**Lucide React** (outline style only). Never filled icons. Never emojis. Standard size 20px for inline, 24px for prominent, 16px for compact contexts.

### Photography rules (for content team)

- Natural light only, no filters.
- Real Asiri colors — no Instagram saturation.
- Three crops shot for every listing: 4:5, 16:9, square.
- People always show hands or faces, never faceless figures.
- No stock photography ever.

---

## 4. Bilingual & localization

### Languages

- `ar` — Arabic (default for Saudi visitors based on `Accept-Language` and geo)
- `en` — English (default for international)

### Routing

Every page exists at `/ar/*` and `/en/*`. Middleware detects locale on first visit, user can switch and the choice is persisted in a cookie.

### RTL rules

- Set `dir="rtl"` on the `<html>` element in Arabic locale.
- Use logical CSS properties exclusively: `margin-inline-start`, `padding-inline-end`, `border-inline-end`. Never `margin-left/right`.
- Mirror all directional icons (chevrons, arrows) in RTL.
- Test every screen in RTL before merging.

### Number, date, currency

- Currency: `SAR` (Saudi Riyal). Always show as `SAR 480` in English, `٤٨٠ ر.س` in Arabic — use `Intl.NumberFormat` with `currency: 'SAR'`.
- Dates: Gregorian by default, with optional Hijri toggle in user settings. Use `Intl.DateTimeFormat` with `ar-SA-u-ca-islamic` for Hijri.
- Phone format: Saudi numbers as `+966 5X XXX XXXX`.
- Time: 12-hour with AM/PM in English, 12-hour with ص/م in Arabic.

### Translation

- All UI strings go through next-intl message catalogs.
- Never hardcode user-facing strings in components.
- Leave clear `TODO(ar):` placeholders where Arabic translation is pending — never write Arabic translations as the AI; flag them for human review.

---

## 5. Tech stack

### Frontend

| Layer      | Choice                 | Version                                                                                                                                     |
| ---------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework  | Next.js                | 16 (App Router, RSC, PPR) — scaffolded 2026-05-15; create-next-app@latest resolves to 16.x, decision approved over the original 15.x target |
| Language   | TypeScript             | 5.x strict mode                                                                                                                             |
| Styling    | Tailwind CSS           | v4                                                                                                                                          |
| Components | shadcn/ui              | latest (restyled to Gharmish)                                                                                                               |
| Animation  | Framer Motion          | latest                                                                                                                                      |
| Forms      | react-hook-form + zod  | latest                                                                                                                                      |
| Tables     | TanStack Table         | latest (when needed)                                                                                                                        |
| Icons      | lucide-react           | latest                                                                                                                                      |
| i18n       | next-intl              | latest                                                                                                                                      |
| Date       | date-fns + date-fns-tz | latest                                                                                                                                      |

### Backend & data

| Layer          | Choice                                           |
| -------------- | ------------------------------------------------ |
| Database       | PostgreSQL via Supabase                          |
| ORM            | Drizzle                                          |
| Server actions | Next.js native + zod validation                  |
| Search         | Meilisearch (Arabic-aware, self-hosted or cloud) |
| Vector         | pgvector extension (for AI features later)       |
| File storage   | Cloudflare R2                                    |
| Image CDN      | Cloudflare Images or imgix                       |
| Email          | Resend                                           |
| Messaging      | WhatsApp Business API via 360dialog              |
| Maps           | Mapbox GL JS                                     |

### Auth & identity

- Supabase Auth for guest and host accounts (email + phone OTP).
- Nafath integration for Saudi host KYC (national identity verification) — Sprint 4+.
- No third-party social logins in launch (privacy posture).

### Payments

- **Primary**: Moyasar (Mada, Apple Pay, STC Pay, Visa, Mastercard).
- **Backup**: Tap Payments.
- Never store card data. PCI scope minimal.

### Infrastructure

- Hosting: Vercel (Frankfurt region for KSA latency).
- DNS + CDN: Cloudflare.
- Database region: Supabase in `eu-central-1` (Frankfurt).
- Monitoring: Sentry (errors), PostHog (product analytics), Axiom (logs), Vercel Analytics (web vitals).

---

## 6. Architecture principles

### Server-first

React Server Components by default. Mark `"use client"` only when the component truly needs interactivity (forms, hooks, browser APIs). Data fetching happens in server components or server actions, never `useEffect`.

### Type safety end-to-end

Shared zod schemas between database, API, and frontend. Drizzle generates types from the schema. No `any`, no `@ts-ignore`. If TypeScript complains, fix it — don't suppress.

### AI-friendly

This is non-negotiable and most platforms in 2026 will miss it.

- **Schema.org structured data** on every page: `TouristAttraction`, `Event`, `Product`, `Offer`, `Review`.
- **`/llms.txt` manifest** at root, listing the AI-readable site map.
- **MCP server** at `mcp.gharmish.com` exposing `search_experiences`, `get_experience`, `check_availability`, `create_booking`, `get_host`.
- **Public OpenAPI 3.1 spec** documenting all endpoints.
- **Stable, semantic URLs**: `/experiences/an-evening-with-the-flower-men`, not `/exp?id=4827`.
- **Vector embeddings** of every listing, host bio, and review in pgvector. Used for semantic search and recommendations.
- **Rich prose descriptions** on every entity, not just sparse fields. LLMs need narrative context.
- **Idempotency keys** on all booking-creation endpoints. Agents need safe retries.

### Accessibility

- WCAG 2.2 AA minimum, AAA where reasonable.
- Keyboard navigation works for every interactive element.
- Focus rings visible, never removed.
- All images have alt text in both languages.
- Color contrast checked at build time.
- `prefers-reduced-motion` honored everywhere.
- 44×44px minimum touch targets.

### Performance budget

- Lighthouse mobile ≥ 95, desktop ≥ 98.
- LCP < 2.0s, INP < 100ms, CLS < 0.05.
- FCP < 1.0s on 4G from Riyadh.
- Hero images ≤ 200KB, card thumbs ≤ 80KB.
- Use AVIF + WebP via `next/image`.
- Track real-user metrics, not lab.

### SEO

- Server-rendered metadata via `generateMetadata`.
- Sitemap auto-generated.
- `robots.txt` includes the `/llms.txt` reference.
- Open Graph and Twitter Card metadata on every public page.
- Hreflang tags for bilingual variants.

---

## 7. Code conventions

### Folder structure (feature-based, not type-based)

```
/app
  /[locale]
    /page.tsx                  # home
    /experiences/[slug]/page.tsx
    /experiences/page.tsx
    /hosts/[id]/page.tsx
    /layout.tsx
  /api/                        # only when truly needed; prefer server actions
  /llms.txt/route.ts
  /sitemap.ts
  /robots.ts
  /dev/page.tsx                # internal-only style guide (was /_dev; the
                               # underscore prefix is a Next.js private
                               # folder and is not routable, so /dev)
/features
  /experiences
    /components/
    /lib/
    /queries.ts
    /actions.ts
    /schemas.ts
    /types.ts
  /hosts/...
  /bookings/...
  /reviews/...
/components
  /ui/                         # shadcn primitives, restyled
  /layout/                     # nav, footer, language switcher
  /marketing/                  # hero, category-tile, etc.
/lib
  /utils.ts                    # cn(), formatters
  /db.ts                       # drizzle client
  /i18n.ts                     # next-intl config
  /env.ts                      # validated env (zod)
  /analytics.ts
/db
  /schema.ts                   # drizzle schema
  /seed.ts
  /migrations/
/messages
  /en.json
  /ar.json
/styles
  /globals.css
/public
  /fonts/                      # self-hosted Bricolage + IBM Plex Arabic
  /images/
```

### Naming

- Files: `kebab-case.ts`, `kebab-case.tsx`
- Components: `PascalCase`
- Hooks: `useCamelCase`
- Constants: `SCREAMING_SNAKE_CASE`
- Database tables: `snake_case`
- API routes: `kebab-case`

### TypeScript rules

- `strict: true` always.
- No `any`. No `@ts-ignore`. No `as unknown as`.
- Use `type` for unions and primitives, `interface` for object shapes that may be extended.
- Named exports only for components (default exports break refactoring tools).
- Discriminated unions for state machines.

### Component patterns

- One component per file. File name matches component name.
- Props always typed via `interface ComponentNameProps`.
- Server Components by default. `"use client"` directive only when needed.
- Composition over configuration: prefer slots and children to large prop APIs.
- Avoid `forwardRef` unless integrating with a third-party library that requires it.

### Styling

- Tailwind only. No CSS modules, no inline styles except for dynamic values.
- Reference design tokens by name: `bg-saffron-gold`, `text-sarat-black`. Never raw hex.
- Use `cn()` utility from `lib/utils.ts` for conditional classes.
- Logical properties: `ps-4 pe-2` not `pl-4 pr-2`. The Tailwind v4 config enables logical variants by default.

### Forms & validation

- Every form uses `react-hook-form` + a zod schema.
- The same zod schema validates client-side, server action, and database write.
- Show inline field errors, not toast errors.
- Submit button disables during pending state.

### Error handling

- Server actions return `{ success: true, data }` or `{ success: false, error: { code, message } }` — never throw to the client.
- Use Next.js `error.tsx` boundaries at the route group level.
- Log all unexpected errors to Sentry with user context.
- User-facing errors are translated; technical errors are not exposed.

### Git & commits

- Conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `style:`, `test:`.
- Small, atomic commits. Never one giant commit per day.
- Branch naming: `feat/short-description`, `fix/short-description`.
- PRs squash-merge into `main`.

---

## 8. Domain model

Initial entities. We'll expand as features ship.

### Host

Individual Saudi or registered tourism company. Has:

- Identity (national ID / CR number, name, photo, bio)
- License documents (MoT license, insurance, civil defense where applicable)
- Verification status (`pending | verified | suspended`)
- Payout details
- Listings (1:N → Experience)
- Languages spoken

### Experience

A bookable activity. Has:

- Slug, title (en + ar), description (en + ar)
- Category (one of fixed set)
- Host (N:1)
- Duration (minutes), max group size, min age
- Price (SAR per person)
- Location (lat/lng, city, region, named place)
- Moments (1:N → Moment) — the timeline of the experience
- Photos (1:N → Photo)
- Inclusions, what to bring, cancellation policy
- Availability rules (recurring weekly schedule + blackout dates)
- Status (`draft | live | paused | archived`)
- Featured flag (Originals tier)

### Moment

Sub-element of an Experience timeline:

- Order index, time of day, title (en + ar), description (en + ar), optional photo.

### Category

Fixed set: `nature | heritage | food | wellness | adventure | family`. Stored in DB for joins; the enum is the source of truth.

### Booking

- Guest (N:1)
- Experience (N:1)
- Date, time, party size, total amount, currency
- Status (`pending | confirmed | completed | cancelled | refunded`)
- Payment reference (Moyasar transaction ID)
- Idempotency key (for safe retries from AI agents)

### Guest

End user. Has:

- Phone (primary identifier in KSA), email (optional), name, preferred language
- Saved experiences, bookings, reviews left

### Review

- Gated by completed Booking (one review per booking)
- Rating 1–5, text (en + ar), photos
- Visible after a 24h cooldown for editing
- Host can reply once

---

## 9. Sprint 1 scope (first 2 weeks)

Build these in order:

1. **Repo + tooling**: Next.js 15, TS strict, Tailwind v4, ESLint, Prettier, Husky, lint-staged, commitlint.
2. **Bilingual routing**: next-intl with `/en` and `/ar`, RTL fully working, language switcher.
3. **Design tokens**: full color palette, typography, spacing as Tailwind theme + CSS variables. Self-hosted fonts. A `/dev` route showing every token.
4. **Core UI primitives** (shadcn-based, restyled): Button, Card, Input, Pill, Badge, Avatar, IconButton.
5. **Layout shell**: top nav (sticky, blur), footer, language switcher.
6. **Home page** (desktop + mobile) matching approved mockups.
7. **Experience detail page** (mobile + desktop) matching approved mockups.
8. **Data layer**: Drizzle schema, Supabase connection, seeded data for 6 Abha experiences.
9. **SEO foundations**: sitemap, robots.txt, `/llms.txt`, structured data on home and detail pages.

Deploy to a Vercel preview URL by end of Sprint 1.

---

## 10. Out of scope until Sprint 2+

Do not build these unless explicitly asked:

- Real authentication flows (use a stub session)
- Real payments (use Moyasar sandbox at most)
- Host dashboards
- Admin panel
- Search and filtering UI (basic listing only)
- AI features (conversational search, AI host coach, etc.)
- WhatsApp integration
- Email sending
- Cities beyond Abha
- Mobile app (web-only until validated)

---

## 11. How Claude Code should work with this brief

- **First message of every session**: read this file and `CLAUDE.md` before doing anything else.
- **When unsure about design or brand**: refer to this brief; if still unclear, ask.
- **When introducing a new pattern, library, or convention**: explain the reasoning, get approval before installing.
- **When this brief and a request conflict**: surface the conflict, don't silently override the brief.
- **When the brief is silent on a decision**: pick the simplest option that doesn't constrain future choices, and note the decision.

This brief evolves. When we agree on a new convention, update this file in the same commit.
