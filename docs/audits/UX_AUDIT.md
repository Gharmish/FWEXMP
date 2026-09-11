# Gharmish UI/UX Audit

**Date:** 2026-07-13 · **Branch:** `feat/notifications-foundation` · **Method:** static audit of the actual source (no code changed). Six parallel passes: visual consistency, information hierarchy + microcopy, state coverage, forms, accessibility (WCAG 2.1/2.2 AA), responsive + perceived performance. Every finding cites file:line; the top-severity claims were independently re-verified against the source.

**Deliberately not flagged** (documented owner decisions): calendar day cells < 44px (7-col grid at 375px, `max-w-xs` cap), footer dual-render accordions, payment-mark brand colors, day-preset date filter, SAR shown in EN, international phone picker, no `loading.tsx` above `[locale]` root / public `[slug]` pages (soft-404 constraint), AI-authored `ar.json`, no-insurance copy, 2026-07 audit deferrals.

---

## Phase 1 — Map

- **Framework:** Next.js 16 App Router, RSC-first, React 19, TypeScript strict. `force-dynamic` at the locale layout.
- **Styling:** Tailwind v4, CSS-first tokens — the entire theme lives in `@theme` in [app/globals.css](app/globals.css) (13 brand colors + ramps, semantic status pairs, radius tokens, one `--shadow-overlay`, 8-pt spacing contract). `BRIEF.md` §3 is the written source of truth.
- **Components:** Base UI primitives restyled in `components/ui/` (~21), Framer Motion via `components/ui/motion.tsx`, lucide-react, Leaflet/OSM maps.
- **i18n:** next-intl, `/[locale]` (`ar` default + `en`), full RTL with logical properties (zero physical-direction utilities found — exemplary).
- **Key flows:** guest: home → `/experiences` (filter rail/sheet) → `[slug]` detail → `/book/[reference]/pay` (HyperPay) → `/book/confirmed/[ref]` (+ invoice) → review. Host: `/hosting` → `/host/apply` (KYC) → `/host` dashboard. Admin: 20+ pages under `/admin`. 57 pages total.
- **Boundaries:** `loading.tsx` only at admin, catalog, host dashboard, wishlist; `error.tsx` at locale root, admin, host dashboard.

**Overall verdict:** unusually disciplined foundation — zero raw hex, zero rogue shadows, exemplary RTL, real skip link + landmarks, a gold-standard booking form, reduced-motion correctly closed at both the CSS and Framer layers. The real problems cluster in four themes: **(1)** errors swallowed into reassuring empty states on operational surfaces, **(2)** bottom-of-viewport overlay collisions on mobile, **(3)** failed submits wiping user input, **(4)** systemic token drift in spacing/cards.

---

## Critical — blocks users

### C1. Cookie banner and toasts cover the mobile booking CTA

**Where:** [cookie-notice.tsx:57](components/layout/cookie-notice.tsx:57) (`fixed start-4 bottom-4 z-[60]`, `max-w-sm w-[calc(100%-2rem)]`), [toast.tsx:139](components/ui/toast.tsx:139) (`fixed end-4 bottom-4 z-[70]`), vs the mobile sticky book bar [booking-request-form.tsx:726](features/bookings/components/booking-request-form.tsx:726) (`fixed inset-x-0 bottom-0 z-40`).
**Why:** a first-visit guest landing on an experience detail page at 375px — the most common paid-ad entry — gets the consent banner layered directly over the price + "Book" button until dismissed. Toasts fired during booking hide the submit button. This sits on the single most important pixel real estate in the funnel.
**Fix:** a shared "bottom overlay stack" offset: on pages with the `lg:hidden` sticky bar, the bar sets a CSS var (its height + `env(safe-area-inset-bottom)`) and cookie notice/toast viewport use `bottom-[calc(var(--bottom-bar,0px)+1rem)]`.

### C2. Rate-limited OTP verify fails silently at sign-in

**Where:** [sign-in-form.tsx:267](<app/[locale]/(auth)/sign-in/sign-in-form.tsx:267>) maps only `message === 'server'`; [features/auth/actions.ts:316](features/auth/actions.ts:316) and `:399` return `message: 'rate_limited'` with no `fields.code`.
**Why:** the user taps "Verify", the button un-pends, and nothing on screen changes. At the highest-friction gate of the product, a silent failure reads as "the app is broken" and the user churns.
**Fix:** map `rate_limited` → a visible error on the code stage ("Too many attempts — wait a minute and try again"). Related: there is no resend-code affordance at all (M27).

### C3. A transient DB error sends verified hosts to "Apply to become a host"

**Where:** [features/host-dashboard/queries.ts:86-89](features/host-dashboard/queries.ts:86) catches every DB error and returns `null`; every host page treats `null` as "not a host" and redirects — e.g. [host/(dashboard)/bookings/page.tsx:56-58](<app/[locale]/host/(dashboard)/bookings/page.tsx:56>), same in `page.tsx`, `earnings`, `experiences`, `reviews`, `profile`.
**Why:** during a pooler hiccup (a documented failure mode of this stack), a verified host with live bookings lands on the application page — which reads as "your account is gone." The existing `host/(dashboard)/error.tsx` boundary never fires because the error never propagates.
**Fix:** rethrow from `getHostDashboard` (or return `{ kind: 'error' }`) so the error boundary renders; reserve `null` strictly for "no hosts row."

---

## High — causes friction or errors

### H1. Guest cancellation email states the refund policy backwards (both locales)

**Where:** [messages/en.json:2470](messages/en.json:2470) `cancelIntroForfeited`: _"As the cancellation was inside the free-cancellation window, the payment was not refunded."_ Sent on the `forfeited` branch ([booking-email.ts:379-382](features/bookings/lib/booking-email.ts:379)). `ar.json` mirrors the inversion.
**Why:** inside the window is exactly when a guest **is** refunded. This money email tells a guest who forfeited that they cancelled in time and were still not paid — a guaranteed dispute/chargeback generator. Verified against source.
**Fix:** "Your booking has been cancelled. Because the free-cancellation window had already passed, the payment was not refunded." (matches the correct in-app copy at `en.json:2314`). Fix both locales.

### H2. Host bookings/earnings render friendly empty states on DB errors

**Where:** [features/host-bookings/queries.ts:177-180](features/host-bookings/queries.ts:177) catches → empty buckets → "you have no bookings" EmptyState ([bookings/page.tsx:325-339](<app/[locale]/host/(dashboard)/bookings/page.tsx:325>)). Same for earnings: [features/host-earnings/queries.ts:163-165](features/host-earnings/queries.ts:163) → zero-earnings EmptyState ([earnings/page.tsx:107-112](<app/[locale]/host/(dashboard)/earnings/page.tsx:107>)).
**Why:** a host checking today's pickups during an outage is told nothing is scheduled — they may not show up to a real booking. Money reading as zero on a query failure is a support-ticket generator.
**Fix:** rethrow (the route already has `error.tsx`) or return an error flag rendered as "couldn't load — retry."

### H3. Admin bookings: stats and search silently operate on a 500-row window

**Where:** [features/admin/bookings/queries.ts:25,40](features/admin/bookings/queries.ts:25) caps at 500; the status counts strip and the GET-form search/status filters run **in JS over those 500 rows** ([admin/bookings/page.tsx:70-79](app/[locale]/admin/bookings/page.tsx:70), render at `:261`).
**Why:** at 10k bookings the admin sees "Total: 500" and a reference search that misses anything older than the newest 500 — with zero truncation indication. Wrong numbers presented confidently.
**Fix:** push filters + counts into SQL (the guests directory at `features/admin/guests/queries.ts:36-42` already does) or at minimum show "showing latest 500" when `rows.length === LIMIT`, and paginate.

### H4. Host and admin experience forms wipe everything typed on a failed submit

**Where:** [experience-form.tsx:263-641](<app/[locale]/host/(dashboard)/experiences/[id]/experience-form.tsx:263>) — every input uncontrolled `defaultValue={experience?.x}`; `HostExperienceState` ([features/host-experiences/actions.ts:36](features/host-experiences/actions.ts:36), `:176`) has no `values` echo. Identical in [admin-experience-form.tsx:313-530](app/[locale]/admin/experiences/[id]/edit/admin-experience-form.tsx:313).
**Why:** React 19 resets uncontrolled fields after a form action. A host writes a 3,000-char bilingual description, gets a `title_short` error back, and the entire form resets to stored values (create mode: to seed defaults). This is the longest form in the product.
**Fix:** echo submitted values in the failure state and render `values.x ?? experience?.x` — the exact pattern `BookingRequestForm` already implements.

### H5. Admin guest-edit form shows nothing at all on validation failure

**Where:** [guest-edit-form.tsx:94-98](features/admin/users/components/guest-edit-form.tsx:94) — `generalError` explicitly excludes `message === 'validation'`, and there are no per-field messages (only `aria-invalid` borders). No values echo either. Check `host-edit-form.tsx` in the same folder for the same pattern.
**Why:** the admin clicks Save, fields silently revert, a border flashes red with no text. Silent failure + data loss in one control.
**Fix:** per-field messages + a validation summary; echo values.

### H6. "Mark paid" records an irreversible payout with zero confirmation

**Where:** [mark-paid-button.tsx:36-48](app/[locale]/admin/payouts/mark-paid-button.tsx:36) — single click, no `ConfirmSubmit`.
**Why:** one stray click records that hundreds or thousands of SAR were transferred to a host. Every comparable destructive action in the app (refund, suspend guest, VAT enable) is confirmed — this one moves the most money and isn't.
**Fix:** wrap in `ConfirmSubmit` with amount + host name in the description.

### H7. Awaiting-payment page: the wrong primary CTA wins the scroll

**Where:** [book/confirmed/[ref]/page.tsx:422-429](app/[locale]/book/confirmed/[ref]/page.tsx:422) renders primary-lg "Complete payment" in the header; `:710-719` renders primary-lg "Keep exploring" in the footer in every non-failed state, including `isAwaitingPayment`.
**Why:** when a spot is held and money is owed, the last solid button the guest sees invites them to leave the funnel. The `isFailed` branch (`:683-699`) already does this right.
**Fix:** while `isAwaitingPayment`, demote footer links to `secondary` (or repeat "Complete payment" there).

### H8. Guest- and host-facing error copy exposes infrastructure internals

**Where:** [messages/en.json:2317](messages/en.json:2317), `:2347` ("The database isn't configured in this environment." on the booking confirmation page), `:2698`, `:2725`, `:2748` ("…need a database connection"), host-facing `:1896`, `:1965`, `:1709`, `:1651`.
**Why:** a guest should never read the word "database" on a page holding their money; it reads as broken and alarming. The right pattern already exists at `en.json:2448` ("Promo codes are temporarily unavailable.").
**Fix:** "This isn't available right now — try again in a moment." for all guest/host `noDb` keys; keep technical detail in `admin.*` only.

### H9. Photo-gallery lightbox is an `aria-modal` dialog with no focus management

**Where:** [photo-gallery.tsx:220-276](features/experiences/components/photo-gallery.tsx:220) — hand-rolled `<div role="dialog" aria-modal="true">`; focus is never moved in, never trapped, never restored.
**Why:** keyboard focus stays on the mosaic tile behind the overlay; Tab walks the background page that `aria-modal` has hidden from screen readers — SR users hear nothing while focus moves through invisible content. WCAG 2.4.3 / 2.1.2. Every other overlay correctly uses Base UI.
**Fix:** render the lightbox through the existing Base UI `Dialog` (trap/restore/Esc for free), or add initial focus → close button, a trap, and restore-on-close.

### H10. Focus ring fails in forced-colors mode and is below 3:1 on white

**Where:** [app/globals.css:200-212](app/globals.css:200) — `* { outline: none }` plus a box-shadow-only `:focus-visible` ring whose outer layer is `rgb(10 10 10 / 0.4)` → #9d9d9d on white = **2.71:1** (needs 3:1, WCAG 1.4.11).
**Why:** in Windows High Contrast, box-shadows are suppressed and outlines were globally removed — keyboard focus has **zero** indicator for exactly the users who need it most (WCAG 2.4.7).
**Fix:** two lines: add `outline: 2px solid transparent; outline-offset: 2px;` inside `:focus-visible` (repainted in `Highlight` under forced-colors, invisible elsewhere), and raise the ring alpha to ≥0.55.

### H11. No streaming anywhere: every page blocks on navbar auth queries; home blocks on 5 awaited fetches

**Where:** [navbar.tsx:34-38](components/layout/navbar.tsx:34) awaits `getCurrentUser()` + `currentUserIsHost()` in the locale layout render path; [page.tsx:76-82](app/[locale]/page.tsx:76) awaits `Promise.all` of 5 queries before byte one. `grep Suspense` across home/catalog/detail: 0 hits; the layout is `force-dynamic`.
**Why:** with no root `loading.tsx` (deliberate) and no in-page Suspense, every visit — including mid-checkout pages — shows a white/stale screen for the full TTFB of the slowest query. Given the documented pooler tail-latency incidents, this is the single biggest perceived-perf lever.
**Fix:** wrap the auth-dependent nav segment in `<Suspense fallback={signed-out links}>`; on home, render hero + category tiles immediately and wrap Originals row, hosts row, and social-proof strip each in `<Suspense>` with card skeletons (safe — `notFound()` is not involved on these sections). Same pattern for the detail page's reviews/aggregates ([experiences/[slug]/page.tsx:145-168](app/[locale]/experiences/[slug]/page.tsx:145), after the slug fetch + `notFound()`).

### H12. Latent: gallery dual-render will double-fetch every photo once real images land

**Where:** [photo-gallery.tsx:146-159](features/experiences/components/photo-gallery.tsx:146) — mobile `PhotoCarousel` (`sm:hidden`, `sizes="100vw"`, `priority`) and desktop mosaic (`hidden sm:grid`) are both mounted; `display:none` doesn't stop `<img>` loading, and `priority` on the hidden carousel emits a preload.
**Why:** on desktop, all N gallery images fetch at ~1280–2048px for a carousel nobody sees, competing with the visible mosaic for LCP bandwidth. Latent only because `experiences.images` is empty today — it bites the day photos land.
**Fix:** viewport-gate the `sizes` (carousel `sizes="(min-width:640px) 1px, 100vw"` and inverse for the mosaic), or mount one variant via a `matchMedia` hook.

---

## Medium — inconsistency

### Design-token drift (systemic)

### M1. Off-grid spacing: ~290 occurrences of 20/40/56px and fractional steps

**Where:** `gap-5` ×52, `gap-10` ×50, `p-5` ×35, `p-10` ×25, `mt-10` ×23, `pt-10` ×18, `py-14` ×7, plus ~57 fractional (`gap-0.5/1.5/2.5`, `px-3.5`). On the highest-traffic surfaces: [page.tsx:146,201](app/[locale]/page.tsx:146), [experiences/[slug]/page.tsx:416,457,469,576](app/[locale]/experiences/[slug]/page.tsx:416), [catalog page.tsx:174,217](<app/[locale]/experiences/(catalog)/page.tsx:174>), [footer.tsx:123](components/layout/footer.tsx:123), [hosting/page.tsx:107-223](app/[locale]/hosting/page.tsx:107) (`py-14` ×6).
**Why:** the brief's 8-pt contract ([globals.css:155-159](app/globals.css:155)) allows `1,2,3,4,6,8,12,16,20,30`; two parallel rhythm scales now coexist, so sections never quite align — and Tailwind v4 accepts any integer, so drift compounds.
**Fix:** codemod `-5→-4/-6`, `-10→-8/-12`, `-14→-12/-16`, fractionals → nearest step; add a CI grep to hold the line.

### M2. Card primitive abandoned: 132 hand-rolled card class strings across 63 files vs 14 `<Card>` uses

**Where:** the string `border-sarat-black/8 rounded-card [border-width:0.5px]` copy-pasted 132×; two pages re-declare local constants that have already diverged: [admin/page.tsx:122](app/[locale]/admin/page.tsx:122) and [admin/vat/page.tsx:63](app/[locale]/admin/vat/page.tsx:63).
**Fix:** export `cardVariants` from [card.tsx](components/ui/card.tsx) for `<section>`/`<ul>` hosts; adoption pass; delete local constants.

### M3. `divide-y` renders 1px dividers inside 0.5px-bordered cards (28×)

**Where:** e.g. [host bookings page.tsx:245](<app/[locale]/host/(dashboard)/bookings/page.tsx:245>), [earnings page.tsx:305,356](<app/[locale]/host/(dashboard)/earnings/page.tsx:305>), [admin/users/page.tsx:117](app/[locale]/admin/users/page.tsx:117).
**Why:** inner dividers render twice the weight of the card border wrapping them — visibly heavier hairlines inside than outside, against the brief's 0.5px rule.
**Fix:** a `divide-hairline` utility (or `[&>*+*]:[border-top-width:0.5px]`) wherever `divide-y` pairs with a hairline card.

### M4. Hand-rolled Button clones with real drift (28 composites)

**Where:** [admin/users/page.tsx:108](app/[locale]/admin/users/page.tsx:108) + [admin/guests/page.tsx:100](app/[locale]/admin/guests/page.tsx:100) (`h-11 px-5 text-sm`, no hover lift — primary is `h-11 px-6 text-base`); upload labels [host-apply-form.tsx:403,457](app/[locale]/host/apply/host-apply-form.tsx:403), [experience-form.tsx:611](<app/[locale]/host/(dashboard)/experiences/[id]/experience-form.tsx:611>); [admin-experience-form.tsx:549](app/[locale]/admin/experiences/[id]/edit/admin-experience-form.tsx:549) drops `font-medium`.
**Fix:** `buttonVariants` is already exported — `cn(buttonVariants({variant, size}))` on these `<label>`/`<Link>` hosts (as [empty-state.tsx:30](features/experiences/components/empty-state.tsx:30) already does).

### M5. Status-chip tone maps duplicated in 10 files, two conventions, one real divergence

**Where:** [booking-status-badge.tsx:10](features/bookings/components/booking-status-badge.tsx:10) uses semantic tokens correctly; 9 files hand-roll alpha tints ([experience-list-row.tsx:9](features/host-experiences/components/experience-list-row.tsx:9), [admin/hosts/page.tsx:24](app/[locale]/admin/hosts/page.tsx:24), moderation/applications pages…). `archived` is clay to hosts but neutral to admins; ad-hoc maps use base-tone text where semantic tokens use AA-safe `-800` stops.
**Fix:** one shared `STATUS_TONE` module mapped onto the semantic `*-surface`/`*` tokens.

### M6. Saffron-gold focus rings on galleries override the global ring at 1.79:1

**Where:** [photo-carousel.tsx:188,198,215,228](components/ui/photo-carousel.tsx:188), [photo-gallery.tsx:127,172,195](features/experiences/components/photo-gallery.tsx:127) — `focus-visible:ring-2 ring-saffron-gold` beats the global `:focus-visible` (specificity), replacing the compliant ring with gold at **1.79:1** on white. Violates both WCAG 1.4.11 and the brief's single-ring rule.
**Fix:** delete the custom ring classes; if an inset ring over photos is wanted, use the dual white+black pattern.

### M7. `text-[11px]` eyebrow is a shadow token: 94 occurrences across 77 files

**Where:** the eyebrow style (`text-[11px] tracking-[0.2em] uppercase`) exists only as copy-paste, with per-page `eyebrowClassName` constants re-implementing the locale conditional ([hosting/page.tsx:44-51](app/[locale]/hosting/page.tsx:44)); stragglers already drift ([availability-calendar.tsx:119](features/availability/components/availability-calendar.tsx:119) bare, no tracking).
**Fix:** register `--text-caption` in `@theme` and ship an `<Eyebrow>` primitive or `eyebrowClassName()` helper owning the RTL conditional.

### M8. No Select/Textarea primitive; padding disagrees with Input in the same forms

**Where:** 47 raw `<select>`/`<textarea>`; `SELECT_CLASS` duplicated in [experience-form.tsx:188](<app/[locale]/host/(dashboard)/experiences/[id]/experience-form.tsx:188>) and [admin-experience-form.tsx:124](app/[locale]/admin/experiences/[id]/edit/admin-experience-form.tsx:124) with `px-3` vs Input's `px-4` — adjacent fields have visibly different text insets.
**Fix:** add `components/ui/select.tsx` + `textarea.tsx` sharing Input's exact metrics.

### M9. Two components named `EmptyState` with opposite visual treatments

**Where:** [components/ui/empty-state.tsx](components/ui/empty-state.tsx) (centered, borderless, `py-20`) vs [features/experiences/components/empty-state.tsx:26](features/experiences/components/empty-state.tsx:26) (left-aligned, hairline card, off-grid `p-10`). Same export name invites wrong imports.
**Fix:** fold into the ui primitive with an `align`/`bordered` variant, or rename `CatalogEmptyState`.

### M10. Icon-button treatments: 6 `<IconButton>` uses vs ~12 hand-rolled `size-11` buttons in four hover/radius grammars

**Where:** [booking-calendar.tsx:216](features/bookings/components/booking-calendar.tsx:216) (`rounded-full`), [admin-shell.tsx:100](features/admin/dashboard/components/admin-shell.tsx:100) (`rounded-input`), [search-input.tsx:97](features/experiences/components/search-input.tsx:97) (`rounded-button` + opacity), overlay close buttons (no radius).
**Fix:** add a `ghost` variant to IconButton and adopt everywhere.

### Forms

### M11. Smaller forms also lose input on failed submits (5 more)

**Where:** promo-code field [promo-code-field.tsx:150-158](features/promo-codes/components/promo-code-field.tsx:150) (typo → field resets empty); payout IBAN [payout-method-form.tsx:58-72](features/host-earnings/components/payout-method-form.tsx:58) (24-char retype + vague single error); admin settings [admin-settings-form.tsx:151,253,308](app/[locale]/admin/settings/admin-settings-form.tsx:151); admin promo create [create-promo-form.tsx:89-215](app/[locale]/admin/promo-codes/create-promo-form.tsx:89) (also: every field error is the same generic `fieldInvalid`); dispute/reply textareas [report-problem-form.tsx:64-73](features/disputes/components/report-problem-form.tsx:64), [host-reply-form.tsx:60-68](<app/[locale]/host/(dashboard)/reviews/host-reply-form.tsx:60>).
**Fix:** the same values-echo pattern as H4, per form.

### M12. Payment details form: errors not announced, focus doesn't move

**Where:** [payment-details-form.tsx:247](features/payments/components/payment-details-form.tsx:247) — bare `<p>` errors, no `id`/`aria-describedby`/`role="alert"`, no focus-to-first-invalid. The booking form ([booking-request-form.tsx:375-398](features/bookings/components/booking-request-form.tsx:375)) does all of this.
**Why:** on a long checkout page, a screen-reader or keyboard user has to hunt for what failed at the step where money is at stake.
**Fix:** copy the booking-form wiring; also use the shared `FieldError` where local copies dropped `role="alert"` ([host-apply-form.tsx:181-188](app/[locale]/host/apply/host-apply-form.tsx:181), [experience-form.tsx:201-208](<app/[locale]/host/(dashboard)/experiences/[id]/experience-form.tsx:201>)).

### M13. Host application: multi-MB KYC upload before any validation, no progress

**Where:** [host-apply-form.tsx:316](app/[locale]/host/apply/host-apply-form.tsx:316) — `noValidate`, no client-side zod pass; a `bio_short` error is discovered only after POSTing all documents; the pending button label is the only progress signal.
**Why:** on Saudi mobile connections a 15 MB submit looks frozen, then fails on a fixable field.
**Fix:** run the shared schema client-side before submit (booking-form pattern); add an "uploading documents…" phase label at minimum.

### M14. Destructive/irreversible actions without confirmation (besides H6)

**Where:** suspend host [host-actions.tsx:89-111](app/[locale]/admin/hosts/[id]/host-actions.tsx:89) (guest suspend _is_ confirmed — inconsistent); host-application approve/reject [reviewer-actions.tsx:87-155](app/[locale]/admin/host-applications/[id]/reviewer-actions.tsx:87) (creates accounts / sends emails one-click; identical `notesLabel` on both textareas; reject notes required with no marker); resolve dispute [resolve-button.tsx:39-60](app/[locale]/admin/disputes/resolve-button.tsx:39); host review reply posts publicly one-shot ([host-reply-form.tsx](<app/[locale]/host/(dashboard)/reviews/host-reply-form.tsx>)).
**Fix:** `ConfirmSubmit` on all four; differentiate approve/reject labels; mark the required note.

### M15. No resend-code affordance on the OTP step

**Where:** [sign-in-form.tsx:269-335](<app/[locale]/(auth)/sign-in/sign-in-form.tsx:269>) — if the SMS/email never arrives, the only recovery is the unlabeled back-arrow → re-submit.
**Fix:** explicit "Resend code" with cooldown.

### M16. Review form: rating validated server-side only; silent textarea truncation

**Where:** [review-form.tsx:70,112-116](features/reviews/components/review-form.tsx:70) — no client check, error not `aria-describedby`-wired to the radiogroup, focus stays on submit; `:127` `maxLength` clips pasted text with no counter.
**Fix:** client-side rating check; wire the error; character counter near the limit.

### Accessibility

### M17. Sort dropdown keyboard highlight is 1.09:1 — effectively invisible

**Where:** [sort-select.tsx:101](features/experiences/components/sort-select.tsx:101) — `outline-none` + `data-[highlighted]:bg-mist-deep` (#f5f5f5 on white). Base UI keeps DOM focus on the popup, so the global ring never fires on items.
**Fix:** `data-[highlighted]:bg-sarat-black data-[highlighted]:text-white` (matches selected pills).

### M18. Every catalog card auto-advances its carousel with no pause mechanism

**Where:** [photo-carousel.tsx:44-46,130-134](components/ui/photo-carousel.tsx:44) — `autoAdvanceMs = 5000` default and `ExperienceCard` doesn't opt out. WCAG 2.2.2 requires a pause mechanism; hover isn't one, and a grid of independently cycling images is hostile to attention/cognitive disabilities.
**Fix:** `autoAdvanceMs={0}` from `ExperienceCard` (auto-play adds nothing on a card), or a visible pause control.

### M19. Card carousel slides are links named "Go to photo N" that navigate to the listing

**Where:** [photo-carousel.tsx:184-189](components/ui/photo-carousel.tsx:184) + [experience-card.tsx:111-120](features/experiences/components/experience-card.tsx:111) — accessible name promises photo navigation; activation opens the experience page. One tab stop per photo per card ≈ 60 misleading stops on a 12-card grid. WCAG 2.4.4/2.4.3.
**Fix:** in `href` mode, one overlay link per carousel, named after the experience.

### M20. Selected-state contrast: review stars 1.14:1 between states; wishlist heart 1.79:1

**Where:** [review-form.tsx:105](features/reviews/components/review-form.tsx:105) — selected `text-saffron-gold` (1.79:1) vs unselected `text-sarat-black/20` (1.57:1); read-only variants at [host reviews page.tsx:121](<app/[locale]/host/(dashboard)/reviews/page.tsx:121>). [wishlist-button.tsx:47-60](features/wishlist/components/wishlist-button.tsx:47) — the _saved_ state is the less visible one. WCAG 1.4.11/1.4.1.
**Fix:** gold fill + `saffron-gold-800`/`sarat-black` stroke for selected states.

### M21. Filter/sort result updates never announced; pending signal is opacity-only

**Where:** [filter-rail.tsx:114-122](features/experiences/components/filter-rail.tsx:114) — "N experiences" is a plain `<p>`; the grid swaps via visual-only `FadeSwap`; controls dim to `opacity-70` during the transition with no `aria-busy`. WCAG 4.1.3.
**Fix:** `aria-live="polite"` on the result-count `<p>` (it re-renders with the new count); `aria-busy` on the grid keyed off the existing pending state.

### M22. Booking form party-size: void label association, no live announcement

**Where:** [booking-request-form.tsx:521-537](features/bookings/components/booking-request-form.tsx:521) — `<label htmlFor>` targets a `<span>` (not labelable); +/- changes aren't announced (sibling `GuestStepper` at [guest-stepper.tsx:52](features/experiences/components/guest-stepper.tsx:52) does both correctly).
**Fix:** `role="group"` + `aria-labelledby`; `aria-live="polite"` on the value span.

### M23. Form-field boundaries at 1.30–1.57:1

**Where:** [input.tsx:16](components/ui/input.tsx:16) `border-sarat-black/20` → 1.57:1; [review-form.tsx:130](features/reviews/components/review-form.tsx:130) textarea `/12` → 1.30:1. The hairline is the only boundary of white-on-white fields (WCAG 1.4.11 expects 3:1).
**Fix:** `border-sarat-black/45` idle (≈3.1:1) or a `bg-mist` fill difference.

### State coverage

### M24. Admin list pages systemically render "empty" on query errors; `/hosts` directory too

**Where:** catch → `[]` in [admin bookings queries.ts:76-79](features/admin/bookings/queries.ts:76), users, activity, guests, disputes, reviews → "No bookings yet" etc. ([admin/bookings/page.tsx:183-192](app/[locale]/admin/bookings/page.tsx:183)); [hosts/queries.ts:128-131](features/hosts/queries.ts:128) degrade (correct for home) makes `/hosts` show "no hosts" on outage ([hosts/page.tsx:105-106](app/[locale]/hosts/page.tsx:105)). The `admin/error.tsx` boundary is unreachable dead code on these paths.
**Fix:** let list queries throw (boundaries catch), or render a distinct "failed to load" card; non-degrading query variant for `/hosts`.

### M25. Admin users: search runs in JS after a 1000-row-per-source cap

**Where:** [features/admin/users/queries.ts:42,116,128,140](features/admin/users/queries.ts:42), filter at `:200-208` — past 1000 guests, the people directory returns false "no match" with no notice.
**Fix:** push `ilike` into each source query, or surface "showing newest 1000."

### M26. Catalog filtered-empty and true-empty are the same state — with a dead-loop CTA

**Where:** [catalog page.tsx:241-242](<app/[locale]/experiences/(catalog)/page.tsx:241>) + [empty-state.tsx:26-33](features/experiences/components/empty-state.tsx:26) — "reset filters" links to bare `/experiences`, which is the same empty page when the catalog is genuinely empty.
**Fix:** branch on criteria-active vs `catalog.length === 0` (already fetched at `:135`); "nothing live yet" copy for true-empty.

### Perceived performance / responsive

### M27. Payment widget placeholder underestimates the form → ~250px CLS at the most conversion-critical moment; no preconnect

**Where:** [payment-widget.tsx:139-146](features/payments/components/payment-widget.tsx:139) shows two `h-11` placeholders (~100px); COPYandPAY renders ~320–400px. Zero `preconnect` hits for the HyperPay script origin (appended at `:117`).
**Fix:** `min-h-[22rem]` on the mount wrapper; `<link rel="preconnect">` to the checkout origin in the pay page head (300–600ms on mobile radio).

### M28. Skeletons don't match the layouts they stand in for

**Where:** [wishlist/loading.tsx](app/[locale]/wishlist/loading.tsx) uses `aspect-[4/5]` + `gap-6` vs the real `ExperienceCard` grid (`aspect-[16/9]`, `gap-4`) — visible shift on reveal; [catalog loading.tsx](<app/[locale]/experiences/(catalog)/loading.tsx>) omits the sticky filter rail and uses text-only `min-h-64` cards.
**Fix:** a shared `ExperienceCardSkeleton` + a rail-shaped skeleton row; swap the catalog's hand-rolled pulse divs for the `Skeleton` primitive while there.

### M29. Full `framer-motion` ships in the shared bundle (no `LazyMotion`)

**Where:** [motion.tsx:3-11](components/ui/motion.tsx:3) imports `motion` from `framer-motion`; 21 consumer files. ~34 kB gz vs ~6 kB with `LazyMotion strict` + `m.*` — hydrated on the home page for mid-range Android on Saudi networks.
**Fix:** convert `motion.tsx` (single source of truth) to `LazyMotion` + `m.*`; audit the two `AnimatePresence` consumers separately.

### M30. Tablet band neglected: 5 `md:` utilities in the whole app (vs 252 `sm:`, 78 `lg:`)

**Where:** e.g. experience detail keeps the booking panel below all content + sticky bar until `lg` ([experiences/[slug]/page.tsx:457](app/[locale]/experiences/[slug]/page.tsx:457)) — a 768px iPad portrait scrolls the entire description before seeing the calendar. Same line: `lg:grid-cols-[1fr_360px]` uses bare `1fr`, so one unbreakable string (pasted URL in a host description) pushes the 360px panel off-canvas at 1024px.
**Fix:** one deliberate `md:` pass on detail + catalog; `minmax(0,1fr)` on the prose track.

### M31. Instant Book copy promises confirmation before the payment step

**Where:** [messages/en.json:2255](messages/en.json:2255) "your spot is confirmed right away" + CTA "Book now" (`:2234`) — but submit routes to the payment form and the hold lapses unpaid.
**Fix:** "Instant Book — pay now and your spot is confirmed right away." / CTA "Book and pay".

### M32. Microcopy batch (each small, all user-visible)

- ALL-CAPS "NOT" in the forfeit confirm dialog — brand-voice violation at a money moment ([en.json:2310](messages/en.json:2310)). Fix: "…the payment won't be refunded. This can't be undone."
- Checkout clickwrap names "Terms & Conditions" in Title Case; the linked page is titled "Terms of service" ([en.json:2400](messages/en.json:2400) vs `:2630`). Align names, sentence case.
- Help FAQ quotes "pending host approval" — a status label that appears nowhere; guests see "Awaiting host confirmation" ([en.json:2899](messages/en.json:2899) vs `:2676`).
- Admin bookings intro says "No filters, no detail page yet" — the page has both ([en.json:807](messages/en.json:807) vs [admin/bookings/page.tsx:205](app/[locale]/admin/bookings/page.tsx:205)).
- Mixed UK/US spelling: "catalogue"/"licence"/"optimise" vs "catalog"/"authorized" ([en.json:329](messages/en.json:329), `:1241`, `:1832` vs `:1353`, `:1116`). Pick US, sweep.
- Pending button labels inconsistently ellipsized ("Suspending…" `:472` vs "Suspending" `:754`) — and the label is the only progress indicator (Button has no spinner). Standardize on "…".

---

## Low — polish

**L1. Admin nav group heading reads "Setting"** — [en.json:961](messages/en.json:961); Arabic is correct. Fix: "Settings".

**L2. Booking history has no pay affordance for awaiting-payment bookings** — rows show only "View"; the dead key `me.payNow` ([en.json:2796](messages/en.json:2796)) is referenced nowhere. Use it: a "Complete payment" link per awaiting row. Also unbounded: [bookings/queries.ts:155-162](features/bookings/queries.ts:155) renders a guest's entire history on `/me` — cap at ~20 + "show all".

**L3. `/me` has no loading boundary** — [me/page.tsx:45-56](app/[locale]/me/page.tsx:45) chains `Promise.all` + a dependent await; `/me` never calls `notFound()`, so a segment `loading.tsx` is safe under the soft-404 constraint.

**L4. Silent truncation caps** — host open-booking buckets at 200 ([host-bookings/queries.ts:22,152-156](features/host-bookings/queries.ts:22) — a 201st pending request silently expires past SLA); earnings history 200 ([host-earnings/queries.ts:119](features/host-earnings/queries.ts:119)); admin activity 100 ([activity/queries.ts:42-43](features/admin/activity/queries.ts:42)); promo list unbounded ([promo-codes/queries.ts:47](features/promo-codes/queries.ts:47)). Fetch `LIMIT+1` and show "showing latest N" when exceeded.

**L5. Admin analytics mislabels query errors as "database not configured"** — [analytics/page.tsx:45-60](app/[locale]/admin/analytics/page.tsx:45). Separate `no_db` from `error` copy.

**L6. Home page: orphan section headings when data is empty** — Originals ([page.tsx:207-231](app/[locale]/page.tsx:207)) and "All experiences" (`:234-262`) render `<h2>` + empty grid with zero data; the hosts row conditionally hides (`:272`) — mirror it.

**L7. Zero-photo detail page shows a full-width blank gray block** — [photo-gallery.tsx:115-117](features/experiences/components/photo-gallery.tsx:115). Put the category glyph tonal treatment (catalog-card pattern) inside the placeholder.

**L8. Toast a11y/UX** — tone is an `aria-hidden` colored dot only ([toast.tsx:66-70](components/ui/toast.tsx:66), WCAG 1.4.1); hover-resume always restarts at 2s regardless of remaining time (`:29,87-90`). Add sr-only tone word + distinct icons; pause instead of reset-shorter.

**L9. Carousel prev/next arrows are 32px** — [photo-carousel.tsx:215,228](components/ui/photo-carousel.tsx:215); brief floor is 44px and they float over photos with room. `p-3.5`.

**L10. Identical alt across every photo of an experience** — [photo-carousel.tsx:175](components/ui/photo-carousel.tsx:175), [photo-gallery.tsx:132,175,200,248](features/experiences/components/photo-gallery.tsx:132) — "Desert hike, Desert hike, …". Suffix "photo n of N" (string exists as `photoGoTo`); `alt=""` inside already-labelled mosaic buttons.

**L11. `aria-label` on a non-interactive `<p>` for card ratings** — [experience-card.tsx:200-203](features/experiences/components/experience-card.tsx:200); if honored it replaces the visible count. Drop it; sr-only "Rated" prefix.

**L12. Static home banner has `role="status"`** — [page.tsx:130-137](app/[locale]/page.tsx:130); server-rendered content is never announced by a live region, and status is wrong for a persistent banner. Plain `<section aria-label>`.

**L13. Calendar grid ARIA deviations** — [booking-calendar.tsx:313-314,281-289](features/bookings/components/booking-calendar.tsx:313): `aria-pressed` where the date-picker pattern expects `aria-selected`; `role="gridcell" aria-hidden` is contradictory. Minor — the keyboard model itself is excellent.

**L14. Lightbox arrow keys aren't RTL-mirrored** — [photo-gallery.tsx:85-86](features/experiences/components/photo-gallery.tsx:85); the calendar (`booking-calendar.tsx:173-177`) already inverts for `ar` — mirror it.

**L15. Active-filter remove buttons fall back to an untranslated key** — [active-filters.tsx:81](features/experiences/components/active-filters.tsx:81) — English "price" inside the Arabic UI for the price token. Pass a plain-string label.

**L16. Dialog trigger API invites nested-interactive misuse** — [dialog.tsx:52](components/ui/dialog.tsx:52) wraps triggers in a span-trigger; passing a `<Button>` yields two tab stops (only `/dev` does today). Accept the trigger element itself via `render`.

**L17. Visual one-offs batch** — invoice status chip: only unmodified 1px `border` pill in the app ([invoice/page.tsx:192](app/[locale]/book/confirmed/[ref]/invoice/page.tsx:192)); payment marks on `rounded-md` (6px, off the radius scale — [payment-marks.tsx:32](components/layout/payment-marks.tsx:32)); `font-mono` booking refs in an unthemed default stack ([host bookings page.tsx:184](<app/[locale]/host/(dashboard)/bookings/page.tsx:184>) +2); [global-error.tsx:47](app/global-error.tsx:47) hand-rolls the CTA off `buttonVariants`; active-filter chip re-implements Pill with different radius/hover ([active-filters.tsx:82](features/experiences/components/active-filters.tsx:82)); bespoke toggle switch outside `components/ui/` ([admin-settings-form.tsx:286](app/[locale]/admin/settings/admin-settings-form.tsx:286)); gallery remove button 28px ([gallery-manager.tsx:88](app/[locale]/admin/experiences/[id]/edit/gallery-manager.tsx:88)); divide-color written in two syntaxes + a third 2% hover tint ([admin/users/page.tsx:117,122](app/[locale]/admin/users/page.tsx:117)); `tracking-[-0.04em]` on the /dev spec disagrees with the 56 production `-0.035em` H1s ([dev/page.tsx:47](app/[locale]/dev/page.tsx:47)).

**L18. Card badges bypass Badge with 10px text** — [experience-card.tsx:139,151,164](features/experiences/components/experience-card.tsx:139) — `text-[10px]` chips (sole occurrences app-wide) on the most-rendered component; 10px Arabic is below comfortable legibility. Add a Badge `size="sm"`.

**L19. Forms polish batch** — sr-only checkbox chips have no visible focus on their labels ([experience-form.tsx:617](<app/[locale]/host/(dashboard)/experiences/[id]/experience-form.tsx:617>), [host-apply-form.tsx:409](app/[locale]/host/apply/host-apply-form.tsx:409)); optional fields unmarked in host apply (bioAr `:368-391`, vatNumber `:544-565`) against the app's "(optional)" convention; three forms use `disabled={pending}` instead of the Button `pending` prop, dropping focus mid-submit ([review-form.tsx:43](features/reviews/components/review-form.tsx:43), [profile-form.tsx:39](features/account/profile/components/profile-form.tsx:39), [host-profile-form.tsx:43](features/host-profile/components/host-profile-form.tsx:43)); custom region silently overwritten on city change ([experience-form.tsx:499-508](<app/[locale]/host/(dashboard)/experiences/[id]/experience-form.tsx:499>)); cancel-dialog forfeit wording can go stale across the deadline ([confirmed/[ref]/page.tsx:656-662](app/[locale]/book/confirmed/[ref]/page.tsx:656)).

**L20. Microcopy polish batch** — payment provider named three ways (HyperPay / "our payment provider" / "a licensed Saudi payment gateway" — [en.json:2376,2425,2818](messages/en.json:2376)); price filter buckets lack a currency unit (legend "Price (SAR)" — [en.json:2061-2064](messages/en.json:2061)); curly vs straight apostrophes mixed (`:323,1144,2446`); "what happens next" steps stutter "Once confirmed," twice and misname acceptance (`:2288-2289`); wishlist "one tap" overpromise (`:2801`); host email greets "Good news," name-less for requests they may decline (`:2490`); empty host dashboard shows two identical primary "New experience" CTAs ([host/(dashboard)/page.tsx:382-407](<app/[locale]/host/(dashboard)/page.tsx:382>)); mobile home hero preloads a hidden `lg:`-only image ([page.tsx:180-187](app/[locale]/page.tsx:180)); HeroCropper/react-easy-crop statically imported into the host experience form ([photo-upload.tsx:14](features/host-experiences/components/photo-upload.tsx:14) — `next/dynamic` is used zero times app-wide).

---

## State-coverage matrix

✓ handled · ✗ missing · ~ partial or mislabeled. "Error" = a distinct error surface actually reachable (swallowed-to-empty = ✗/~).

| View                       | Loading                             | Empty                              | Error                         | Too much data                   |
| -------------------------- | ----------------------------------- | ---------------------------------- | ----------------------------- | ------------------------------- |
| Home `/`                   | ✗ (no Suspense)                     | ~ (orphan headings)                | ✓ boundary                    | ✗ unbounded catalog             |
| Catalog `/experiences`     | ✓                                   | ~ (one state for filtered vs true) | ✓                             | ✗ no pagination                 |
| Experience detail          | ✗ (deliberate; no in-page Suspense) | ✓                                  | ✓                             | ✓ reviews 4→100                 |
| Pay page                   | ✓                                   | n/a                                | ✓ widget error + expired hold | n/a                             |
| Wishlist                   | ✓                                   | ✓                                  | ✓                             | ✓ 100 cap                       |
| `/me`                      | ✗                                   | ✓                                  | ✓                             | ✗ unbounded history             |
| Host dashboard suite       | ✓                                   | ✓                                  | ✗ error → redirect to /apply  | ✓/~ silent 200 caps             |
| Host bookings / earnings   | ✓                                   | ✓                                  | ✗ error → "empty"             | ~                               |
| Hosts directory            | ✗                                   | ✓                                  | ✗ error → "no hosts"          | ✓                               |
| Admin bookings             | ✓                                   | ✓                                  | ~ error → empty               | ✗ 500 cap distorts stats+search |
| Admin users / guests       | ✓                                   | ✓                                  | ~                             | ✗/~ JS search over cap          |
| Admin activity / analytics | ✓                                   | ✓                                  | ~ (error labeled "no DB")     | ✗ 100 cap                       |

---

## Top 5 highest-impact fixes

1. **Un-block the mobile booking CTA (C1).** One shared bottom-offset CSS var for cookie notice + toasts on sticky-bar pages. Pure CSS, directly protects the conversion funnel's most valuable tap target.
2. **Fix the inverted forfeit email (H1).** One string in each locale. Every forfeited cancellation currently sends a legally-wrong money message that manufactures disputes.
3. **Stop swallowing DB errors on operational surfaces (C3 + H2 + M24).** One convention change — rethrow (or return an error flag) from host/admin queries so the existing, currently-unreachable `error.tsx` boundaries do their job. Kills the host-lockout redirect, the "no bookings today" lie, and the zero-earnings lie in one pass.
4. **Values-echo pass on failing forms (H4, H5, M11).** The pattern already exists in `BookingRequestForm`; apply it to the experience forms, admin edit forms, promo/IBAN/settings. Biggest data-loss frustration in the product, mechanical fix.
5. **Streaming pass (H11).** Suspense around the navbar auth segment + home below-fold sections + detail reviews. Given `force-dynamic` everywhere and documented pooler tail latency, this is the largest single perceived-performance win available without touching queries.

## Quick wins (<30 min each)

- "Setting" → "Settings" ([en.json:961](messages/en.json:961)).
- Map `rate_limited` to visible copy on the OTP code stage ([sign-in-form.tsx:267](<app/[locale]/(auth)/sign-in/sign-in-form.tsx:267>)) — C2's core.
- Two-line focus-ring fix: transparent outline for forced-colors + ring alpha 0.4 → 0.55 ([globals.css:207-212](app/globals.css:207)) — H10.
- `ConfirmSubmit` around "Mark paid" ([mark-paid-button.tsx:36](app/[locale]/admin/payouts/mark-paid-button.tsx:36)) — H6.
- Demote "Keep exploring" to secondary while `isAwaitingPayment` ([confirmed/[ref]/page.tsx:710](app/[locale]/book/confirmed/[ref]/page.tsx:710)) — H7.
- Replace the 9 guest/host "database" strings with "temporarily unavailable" copy — H8.
- `autoAdvanceMs={0}` from `ExperienceCard` — M18.
- `min-h` on the payment-widget placeholder + one `preconnect` link — M27.
- `aria-live="polite"` on the filter result count ([filter-rail.tsx:114](features/experiences/components/filter-rail.tsx:114)) — M21.
- Fix the forfeit dialog "NOT", the clickwrap document names, and the help-FAQ status label — three strings (M32).
- Echo the attempted promo code back into the field on failed apply ([promo-code-field.tsx:150](features/promo-codes/components/promo-code-field.tsx:150)).
- Delete the saffron focus-ring classes on gallery/carousel controls (the global ring already applies) — M6.

---

## What's healthy (calibration — don't "fix" these)

- **RTL:** zero physical direction utilities; `rtl:rotate-180` icons; `dir="ltr"` pinned phone numbers; RTL-safe carousel math.
- **Tokens:** zero raw hex outside sanctioned mirrors (OG images, emails, PDF); all 59 `font-semibold` uses are compliant (H1/display/stats); shadow token used only on genuine floating layers.
- **A11y base:** skip link + `<main tabIndex={-1}>`, single h1 per page, labelled navs/landmarks, roving-tabindex calendar with full arrow/Home/End support, `IconButton` requires `aria-label` at the type level, reduced motion closed at both CSS and Framer layers (`useReducedMotion` + `MotionConfig reducedMotion="user"`).
- **Forms:** `BookingRequestForm` is the house gold standard (shared schema both sides, values echo, focus-to-first-error, describedby wiring, idempotency key); `ConfirmSubmit` correctly deployed on refund/transition/suspend-guest/VAT-enable; no placeholder-as-label anywhere.
- **Perf:** all `fill` images carry `sizes`; AVIF/WebP configured; fonts self-hosted with `display: swap`; all data tables in `overflow-x-auto`; loading skeletons (not spinners) everywhere they exist; `PageTransition`/`MountFade` engineered to protect LCP.
- Pay-page hold expiry, calendar no-slots state, reviews 4-then-all pagination, wishlist cap, admin/host shell drawers — all verified solid.
