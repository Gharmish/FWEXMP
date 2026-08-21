# Gharmish — Project Brief

> This document is the single source of truth for the Gharmish project. Every Claude Code session starts by reading this file. When in doubt about brand, design, architecture, or scope, this brief wins.

---

## 1. What we're building

Gharmish (غارميش) is a curated experiences marketplace for Saudi Arabia, launching in Abha (Aseer region). We connect vetted local hosts — individual Saudis and tourism companies — with guests seeking authentic Aseeri experiences: heritage tours, mountain adventures, food, wellness, family activities, and premium "Originals."

We are not a passive listing platform. We are a **partnership marketplace**: we co-create experiences with hosts, provide photography, training, and distribution, in exchange for a fair revenue share. Quality and curation are the moat. Gharmish does not provide insurance — hosts carry full liability for the experiences they deliver (owner decision 2026-07-07); the terms page and the host-onboarding consent reflect that.

**Initial launch market**: Abha and surrounding Aseer region, summer 2026.
**Primary audience year 1**: Saudi domestic travelers (Arabic-first).
**Secondary audience year 2+**: International visitors (English).

---

## 2. Brand

### Name

**Gharmish** (English) / **غارميش** (Arabic). The name evokes Garmisch-Partenkirchen, positioning Abha as Saudi Arabia's alpine destination — green, cool, cultural, distinct from desert KSA.

### Tone of voice

Calm, confident, culturally rooted, premium without pretension. Apple-like restraint. Never markety, never loud, never discount-driven. We speak as a host introducing a friend to their hometown.

### Positioning statement

> Experiences hosted by the people who know the place best.

(Scalable master positioning — owner brand mandate 2026-08-14. Gharmish
is not an Aseer-only brand: Aseer is the birthplace and "chapter one",
kept strongly present in destination-level storytelling — hero eyebrow,
"Explore Aseer" CTAs, the Chapter One home section — while brand-level
copy (siteMeta, footer tagline, master headline) stays place-agnostic so
future destinations never force a rebrand. The previous Aseer-fixed line
survives verbatim in destination copy, not as the brand definition.)

### Brand pillars

1. **Authenticity** — every experience ties to Aseeri culture, geography, or community.
2. **Partnership** — hosts are partners, not inventory.
3. **Restraint** — design, copy, and feature set are deliberate. Less is the point.

---

## 3. Design system

### Color palette

Use these tokens exclusively. No off-palette hex values anywhere in the codebase.

| Token           | Hex       | Role                                                                                                             |
| --------------- | --------- | ---------------------------------------------------------------------------------------------------------------- |
| `sarat-black`   | `#0A0A0A` | Text, dark sections, Originals tier                                                                              |
| `saffron-gold`  | `#F5B800` | Primary CTAs, premium accent, emphasis                                                                           |
| `sarawat-blue`  | `#2E5BFF` | Family category, informational links                                                                             |
| `soudah-sunset` | `#E85D27` | Adventure category, warmth                                                                                       |
| `juniper-green` | `#1F7A5C` | Nature category, success states                                                                                  |
| `al-qatt-red`   | `#C8312A` | Heritage category, destructive/error states                                                                      |
| `white`         | `#FFFFFF` | Primary background, all surfaces, text on dark sections (premium redesign 2026-06; replaces Fog White `#F5F2EC`) |
| `mist`          | `#FAFAFA` | Secondary surfaces only: section bands, wells, table headers (`mist-deep` `#F5F5F5` for hover/pressed)           |
| `honey-amber`   | `#F4B898` | Soft accent, secondary surfaces                                                                                  |
| `habala-mist`   | `#BFD4E8` | Soft accent, info surfaces                                                                                       |
| `tihama-coral`  | `#FFB089` | Soft accent                                                                                                      |
| `wadi-mint`     | `#9FD9C0` | Wellness category                                                                                                |
| `rijal-clay`    | `#8B2E20` | Deep accent, sold-out / past states                                                                              |

Each primary color has a `-50`, `-100`, `-200`, `-400`, `-600`, `-800`, `-900` ramp generated for fills and tints — keep these in `tailwind.config.ts`.

#### Semantic status tones (premium redesign 2026-06)

Status chips and banners always pair a `*-surface` background with the matching text tone. All are aliases onto the brand ramps — no new hex:

| Semantic  | Text tone           | Surface             | Used for                                                           |
| --------- | ------------------- | ------------------- | ------------------------------------------------------------------ |
| `success` | `juniper-green-800` | `juniper-green-100` | Confirmed, completed, paid                                         |
| `pending` | `saffron-gold-800`  | `saffron-gold-100`  | Request-to-book awaiting host approval — never the confirmed green |
| `warning` | `soudah-sunset-800` | `soudah-sunset-100` | Expiring soon, action needed                                       |
| `error`   | `al-qatt-red-800`   | `al-qatt-red-100`   | Declined, failed, destructive                                      |
| `info`    | `habala-mist-800`   | `habala-mist-100`   | Neutral notices, announcements                                     |

### Category-to-color map (immutable)

| Category                 | Color                                | Arabic               |
| ------------------------ | ------------------------------------ | -------------------- |
| Nature                   | Juniper Green                        | الطبيعة              |
| Heritage                 | Al-Qatt Red                          | التراث               |
| Food & coffee            | Saffron Gold                         | الطعام والقهوة       |
| Wellness                 | Wadi Mint                            | العافية              |
| Adventure                | Soudah Sunset                        | المغامرة             |
| Family                   | Sarawat Blue                         | العائلة              |
| Women only               | Tihama Coral                         | للنساء فقط           |
| Originals (premium tier) | Sarat Black bg + Saffron Gold accent | تجارب غارميش الأصلية |

### Typography

**English**: Bricolage Grotesque (variable font, weights 200–800, exploit the `opsz` optical-size axis aggressively).
**Arabic**: IBM Plex Sans Arabic (weights 100–700).

**Weights used in product: 400 and 500 — plus 600 for Display, H1, and large stat numerals only** (premium redesign 2026-06; owner-approved exception). Never 600 in body copy, labels, or H2/H3. Never 700 or 800 anywhere. The restraint is still the brand.

Load both via `next/font` with `display: swap`. Self-host, do not link to Google Fonts in production.

#### Type scale (English)

| Role       | Size  | Weight | opsz | Tracking           |
| ---------- | ----- | ------ | ---- | ------------------ |
| Display    | 72–96 | 600    | 96   | -0.04em            |
| H1         | 48–64 | 600    | 56   | -0.035em           |
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

**None on inline UI components** — cards, buttons, inputs stay shadowless; 0.5px borders do the separation. One exception (premium redesign 2026-06): the single `--shadow-overlay` token (`0 8px 32px rgb(10 10 10 / 0.10), 0 1px 2px rgb(10 10 10 / 0.04)`) is allowed on floating layers only: modals, dropdowns, popovers, and the sticky booking bar. Shadows in imagery remain reserved for real light in hero photography.

### Motion

- Spring physics only: Framer Motion `spring` with `damping: 25, stiffness: 280`.
- Never `linear` or `ease-*` curves.
- Card hovers: lift `2px`, `200ms` spring.
- Sheets/modals: spring slide-up from bottom.
- Page transitions: subtle spring crossfade (opacity only).
- Always respect `prefers-reduced-motion: reduce` — disable all springs and parallax.
- **Exception — cheap affordances**: hover/press feedback on buttons, icon-buttons,
  and nav links may use a short CSS `transition` (≤200ms) on `transform`/`opacity`/`color`.
  This keeps those controls usable as Server Components without shipping JS. The
  spring requirement is binding for every other motion (entrance/reveal, card lift,
  modal/sheet, page transition) — route those through `components/ui/motion.tsx`,
  never a raw `linear`/`ease-*` curve.
- **Primitive set (animation pass 2026-07)**: `FadeIn` (scroll reveal), `Stagger`/
  `StaggerItem` (60ms cascade), `HoverLift`, `Pop`, `PageTransition`, plus `RiseIn`
  (transform-only mount rise — the only primitive allowed on an LCP candidate; never
  wrap hero H1s in an opacity-from-0 primitive), `MountFade` (mount fade; static on
  the initial document load unless `eager`), `FadeSwap` (keyed enter-fade for RSC
  payload swaps — filter/sort results), `Draw` (spine/hairline growth), `ParallaxY`
  (subtle scroll drift; desktop fine-pointer only), and `AnimatedNumber` (stat
  count-up; renders the final value under SSR/reduced motion). Demos live in `/dev`.
  Hero pass 2026-07 added `RiseInWords` (word-by-word RiseIn cascade for hero
  headlines — same opacity-stays-1 LCP contract), a `scale` prop on `RiseIn`
  (Ken Burns settle for hero imagery), and `TracePath` (SVG-path variant of
  Draw for decorative hairline illustrations, e.g. the home hero's Sarawat
  ridgeline divider).
- **Overlays** (Dialog, Sheet, ConfirmSubmit, Toast in `components/ui/`) ride Base UI
  for focus/aria/dismissal and the one spring for enter/exit. `ConfirmSubmit`
  replaces `window.confirm` for destructive actions. Animate transform/opacity only —
  never layout properties. All new motion transform/opacity, RTL-checked, and static
  under `prefers-reduced-motion`.

### Iconography

**Lucide React** (outline style only). Never filled icons — **except rating stars, which are solid-filled in Saffron Gold** (`fill-current`), with unrated stars muted. Never emojis. Standard size 20px for inline, 24px for prominent, 16px for compact contexts.

### Photography rules (for content team)

- Natural light only, no filters.
- Real Aseeri colors — no Instagram saturation.
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

- Currency: `SAR` (Saudi Riyal). Always show as `SAR 480` in English, `480 ر.س` in Arabic — use `Intl.NumberFormat` with `currency: 'SAR'`.
- Digits: **always Western/Latin (`0123456789`) in both locales — never Arabic-Indic numerals (`٠١٢٣٤٥٦٧٨٩`)**, including inside Arabic translation strings. Pass `numberingSystem: 'latn'` to every `Intl.NumberFormat`/`Intl.DateTimeFormat`. Arabic month names and ص/م meridiems stay Arabic; only the digits are Latin.
- Dates: Gregorian by default, with optional Hijri toggle in user settings. Use `Intl.DateTimeFormat` with `ar-SA-u-ca-islamic` for Hijri.
- Phone input is INTERNATIONAL (country-code picker, default +966) — a deliberate override of the Saudi-only rule; don't revert. Display for Saudi numbers stays `+966 5X XXX XXXX`.
- Time: 12-hour with AM/PM in English, 12-hour with ص/م in Arabic.

### Translation

- All UI strings go through next-intl message catalogs.
- Never hardcode user-facing strings in components.
- Leave clear `TODO(ar):` placeholders where Arabic translation is pending — never write Arabic translations as the AI; flag them for human review.

---

## 5. Tech stack

### Frontend

| Layer      | Choice                     | Version                                                                                                                                     |
| ---------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework  | Next.js                    | 16 (App Router, RSC, PPR) — scaffolded 2026-05-15; create-next-app@latest resolves to 16.x, decision approved over the original 15.x target |
| Language   | TypeScript                 | 5.x strict mode                                                                                                                             |
| Styling    | Tailwind CSS               | v4                                                                                                                                          |
| Components | Base UI (`@base-ui/react`) | shadcn-style primitives restyled to Gharmish, built on Base UI                                                                              |
| Animation  | Framer Motion              | latest                                                                                                                                      |
| Image crop | react-easy-crop            | latest (avatar / photo cropper)                                                                                                             |
| Forms      | react-hook-form + zod      | latest                                                                                                                                      |
| Tables     | TanStack Table             | latest (when needed)                                                                                                                        |
| Icons      | lucide-react               | latest                                                                                                                                      |
| i18n       | next-intl                  | latest                                                                                                                                      |
| Date       | date-fns + date-fns-tz     | latest                                                                                                                                      |

### Backend & data

| Layer          | Choice                                                                                              |
| -------------- | --------------------------------------------------------------------------------------------------- |
| Database       | PostgreSQL via Supabase                                                                             |
| ORM            | Drizzle                                                                                             |
| Server actions | Next.js native + zod validation                                                                     |
| Search         | Meilisearch (Arabic-aware, self-hosted or cloud)                                                    |
| Vector         | pgvector extension (for AI features later)                                                          |
| File storage   | **Supabase Storage** (public `photos`/`avatars`, private `kyc-documents`). R2 not used.             |
| Image CDN      | **`next/image`** on Vercel. No third-party image CDN.                                               |
| Email          | Resend                                                                                              |
| Messaging      | WhatsApp Business API via **Twilio** (not 360dialog).                                               |
| Maps           | **Leaflet + OpenStreetMap** (keyless). Owner rejected keyed providers — Mapbox/Google are NOT used. |

### Auth & identity

- Supabase Auth for guest and host accounts (email + phone OTP).
- Nafath integration for Saudi host KYC (national identity verification) — Sprint 4+.
- No third-party social logins in launch (privacy posture).

### Payments

- **Live gateway (implemented)**: HyperPay / OPPWA COPYandPAY widget (Mada-first,
  then Visa/Mastercard). This supersedes the original Moyasar plan below.
- Settlement is verified server-side against HyperPay (never the browser redirect),
  with a reconciliation pass in the release-holds cron for holds stuck in
  `processing`. The OPPWA webhook IS BUILT and live at
  `app/api/webhooks/hyperpay` (AES-256-GCM decrypt → `settleBooking` →
  receipt); it answers 503 until `HYPERPAY_WEBHOOK_SECRET` is set.
  (Corrected 2026-07-28: this line previously said "reserved but not yet
  built", which was false and directly caused a P1 fix to be built on a
  wrong premise.)
- **Original plan (superseded)**: Moyasar primary, Tap Payments backup. Retained
  as future options.
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
- Focus rings visible, never removed. A single global `:focus-visible` ring is the
  source of truth (`app/globals.css`); components must not add their own.
- A skip-to-content link precedes the nav on every page (WCAG 2.4.1).
- All content images have descriptive alt text in the **active locale** (resolved
  per-locale via next-intl), never empty. (We render one locale at a time, so alt
  is the current-locale string, not both languages concatenated.)
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

- Server actions never throw to the client. Failures return
  `{ success: false, message: <per-feature union>, fields?, values? }`;
  success returns `{ success: true, ... }` or throws Next's `redirect()`
  (2026-07: doc updated to match the convention the codebase actually
  uses — the `error: { code, message }` shape was never built).
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

- Identity (national ID / CR number, legal name, date of birth for individuals, photo, bio)
- KYC documents, per applicant type (2026-07-07 — no insurance / civil-defense documents):
  - Individual: national ID + IBAN letter (MoT freelance tourism document optional)
  - Company: CR certificate + tourism licence + authorized-signatory ID + IBAN letter (VAT certificate if registered)
- Verification status (`pending | verified | suspended`)
- Payout details (Saudi IBAN + bank + account holder — collected at onboarding, checksum-validated, name-matched against the IBAN letter by the reviewing admin)
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

Fixed set: `nature | heritage | food | wellness | adventure | family | women_only`. Stored in DB for joins; the enum is the source of truth. (`women_only` added 2026-07-08, owner decision — Tihama Coral, Venus icon.)

### Booking

- Guest (N:1)
- Experience (N:1)
- Date, time, party size, total amount, currency
- Status (`pending | confirmed | completed | cancelled | refunded`)
- Payment reference (Moyasar transaction ID)
- Idempotency key (for safe retries from AI agents)
- Reference code (`GH-XXXXXX`, unambiguous alphabet, unique) — the
  _human_ identity shown to guests, hosts, admin, and emails
  (2026-06-13). The idempotency-key UUID stays the URL capability and
  is never asked of a human.

### Guest

End user. Has:

- Phone (primary identifier in KSA), email (optional), name, preferred language
- Saved experiences, bookings, reviews left

### Review

- Gated by completed Booking (one review per booking)
- Rating 1–5, text (en + ar), photos
- Visible after a 24h cooldown for editing
- Host can reply once

### Marketplace policies (owner decisions, 2026-06-10)

- **Host self-service**: hosts manage their own booking requests
  (accept / decline / complete / cancel at `/host/bookings`) and see
  earnings + payout history at `/host/earnings` (IBAN self-managed).
  Admin keeps full override powers. This supersedes the earlier
  admin-operated-only booking flow.
- **Guest cancellation** (rewritten 2026-07-28 — the single-window model
  below was retired long ago and this text still described it, which
  would make anyone computing a refund from the brief produce the WRONG
  NUMBER): a guest may cancel any booking before it starts. What a
  _paid_ booking refunds comes from the **per-experience cancellation
  tier snapshotted onto the booking at creation** (`policy_tier`,
  `free_cancel_hours`, `partial_refund_hours`, `partial_refund_bps`,
  `reschedule_cutoff_hours`) — NOT from a platform-wide setting. The
  engine is `features/bookings/lib/policy.ts`; the tier PARAMETERS live
  in the **`cancellation_policies` DB table** (one row per tier, edited
  in `/admin/settings`, read via `lib/cancellation-policy.ts`, code
  defaults as the fallback — unified 2026-08-08); tiers include a **50%
  partial** step and a reschedule right, and every surface (pickers,
  policy pages, both locales) renders from the same rows. Always read
  the booking's own snapshot: a later tier edit must never restate an
  existing booking.
  **Refunds are manual bank transfers** (owner decision 2026-08-21,
  `platform_settings.refunds_via_bank_transfer`, default ON): every
  refund owed is stamped `refund_due_sar`, the guest supplies bank
  name / IBAN / beneficiary (collected in the cancel form, or on the
  booking page afterwards; IBAN encrypted at rest), and the admin wires
  it from `/admin/bookings/[id]` then records it via the admin refund
  action. Turning the setting OFF restores gateway-first refunds via the
  HyperPay refund API with the manual queue as the fallback.
- **VAT** (updated 2026-07-07 — supersedes the always-disclose rule):
  Gharmish is below the ZATCA mandatory registration threshold
  (375,000 SAR taxable turnover / 12 months) and is NOT VAT-registered,
  so **no surface mentions VAT while `platform_settings.vat_enabled` is
  off** (default). On registration day the owner turns the toggle on in
  `/admin/settings` (requires the 15-digit ZATCA registration number).
  From that moment each payment settlement stamps the rate + number on
  the booking (`bookings.vat_rate_bps` / `vat_registration_number`);
  receipts render exclusively from that snapshot, so history is never
  restated. Listed prices stay **VAT-inclusive** — when enabled the
  portion is disclosed as "Includes VAT (15%)" (`total × rate/(10000+rate)`),
  never added on top, so guest prices don't change at the flip. The
  guest's document at `/book/confirmed/[ref]/invoice` is a plain
  "Receipt" pre-registration and a ZATCA Phase-1 **simplified tax
  invoice** (VAT number + TLV QR code) post-registration; Phase-2
  (Fatoora integration) is a later revenue wave.
  **Money split (owner decision 2026-07-07, principal model)**: Gharmish
  is merchant of record. Once a booking carries a VAT snapshot,
  commission is calculated on the **ex-VAT net** and the host is paid
  from the net (`vat + commission + payout = total`, mirrored in
  `splitCommission` and `payoutExpr` — change both). Pre-registration
  bookings keep the original gross formula forever. Refunded tax
  invoices are reversed by a **credit note** (`CN-<ref>`, own QR) on the
  invoice page. Credit notes reverse **what was actually refunded**, not
  the whole invoice — partial-policy refunds are real and a full
  reversal over-states the VAT credit (corrected 2026-07-28; the old
  "refunds are always full-amount" claim was false and had produced
  exactly that bug in the filing report). `/admin/vat` is the
  filing surface (tax-point basis, CSV export, rolling-12-month
  threshold monitor); the cron alerts at 90% of the 375K mandatory
  threshold and flags any paid booking missing its VAT stamp. Hosts get
  a printable **payout statement** per transfer at
  `/host/earnings/statements/[payoutId]` (payment advice, not a tax
  invoice). Invoices are immutable via settlement snapshots
  (`invoice_item_en/ar`, `billed_name`).

---

## 9. Sprint 1 scope (first 2 weeks)

> **Status (current):** the build has progressed through Sprints 1–4 — real
> Supabase Auth (phone + email OTP), the full booking + HyperPay payment flow,
> reviews, host dashboards, and the admin panel are live. §9 and §10 below
> describe the _original_ Sprint-1 plan and the early out-of-scope list; they
> are kept for history, not as a description of current state.

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
