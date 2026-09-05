# Gharmish UI/UX Audit — 2026-09-05

**Date:** 2026-09-05 · **Branch:** `main` working tree (other sessions' uncommitted admin/booking changes present; audited as-is) · **Previous audit:** [UX_AUDIT.md](UX_AUDIT.md) (2026-07-13).

**Method.** A live walkthrough of every public page plus the signed-in host dashboard and guest account on a local dev server against the live database — 375 px (iPhone), 768 px, 1280 px, and a 320 px pass — in English and Arabic, signed out and signed in as the live host account. Every page was run through a Playwright harness that records console errors, horizontal overflow, tap-target sizes, unlabeled controls, fixed-layer geometry, font weights, sub-12 px text, form-field metadata and a Tab-order trace, and every screenshot was reviewed by eye. A read-only interaction walk exercised the catalog filters, search, filter sheet, gallery lightbox, share, wishlist, calendar, party stepper, promo field, contact fields (never submitted), sign-in validation (never sent an OTP), language switching mid-funnel and bad references. Six code-lens sweeps ran in parallel (design tokens + responsive, forms + state coverage, English copy, Arabic copy + RTL, prior-audit regression, host + admin journeys). Every finding below was re-checked against the current source by the lead before inclusion; line numbers are current as of this date.

**Standards.** [BRIEF.md](BRIEF.md) §2–§4 and §6 (design system, localisation, accessibility), WCAG 2.2 AA, and Airbnb-Experiences-calibre marketplace expectations.

**Deliberately not flagged** (owner-locked decisions): calendar day cells under 44 px (7-column grid at 375 px), the day-preset date filter, keyless Leaflet/OSM maps, the international phone picker (flag glyphs included), manual bank-transfer refunds, VAT-off copy, the homepage catalog cap of 6, footer accordions and the full lockup, brand-coloured payment marks, `SAR` in English and Latin digits everywhere, AI-authored Arabic, no `loading.tsx` above the locale root or on `[slug]` pages, intentionally empty experience photos (tonal placeholders by design — their _legibility_ is audited, their absence is not), the marquee stopping permanently on interaction, the Latin-only logo, the Arabic heading size bump being deferred, the admin left rail and TOTP gate, the verified rosette, no-insurance copy.

**Severity.** P0 blocks a core task · P1 significant friction, trust damage or an accessibility failure on a primary flow · P2 quality gap with a visible effect · P3 polish. "(opportunity)" marks items where nothing is broken but a top-tier marketplace would do better.

> **Remediation status (2026-09-05, same day) — all eight P1s fixed** in the working tree (uncommitted, per CLAUDE.md); `pnpm typecheck`, `pnpm lint` and all 1,530 Vitest tests pass; the guest-facing fixes were re-verified in the browser at 375 px.
>
> | Finding                                | Fix                                                                                                                                                        |
> | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
> | P1-1 earnings overflow                 | `grid-cols-1` on the rollup grid (`minmax(0,1fr)` track) — measured 375 px document width, was 466                                                         |
> | P1-2 host tab bar vs overlays          | `data-bottom-dock` on the tab bar; cookie notice and toasts now stack above it                                                                             |
> | P1-3 `HoverLift` tab stops             | `tabIndex={-1}` on the wrapper (Framer only adds `tabindex=0` when the attribute is absent) — 0 focusable wrappers on `/en`, was 21                        |
> | P1-4 signed-out `/me`                  | new `introSignedOut` copy + "Sign in" (`/sign-in?next=/me`) and "Browse experiences" CTAs; the second empty state renders only for signed-in guests        |
> | P1-5 refund copy                       | policy page selects `refunds.body1Bank/body2Bank` and the FAQ host-cancel answer selects "by bank transfer" while `refundsViaBankTransfer` is on (EN + AR) |
> | P1-6 reviewer notes wiped              | `values.reviewerNotes` echoed on every failure branch of approve/reject/request-changes; textareas take `defaultValue` from it                             |
> | P1-7 admin queues masking DB errors    | `admin/hosts`, `admin/experience-moderation` and `support` queries now rethrow to the admin error boundary                                                 |
> | P1-8 host Today page masking DB errors | the five Today-page helpers (pending, awaiting payment, coming up, calendar, pending count) rethrow like the list and earnings queries                     |
>
> P2 and P3 items are untouched and remain the backlog below.

---

## Verdict

Gharmish is in unusually good shape for a pre-launch marketplace. The foundation the July audit praised has held and improved: every July critical and most July highs are fixed (see _Prior-audit status_), there is no horizontal overflow on any public page at 320, 375, 768 or 1280 px in either locale, every page has one h1, a working skip link, landmarks, a single global focus ring, fully mirrored RTL, labelled icon buttons, a properly semantic calendar grid with readable disabled-day reasons, an accessible filter sheet, a lightbox that restores focus, 100 % key parity between the English and Arabic catalogs with zero Arabic-Indic digits, and a booking form that echoes every value on failure and moves focus to the first error. Nothing found blocks a guest from discovering, requesting or paying, so there are **no P0s**.

The problems that remain cluster in five themes:

1. **Mobile chrome collisions on the host side.** The host earnings page overflows the viewport at 375 px, and the host mobile tab bar is not part of the bottom-overlay stack, so the cookie banner and every toast land on top of it.
2. **One animation primitive breaking keyboard order everywhere.** `HoverLift` makes every card and category chip wrapper a tab stop (21 extra, unnamed stops on the home page alone), including seven inside an `aria-hidden` marquee clone.
3. **Misleading status copy on trust-critical surfaces.** The public cancellation policy promises automatic card refunds while the live rail is manual bank transfer; `/me` tells a signed-out returning guest "Nothing here yet" with no sign-in path; the profile page says online payments are not live.
4. **First-impression weaknesses on mobile.** The hero's fixed-width rotating slot leaves a dead gap and a ragged five-line headline, four of seven listings render as blank white cards because their tonal placeholders are too faint, the category strip sits two screens below the fold on the catalog, and the cookie banner takes 37–47 % of the first viewport.
5. **Admin forms lag behind the guest and host forms.** Reviewer notes are wiped on common failure paths, three admin queues still render DB failures as empty lists, and moderation decisions lack the confirmation every other destructive admin action has.

The biggest risk is theme 3: money and status copy that contradicts what actually happens. It is cheap to fix and expensive to leave.

---

## Scorecard

| Area                                                      | P0    | P1    | P2     | P3     | State                                                                                  |
| --------------------------------------------------------- | ----- | ----- | ------ | ------ | -------------------------------------------------------------------------------------- |
| Global chrome (nav, footer, cookie notice, notifications) | 0     | 1     | 2      | 3      | Solid; card-wrapper focus stops; cookie banner too tall on phones                      |
| Home                                                      | 0     | 0     | 2      | 1      | Hero slot gap; faint placeholders; very long page                                      |
| Catalog + filters                                         | 0     | 0     | 2      | 4      | Excellent filter sheet and search; category strip buried on mobile                     |
| Experience detail + booking form                          | 0     | 0     | 1      | 8      | Best-built surface in the app; only polish left                                        |
| Payment, confirmation, manage booking                     | 0     | 0     | 3      | 2      | Copy consistency (accept/approve/confirm, refund timelines)                            |
| Auth + account (`/me`, profile, wishlist)                 | 0     | 1     | 2      | 7      | Signed-out `/me` misleads; stale payments copy                                         |
| Info + legal pages                                        | 0     | 1     | 0      | 2      | Cancellation policy contradicts the refund rail                                        |
| Host marketing, apply, dashboard, listing                 | 0     | 3     | 3      | 3      | Earnings overflow; tab-bar collisions; Today-page error masking; copy contradictions   |
| Admin (code-only)                                         | 0     | 2     | 6      | 5      | Values-echo, error-state and confirmation gaps                                         |
| Design system + tokens                                    | 0     | 0     | 2      | 12     | Near-perfect palette/radius/shadow discipline; `divide-y`, spacing and primitive drift |
| Arabic + RTL                                              | 0     | 0     | 2      | 5      | Strongest domain; a few plural forms and one bidi gap                                  |
| Motion + performance                                      | 0     | 0     | 0      | 1      | Reduced motion respected; LCP-safe hero; Arabic preload trade-off pending              |
| **Total**                                                 | **0** | **8** | **25** | **53** |                                                                                        |

Counts include the July items that are still open or partial (listed under _Prior-audit status_ and, where they earned it, promoted into the P1/P2 sections).

---

## Critical (P0)

None found.

---

## High (P1)

### P1-1. Host earnings page overflows the viewport at 375 px (host-dashboard)

**Where:** [earnings/page.tsx:217](<app/[locale]/host/(dashboard)/earnings/page.tsx:217>) (`grid gap-6 lg:grid-cols-2`), [:231–232](<app/[locale]/host/(dashboard)/earnings/page.tsx:231>) and [:261](<app/[locale]/host/(dashboard)/earnings/page.tsx:261>) (`flex min-w-0 flex-col` + `truncate`), /en/host/earnings@375 signed in.
**Evidence:** measured document width 466 px on a 375 px viewport. Both "By experience" and "By month" cards render 450 px wide; every `li` inside is 400 px. The grid's single auto track sizes to the cards' min-content, and `truncate` (`white-space: nowrap`) makes each row's min-content the full title width ("Juniper forest dawn walk on Jabal Sawda"), so the track grows past the viewport. The fixed tab bar and cookie banner are displaced to 466 px wide and the whole page pans sideways. Screenshot: `scratchpad/shots/auth375/en_host_earnings-375.png` (932 px wide at 2×).
**Why it matters:** the page a host opens to check what they are owed scrolls sideways on every phone, with the bottom tab bar half off-screen. This is the only horizontal overflow found anywhere in the app.
**Fix:** add `min-w-0` to the two card children of the grid (or use `grid-cols-[minmax(0,1fr)] lg:grid-cols-2`) so the track can shrink below the rows' nowrap min-content. Check the ledger list at [:405](<app/[locale]/host/(dashboard)/earnings/page.tsx:405>) for the same pattern.

### P1-2. Host mobile tab bar is outside the bottom-overlay stack, so the cookie banner and toasts cover it (host-dashboard)

**Where:** [host-shell.tsx:199](features/host-dashboard/components/host-shell.tsx:199) (`fixed inset-x-0 bottom-0 z-30 … lg:hidden`, no `data-bottom-dock`), [globals.css:393–397](app/globals.css:393) (`:root:has([data-bottom-dock])` sets `--bottom-dock`), [cookie-notice.tsx:84](components/layout/cookie-notice.tsx:84) and [toast.tsx:169](components/ui/toast.tsx:169) (both offset by `var(--bottom-dock,0px)`).
**Evidence:** the only element in the codebase that sets `data-bottom-dock` is the guest booking bar ([booking-request-form.tsx:1206](features/bookings/components/booking-request-form.tsx:1206)). On /en/host@375 the harness measured the cookie banner at y 495–796 and the tab bar at y 755–812; the banner sits on top of the "Today · Bookings · Experiences · Earnings · More" labels (`scratchpad/crops/host-0.png`). Every toast on the host side (accept, decline, save, photo upload) lands at `bottom: 1rem`, over the same bar.
**Why it matters:** the July audit fixed exactly this collision for the guest booking bar; the host shell shipped later without joining the mechanism. Hosts act on requests from their phones, and the feedback for those actions covers their navigation.
**Fix:** add `data-bottom-dock` to the host tab bar (the CSS rule already keys on the attribute), and raise the dock offset if the bar's 57 px plus safe-area differs from the 4.5 rem the guest bar assumes.

### P1-3. `HoverLift` turns every card and category chip wrapper into a keyboard tab stop (global-chrome, a11y)

**Where:** [motion.tsx:165–172](components/ui/motion.tsx:165) (`m.div … whileHover whileTap`), used by [experience-card.tsx:175](features/experiences/components/experience-card.tsx:175), [category-tiles.tsx:80](components/marketing/category-tiles.tsx:80), host cards on /hosts.
**Evidence:** Framer Motion adds `tabindex="0"` to any element with a tap gesture. Measured with `document.querySelectorAll('div[tabindex="0"]')`: **21** on /en, 7 on /en/experiences, 2 on /en/hosts. The home-page Tab trace reads `div:Nature → a:Nature → div:Heritage → a:Heritage …` for all seven chips, then seven more `div:Nature … div:Women only` stops with no link at all — the marquee's duplicate half, whose _links_ are correctly `aria-hidden` + `tabIndex -1` ([category-tiles.tsx:86–89](components/marketing/category-tiles.tsx:86)) but whose wrapper divs are still focusable. Every experience card adds one unnamed stop before its link.
**Why it matters:** a keyboard user needs roughly twice as many Tab presses to cross the home page, a screen reader announces unnamed "group"-less focusable blocks, and focus lands inside `aria-hidden` content — WCAG 2.4.3 (focus order) and 4.1.2 (name, role) on the highest-traffic page. It also defeats the care taken to give cards a single accessible link.
**Fix:** in `HoverLift`, pass `tabIndex={-1}` on the `m.div` (Framer honours an explicit value) or drop `whileTap` and express the press state with `active:` CSS. One-line fix, app-wide effect.

### P1-4. Signed-out `/me` tells a returning guest "Nothing here yet" and offers no sign-in path (account)

**Where:** [me/page.tsx:103–116](app/[locale]/me/page.tsx:103) (`hasAnything` → `introEmpty`), [:158–172](app/[locale]/me/page.tsx:158) (`EmptyState`), [en.json:3866](messages/en.json:3866), [:3872–3873](messages/en.json:3872); /en/me@375 signed out.
**Evidence:** with no session and no `gharmish_last_booking` cookie the page renders "Where you left off. Nothing here yet. Once you save an experience or make a request, it'll show up on this page." followed by a second empty state "Start exploring. Save experiences with the heart icon, or send a booking request…" and a single "Browse experiences" CTA. The file contains no sign-in link; the only sign-in affordance is the nav icon. The Arabic page behaves the same.
**Why it matters:** a guest with real bookings who opens the account hub on a new phone (or after clearing cookies) is told they have nothing. The copy is a false statement of status on the page whose whole purpose is "find my booking". The two stacked empty states, with a large gap between them, also read as a rendering mistake (`scratchpad/crops/me-0.png`).
**Fix:** when there is no session, replace the intro with "Sign in to see your bookings and requests" plus a primary sign-in button (`/sign-in?next=/me`), keep the wishlist section if the cookie has saves, and render one empty state, not two.

### P1-5. The public cancellation policy and FAQ promise automatic card refunds; the live rail is manual bank transfer (info-pages)

**Where:** [en.json:4089–4090](messages/en.json:4089) (`cancellationPolicyPage.refunds.body1/body2`), [:4141](messages/en.json:4141) (`helpFaq.items.hostCancel.a`), [:4095](messages/en.json:4095); rendered unconditionally at [cancellation-policy/page.tsx:120](app/[locale]/cancellation-policy/page.tsx:120).
**Evidence:** "Refunds go back to the original payment method automatically. Depending on your bank, mada and card refunds typically appear within a few business days." The default setting (`refunds_via_bank_transfer`, [en.json:497](messages/en.json:497)) queues every refund for a manual wire and the cancel flow asks the guest for bank name and IBAN ([refund-bank-details-form.tsx](features/bookings/components/refund-bank-details-form.tsx)); the email and WhatsApp layers already branch correctly on the rail.
**Why it matters:** a guest reads the policy, cancels, and is asked for an IBAN — the policy page is the one place a guest checks before trusting the platform with money.
**Fix:** read the refund-rail setting on the policy and FAQ pages and swap in the bank-transfer wording already used by `refundBank.description` ([en.json:3315](messages/en.json:3315)); both locales.

### P1-6. Admin reviewer notes are wiped on every common failure path (admin)

**Where:** [admin-actions.ts:51–418](features/host-applications/admin-actions.ts:51) (`AdminApplyResult` has no `values`), [host-applications/[id]/reviewer-actions.tsx:97–139](app/[locale]/admin/host-applications/[id]/reviewer-actions.tsx:97) (textareas without `defaultValue`), [experience-moderation/actions.ts:35](features/admin/experience-moderation/actions.ts:35), [experience-moderation/[id]/reviewer-actions.tsx:105–187](app/[locale]/admin/experience-moderation/[id]/reviewer-actions.tsx:105).
**Evidence:** the result unions are `{ success: false, message, fieldError? }` with no `values`, and every `<textarea name="reviewerNotes">` has no `defaultValue`. Routine gates — `needs_hero`, `needs_arabic`, `needs_arabic_moments`, `documents_incomplete`, `wrong_state`, `server` — all reset the form. The reviews action ([features/reviews/actions.ts](features/reviews/actions.ts)) shows the correct pattern on all of its failure branches.
**Why it matters:** the admin writes a considered rejection or change request, hits a common validation gate, and must retype it. This is the CLAUDE.md values-echo rule, unapplied on the two forms whose text matters most to hosts.
**Fix:** add `values?: { reviewerNotes?: string }` to both result types, populate it on every failure branch, and render `defaultValue={state.values?.reviewerNotes ?? ''}`.

### P1-7. Three admin queues still render a database failure as an empty list (admin)

**Where:** [features/admin/hosts/queries.ts:101](features/admin/hosts/queries.ts:101) and [:146](features/admin/hosts/queries.ts:146) (catch → `[]` / `null`), [features/admin/experience-moderation/queries.ts:72](features/admin/experience-moderation/queries.ts:72) and [:135](features/admin/experience-moderation/queries.ts:135), [features/support/queries.ts](features/support/queries.ts).
**Evidence:** the users, guests, reviews, activity and payouts queries all rethrow with an in-code comment citing the 2026-07-28 audit ("errors go to the admin boundary, not the empty state"); these three modules were not updated and their pages consume the result directly, so the admin error boundary never fires.
**Why it matters:** during a pooler blip (a documented failure mode of this stack) the hosts directory, the moderation queue and the support inbox all say "nothing here". Wrong numbers presented confidently, on the surfaces where an operator decides whether work is waiting.
**Fix:** `reportError` then rethrow, exactly as the sibling modules do.

### P1-8. The host Today page still turns a database failure into "Nothing on the calendar" (host-dashboard; July H2, partial)

**Where:** [host-bookings/queries.ts:325–327](features/host-bookings/queries.ts:325) (pending requests → `[]`), [:353–355](features/host-bookings/queries.ts:353) (awaiting payment), [:407–409](features/host-bookings/queries.ts:407) (coming up), [:447–449](features/host-bookings/queries.ts:447) (calendar month), plus the pending count; consumed by [host/(dashboard)/page.tsx](<app/[locale]/host/(dashboard)/page.tsx>).
**Evidence:** the July fix landed on the bookings list and every earnings query (they rethrow, and the route's `error.tsx` renders), but these five Today-page helpers still `catch → reportError → return []`. The Today page renders `comingUp.length === 0 ? t('comingUp.empty')` and hides the "Needs your attention" block when the arrays are empty.
**Why it matters:** this is the July H2 scenario on the page it most matters: a host checking today's pickups during a pooler blip is told nothing is scheduled and may not show up.
**Fix:** rethrow from the five helpers, as the list and earnings queries now do.

---

## Medium (P2)

### Global chrome

### P2-1. The cookie banner takes 37–47 % of the first mobile viewport

**Where:** [cookie-notice.tsx:84–112](components/layout/cookie-notice.tsx:84) (`max-w-sm p-4`, `text-sm leading-relaxed` body, privacy link + two buttons in a `flex-wrap` row), [en.json](messages/en.json) `cookieNotice.bodyFull`.
**Evidence:** harness geometry at 375 px: 343 × **301** px in English (213 px in Arabic, whose labels fit on one row). On the home page it covers the hero intro; on every detail page it stacks above the 77 px sticky booking bar, so 378 of 812 px are covered until dismissed (`scratchpad/crops/home-0.png`, `det-13600.png`). In English the "Privacy policy" link forces "Essential only" and "Accept all" onto two rows.
**Why it matters:** this is the first thing every visitor sees, including paid TikTok landings on detail pages. The July C1 collision is fixed; the banner is simply too tall.
**Fix:** shorten the English body to two lines (name the two trackers, link "details"), move the privacy link into the body text, keep both buttons on one row, and consider `text-xs` for the body at `max-[400px]`.

### P2-2. Sub-4.5:1 text in the semantic `pending` tone and on gold eyebrows; one undefined gold token

**Where:** [globals.css](app/globals.css) `--color-pending: saffron-gold-800` on `--color-pending-surface: saffron-gold-100` — computed **4.22:1**; used at 12 px in [host/(dashboard)/page.tsx:331](<app/[locale]/host/(dashboard)/page.tsx:331>), [:422](<app/[locale]/host/(dashboard)/page.tsx:422>) (`Badge`, `text-xs` per [badge.tsx:15](components/ui/badge.tsx:15)) and [sla-countdown.tsx:66](<app/[locale]/host/(dashboard)/bookings/sla-countdown.tsx:66>). [hosting/page.tsx:91](app/[locale]/hosting/page.tsx:91) renders an 11 px eyebrow in raw `text-saffron-gold` — **1.79:1** on white. [about/page.tsx:85](app/[locale]/about/page.tsx:85), [abha/page.tsx:109](app/[locale]/abha/page.tsx:109) and [category-landing.tsx:79](features/experiences/components/category-landing.tsx:79) use `text-saffron-gold-700`, a step that does not exist in the ramp (50/100/200/400/600/800/900), so the class emits nothing and the eyebrow silently inherits black.
**Why it matters:** the pending tone is the one status a request-to-book host watches; 4.22:1 fails AA for 12 px text. The hosting eyebrow is unreadable for low-vision users, and the three `-700` eyebrows are a latent token bug.
**Fix:** point `--color-pending` at `saffron-gold-900` (6.94:1 on gold-100; the BRIEF's tone table should be updated to match), change the hosting eyebrow to `text-saffron-gold-800` (4.80:1), and replace `-700` with `-800`.

### Home

### P2-3. The hero's fixed-width rotating slot leaves a dead gap and breaks the mobile headline

**Where:** [hero-headline.tsx:96–107](components/marketing/hero-headline.tsx:96) (`slotWidth = Math.max(...widths)`), [:150–153](components/marketing/hero-headline.tsx:150); /en@1280 and @375.
**Evidence:** the slot is sized to the widest category word so rotation never reflows; after one cycle it settles on "Nature", the shortest. At 1280 px the settled headline reads "Nature experiences you / wouldn't find on your own." with a ~60 px hole; at 375 px "Nature" sits alone on line one and the sentence wraps to five ragged lines "Nature / experiences / you wouldn't / find on / your own." (`scratchpad/crops/home-0.png`). Arabic is fine because "الطبيعة" is close to the widest word.
**Why it matters:** the brand headline is the first line of type a visitor reads; a visible hole in it reads as a rendering fault, on desktop permanently.
**Fix:** settle the cycle on the widest word instead of index 0, or size the slot per word and let the one settle at the end of the cycle animate width via `layout` (a single, final layout change rather than a rotating one), or rewrite the English line so the rotating word ends the sentence ("Experiences you wouldn't find on your own — {Nature}").

### P2-4. Tonal placeholders for pale categories are indistinguishable from white, so cards look empty

**Where:** [experience-card.tsx:53–62](features/experiences/components/experience-card.tsx:53) (`wellness: 'bg-wadi-mint/25'`, `women_only: 'bg-tihama-coral/25'`, `family: 'bg-sarawat-blue/15'`, `food: 'bg-saffron-gold/20'`); /en, /en/experiences, /en/wishlist at every width.
**Evidence:** wadi-mint at 25 % over white is ≈ `#E7F5EE`; in the screenshots the Wellness and Women-only cards show a blank white block above the eyebrow (`scratchpad/crops/cat-9200.png`, `ardet-11500.png`, `home-8500.png`). Four of the seven live listings have no photo, so more than half the catalog renders as blank cards. The `/40` gradient used on dark Originals cards reads correctly.
**Why it matters:** blank cards look broken, not deliberate, and this is the state the catalog will be in until real photography lands.
**Fix:** raise the light placeholders to the `-100`/`-200` ramp steps (or `/50`) and add the category glyph the code already maps at [:80](features/experiences/components/experience-card.tsx:80) at a larger, centred size, so the block reads as an intentional tonal tile.

### Catalog

### P2-5. On phones the category strip is two screens below the fold

**Where:** [(catalog)/page.tsx:214–241](<app/[locale]/experiences/(catalog)/page.tsx:214>) (Featured Originals section renders before the main section), [:256](<app/[locale]/experiences/(catalog)/page.tsx:256>) (`FilterRail` inside the main section), [filter-rail.tsx:88–90](features/experiences/components/filter-rail.tsx:88) (`sticky top-16` strip); /en/experiences@375.
**Evidence:** the harness found the sticky strip at y = 1,929 px on a 375 × 812 viewport (2.4 screens down), below two 900 px Originals cards. Above the fold the page offers search and a filter icon only.
**Why it matters:** categories are the primary discovery axis (the home page leads with them); on the catalog page a phone user does not see them before scrolling through two cards, and the strip only becomes useful once it sticks.
**Fix:** render the chip row directly under the search field on `< lg` (keep it sticky from there), or move the Featured section below the first grid row on mobile.

### P2-6. Two `EmptyState` implementations with opposite visual language

**Where:** [components/ui/empty-state.tsx:32–54](components/ui/empty-state.tsx:32) (centred, icon in a circle, no border) vs [features/experiences/components/empty-state.tsx:33–47](features/experiences/components/empty-state.tsx:33) (bordered card, start-aligned, eyebrow, no icon).
**Evidence:** a guest who empties the catalog with a search sees a bordered card with "Reset filters"; the empty wishlist, `/me` and every admin queue use the floating icon variant.
**Why it matters:** the same concept — nothing to show — has two designs; the July audit flagged this (M9) and it is still open.
**Fix:** fold the catalog variant into the shared primitive as a `bordered` prop.

### Detail, booking, confirmation

### P2-7. The request-flow explainer says "Once confirmed" twice for two different moments, and the accepted state is titled "Approved" under a "Request accepted" eyebrow

**Where:** [en.json:3133–3135](messages/en.json:3133) (`nextStep1–3`), [:3275–3276](messages/en.json:3275); /en/book/confirmed/[ref] (pending and accepted).
**Evidence:** step 2 "Once confirmed, we share a secure payment link…", step 3 "Once confirmed, your booking page has everything…" — step 3 actually happens after payment. Eyebrow "Request accepted", title "Approved — complete your payment."
**Why it matters:** these three steps are the guest's only mental model of request-to-book; identical triggers blur when payment happens.
**Fix:** "If the host accepts, we send you a secure payment link." / "Once you've paid, your booking page has everything…" / title "Accepted — complete your payment." Mirror in Arabic.

### P2-8. The host decision is called accept, approve and confirm interchangeably, and "confirmed" is also the paid state

**Where:** [en.json:3884](messages/en.json:3884) and [:3983](messages/en.json:3983) "Awaiting host confirmation", [:3087](messages/en.json:3087) "Waiting for host approval", [:3275](messages/en.json:3275) "Request accepted", [:2161](messages/en.json:2161) host "Accept" vs [:2187](messages/en.json:2187) "can't be approved", [:994](messages/en.json:994) admin "Confirm", [:3544](messages/en.json:3544) "was accepted", [:1092](messages/en.json:1092) `bookingStatus.confirmed`.
**Why it matters:** a guest sees "Awaiting host confirmation" → "Request accepted" → "Approved" → "Confirmed": four words for two states, and the pending label collides with the paid status name.
**Fix:** hosts _accept_ or _decline_; guests wait "for the host"; reserve _confirmed_ for the paid state; admin label "Accept on the host's behalf". Apply to the listed keys in both locales.

### P2-9. Refund timelines and the credit product name differ between WhatsApp, email and web for the same event

**Where:** [guest.ts:649–650](lib/notifications/whatsapp/templates/guest.ts:649) "5–10 business days", [en.json:3502](messages/en.json:3502) "within a few business days", [:3505](messages/en.json:3505) "a business day or two", [:3163](messages/en.json:3163), [:4377](messages/en.json:4377) "1–2 business days"; [guest.ts:662](lib/notifications/whatsapp/templates/guest.ts:662) "Gharmish credit" vs "Gharmish Credit" everywhere else.
**Why it matters:** a guest who cancels receives three channels quoting three different waits for one refund.
**Fix:** agree one guest-facing window and use it in `REFUND_LINES`, `bookingEmail.*` and `bookingConfirmed.cancel.*`; capitalise the product name.

### P2-10. The booking form's rate-limit and open-bookings messages are ambiguous or blaming

**Where:** [en.json:3083](messages/en.json:3083) `tooManyNetwork` "please try again within the hour", [:3082](messages/en.json:3082) `tooMany` "You have too many open bookings right now."
**Why it matters:** "within the hour" means _before_ the hour ends; the blocked guest at the highest-intent moment cannot tell how long to wait, and the second message reads as a reprimand.
**Fix:** "Lots of bookings are coming from this network right now. Try again in about an hour." / "You already have a few bookings in progress. Finish or cancel one below to start this one."

### Auth + account

### P2-11. The profile page tells signed-in guests that online payments have not gone live

**Where:** [en.json:3974–3975](messages/en.json:3974) `me.profile.payment.emptyDescription`, rendered unconditionally by the payment-methods section in [me/profile/page.tsx](app/[locale]/me/profile/page.tsx).
**Evidence:** "Saved cards arrive when online payments go live." HyperPay card and Apple Pay checkout are live.
**Fix:** "We don't store cards yet — each payment is entered securely on the payment page." or hide the section until saved cards exist.

### P2-12. Wrong-code copy does not distinguish an expired OTP from a mistyped one (opportunity)

**Where:** [features/auth/actions.ts](features/auth/actions.ts) (message union `validation | rate_limited | server | invalid_code`), [en.json:49](messages/en.json:49) "That code didn't match. Check it and try again."
**Why it matters:** a guest who returns after the code expired retries the same digits instead of tapping Resend, which is right below but not signposted.
**Fix:** surface an expired state if the provider reports it; otherwise "That code didn't match or has expired — check it, or request a new one."

### Host

### P2-13. Host-facing copy contradicts itself on when payouts are earned, where requests arrive, and the review SLA

**Where:** [en.json:1726](messages/en.json:1726) "payouts for confirmed bookings" vs [:1653](messages/en.json:1653), [:2317](messages/en.json:2317) "when a booking is completed"; [:1874](messages/en.json:1874) "We'll email you the moment someone books" vs [:2058](messages/en.json:2058) "Booking requests and reminders arrive on WhatsApp"; [:1956](messages/en.json:1956), [:2754](messages/en.json:2754) "two working days" vs [:2495](messages/en.json:2495) "usually within a day".
**Why it matters:** hosts form the wrong expectation about cash timing and where to watch for requests; conflicting SLAs on a partnership pitch read as carelessness.
**Fix:** "payouts for completed bookings"; "We'll message you on WhatsApp (and email) the moment someone books"; one SLA in all three keys.

### P2-14. Arabic plural forms are wrong for double-digit counts on payout statements and admin counts (i18n-ar)

**Where:** [ar.json](messages/ar.json) `hostEarnings.statements.bookings` = `{count, plural, one {حجز واحد} other {# حجوزات}}`, `admin.catalog.liveCount`, `admin.catalog.totalCount`, `admin.vat.unstampedWarning`.
**Evidence:** only `one`/`other` are defined and `other` uses the broken plural حجوزات, correct for 3–10 only; 15 bookings renders "15 حجوزات", which is ungrammatical (11–99 take the singular accusative: "15 حجزًا"). The sibling key `admin.guestsList.bookingsCount` already has the correct six-category form.
**Why it matters:** the host payout statement is a document hosts keep; the grammar error lands on a number.
**Fix:** expand the four keys to `=0/one/two/few/many/other`, mirroring `admin.guestsList.bookingsCount`.

### P2-15. The host booking-outcome banner interpolates a `GH-` reference and a date into an Arabic sentence with no bidi isolation (i18n-ar)

**Where:** [outcome-notice.tsx:53–70](features/host-bookings/components/outcome-notice.tsx:53); `ar.json` `hostBookings.outcome.*`.
**Evidence:** `t(outcome, { reference: ref })` and a spliced `${formatDate} · ${formatTime}` string are rendered as plain text in `<span className="flex-1">`, whereas every email row uses `escIsolated()` and the WhatsApp renderer uses `bidiIsolate()` for the same values.
**Why it matters:** the reference's trailing punctuation and the date's separators can jump sides on the banner the host sees right after accepting or declining.
**Fix:** wrap the interpolated values with the existing `bidiIsolate()` helper (or render the message in a `dir="auto"` span).

### Admin

### P2-16. Reviewer-note errors are not associated with the textarea

**Where:** [host-applications/[id]/reviewer-actions.tsx:97–149](app/[locale]/admin/host-applications/[id]/reviewer-actions.tsx:97), [experience-moderation/[id]/reviewer-actions.tsx:105–187](app/[locale]/admin/experience-moderation/[id]/reviewer-actions.tsx:105).
**Evidence:** errors render as a bare `<p role="alert">` with no `aria-describedby`/`aria-invalid` on the textarea; every other form in the app uses `FieldError` ([components/ui/field-error.tsx](components/ui/field-error.tsx)).
**Fix:** reuse `FieldError` and wire the attributes as [refund-bank-fields.tsx](features/bookings/components/refund-bank-fields.tsx) does.

### P2-17. Rejecting a host application or an experience has no confirmation step

**Where:** the same two `reviewer-actions.tsx` files (no `ConfirmSubmit` import).
**Evidence:** every other destructive or high-stakes admin action — emergency cancel, refund, mark paid, suspend, VAT enable, wallet issue — is gated behind `ConfirmSubmit`; a reject sends the applicant a decline notification and cannot be undone from the screen.
**Fix:** wrap Reject (and Request changes) in `ConfirmSubmit`, naming the applicant or listing in the dialog.

### P2-18. The admin experience editor has no unsaved-changes guard; the host editor does

**Where:** [host …/experience-form.tsx:418–422](<app/[locale]/host/(dashboard)/experiences/[id]/experience-form.tsx:418>) (`beforeunload`), [admin-experience-form.tsx](app/[locale]/admin/experiences/[id]/edit/admin-experience-form.tsx) (642 lines, no listener; `grep -rl beforeunload` returns only the host file).
**Fix:** reuse the same dirty-tracking + `beforeunload` pattern.

### P2-19. The admin rail shows no attention counts outside the dashboard (opportunity)

**Where:** [admin-nav.tsx](features/admin/dashboard/components/admin-nav.tsx) (four flat link groups, no badges), [work-queue.tsx](features/admin/dashboard/components/work-queue.tsx) (the only pending signal, rendered on `/admin` alone).
**Evidence:** the host nav shows a pending-requests chip on every host page; the admin rail shows nothing for host applications, moderation, disputes, support or payouts due.
**Why it matters:** an operator working in `/admin/support` has no signal that a host application or dispute is waiting elsewhere and must go back to the dashboard to find out.
**Fix:** render the counts the work queue already computes as small badges on the matching rail items.

### P2-20. Admin TOTP has no recovery path

**Where:** [features/admin/mfa.ts](features/admin/mfa.ts), [mfa-actions.ts](features/admin/mfa-actions.ts), [admin-mfa-gate.tsx](features/admin/components/admin-mfa-gate.tsx).
**Evidence:** the gate renders only "enrol" (fresh QR) or "verify" (six digits); there are no backup codes, no unenrol, no "lost your device?" path — the gate's own copy says "Contact the platform owner to have your factor reset", which today means editing the database.
**Why it matters:** the second factor is owner-locked and right; a phone loss or clock drift locks the only admin out of the entire console until someone runs SQL. Rated P2 rather than P1 only because the owner has direct database access.
**Fix:** show single-use backup codes at enrolment (stored hashed), or an in-app "reset this admin's factor" action for another enrolled admin.

### Design system

### P2-21. `divide-y` renders 1 px rules inside 0.5 px-bordered cards, app-wide

**Where:** 18 files / 30+ lists, e.g. [host/(dashboard)/page.tsx:300](<app/[locale]/host/(dashboard)/page.tsx:300>), [host/(dashboard)/bookings/page.tsx:135](<app/[locale]/host/(dashboard)/bookings/page.tsx:135>), [earnings/page.tsx:225](<app/[locale]/host/(dashboard)/earnings/page.tsx:225>), every admin list.
**Evidence:** Tailwind's `divide-y` sets `border-top-width: 1px` on `> * + *`; the enclosing cards carry `[border-width:0.5px]`, so every internal row divider is twice the weight of the card edge. The July audit flagged this (M3); still open.
**Fix:** a `divide-hairline` utility in `globals.css` (`> * + * { border-top-width: 0.5px }`) swapped in wherever `divide-y` sits inside `rounded-card`.

### P2-22. Off-grid 20 px / 56 px spacing is widespread (`p-5`, `gap-5`, `py-14`)

**Where:** 127 hits in 65 files, e.g. [admin/users/[key]/page.tsx:87](app/[locale]/admin/users/[key]/page.tsx:87) (`p-6` card) vs [:231](app/[locale]/admin/users/[key]/page.tsx:231) (`p-5` rows) on one page; [hosting/page.tsx:149–294](app/[locale]/hosting/page.tsx:149) (`py-14` ×7).
**Evidence:** the BRIEF scale is 4/8/12/16/24/32/48/64/80/120; 20 and 56 are not on it. July M1 flagged ~290 occurrences; the count has fallen but the pattern persists.
**Fix:** `gap-5/p-5 → 4 or 6`, `py-14 → 12 or 16`, as a mechanical sweep.

### Carried forward from July (partial fixes)

### P2-23. Four smaller forms still wipe typed input on a failed submit (host, admin; July M11)

**Where:** [payout-method-form.tsx:58–66](features/host-earnings/components/payout-method-form.tsx:58) (IBAN input, no `defaultValue` from state), [create-promo-form.tsx](app/[locale]/admin/promo-codes/create-promo-form.tsx) (no values echo; every field shows the same generic error), [report-problem-form.tsx](features/disputes/components/report-problem-form.tsx) (dispute text), [host-reply-form.tsx:113](<app/[locale]/host/(dashboard)/reviews/host-reply-form.tsx:113>) (`defaultValue={existingReply}` only, so a new reply resets to empty).
**Evidence:** `promo-code-field.tsx` and `admin-settings-form.tsx` were fixed with the values-echo pattern; these four were not. A mistyped IBAN checksum, a promo typo, a dispute description or a review reply is discarded on the first validation error.
**Fix:** echo `state.values` and render `defaultValue={state.values?.x ?? initial}` as the booking form does.

### P2-24. Admin users and guests search runs in JS after a 1,000-row cap with no notice (admin; July M25)

**Where:** [admin/users/queries.ts:43](features/admin/users/queries.ts:43), [:117–141](features/admin/users/queries.ts:117) (`LIST_LIMIT = 1000` per source), [:201–208](features/admin/users/queries.ts:201) (`all.filter(...)`).
**Evidence:** bookings, disputes and activity gained a "Showing the latest {count}…" notice; the people directory did not, and its search still cannot find anyone older than the newest 1,000 rows per source.
**Fix:** push `ilike` into each source query, or at minimum show the same truncation notice.

### P2-25. The host application uploads multi-MB KYC documents before any validation and shows no upload phase (host-apply; July M13)

**Where:** [host-apply-form.tsx:317](app/[locale]/host/apply/host-apply-form.tsx:317) (`noValidate`, no client `safeParse`, the pending label is the only progress signal).
**Evidence:** unchanged since July; a missing required field is only reported after the documents have been posted.
**Fix:** run the shared zod schema client-side before submit; add an "Uploading documents…" phase to the pending label.

---

## Low (P3)

### Global chrome and layout

- **P3-1. Sub-24 px text links inside control rows.** "Privacy policy" in the cookie banner is 92 × 20 px ([cookie-notice.tsx:96](components/layout/cookie-notice.tsx:96)); the booking-history "View" links are 32 × 20 px ([booking-history.tsx:81](features/account/profile/components/booking-history.tsx:81)); "Download CSV" on host earnings is 98 × 20 px. WCAG 2.5.8 wants 24 px; give them `min-h-6`/`py-1`.
- **P3-2. The home page is ~10,000 CSS px tall on a phone** (`scratchpad/shots/pub375/en-375.png` is 20,268 px at 2×): hero, search, chips, Originals ×2, six cards, reviews, "Every experience…", Chapter One, beliefs, CTA, footer. Consider collapsing the beliefs and Chapter One bands on `< sm` (opportunity).
- **P3-3. Card meta line leaves a dangling separator.** [experience-card.tsx:287–296](features/experiences/components/experience-card.tsx:287) renders `place · duration ·` then wraps "With {host}" to the next line at 375 px, so line one ends in an orphaned dot (`scratchpad/crops/cat-1700.png`). Put the host on its own line or use a `before:` pseudo-separator that only shows between items on the same line.
- **P3-4. The 404 page has no title.** [not-found.tsx](app/[locale]/not-found.tsx) exports no metadata, so the tab reads just "Gharmish" (layout template at [layout.tsx:60](app/[locale]/layout.tsx:60)); add `metadata = { title: … }` ("Page not found").
- **P3-5. The detail page states "Request to book" twice within one screen** — the pill "Request to book — host confirms first" ([en.json:2981](messages/en.json:2981)) followed immediately by the amber notice "Request to book — the host responds within 24 hours…" ([en.json:3074](messages/en.json:3074)) (`scratchpad/crops/det-11900.png`). Keep the notice, shorten the pill to "Request to book".
- **P3-6. 11 px labels in the calendar and timeline.** Weekday headers ([booking-calendar.tsx:281](features/bookings/components/booking-calendar.tsx:281)) and the moments' time labels on the detail page are 11 px uppercase; 12 px is the floor for anything that is not a decorative eyebrow.

### Auth + account

- **P3-7. Sign-in intro says "Saudi mobile" while the picker is international** ([en.json:24](messages/en.json:24), [ar.json:24](messages/ar.json:24) "برقم جوالك السعودي"). "Sign in with your mobile number or email".
- **P3-8. The country select truncates to "+966 Sa…" at 375 px** ([phone-input.tsx:108](components/ui/phone-input.tsx:108) renders `flag +dial name`); show flag + dial only in the closed state.
- **P3-9. Profile shows the phone unformatted** ("+966541104000" at [me/profile/page.tsx:112](app/[locale]/me/profile/page.tsx:112)); `formatSaudiPhone` in [lib/format.ts:47](lib/format.ts:47) exists for exactly this (BRIEF §4: `+966 5X XXX XXXX`).
- **P3-10. Sign-in error paragraphs carry `tabIndex={-1}` that nothing focuses** ([sign-in-form.tsx:272–280](<app/[locale]/(auth)/sign-in/sign-in-form.tsx:272>), [:385–389](<app/[locale]/(auth)/sign-in/sign-in-form.tsx:385>)); either focus them or drop the attribute.

### Copy (English)

- **P3-11. Payments jargon reaches guests and hosts:** "hold" ([en.json:3556](messages/en.json:3556), [:4085](messages/en.json:4085)), "card-charged amount" ([:3296](messages/en.json:3296)), "settled" ([:2328](messages/en.json:2328)). Say "spot", "what you paid by card", "paid out".
- **P3-12. "/ person" on cards and the detail price vs "per guest" everywhere else** ([en.json:2937](messages/en.json:2937) vs [:1879](messages/en.json:1879), [:3631](messages/en.json:3631)); also "Party of {count}" vs "{count} guests".
- **P3-13. British and American spellings mixed** ("catalogue" ×10 vs "catalog" ×13, "authorised" vs "Authorized", "travelers" vs "travellers") — pick British and normalise.
- **P3-14. Pending button labels inconsistently use an ellipsis** ("Saving…" ×7 vs "Saving" ×6, "Sending" vs "Sending…"); one convention with `aria-busy`.
- **P3-15. Curly and straight apostrophes mixed**, sometimes on one page ("What’s included" [:2602](messages/en.json:2602) vs "What's included" [:2620](messages/en.json:2620)).
- **P3-16. "Please" in a minority of validation messages** ([:3046](messages/en.json:3046), [:3050](messages/en.json:3050), [:3459](messages/en.json:3459) …) against the direct-imperative house style.
- **P3-17. Fragments assembled in code**, including a host email greeting that is just "Good news," ([:3534](messages/en.json:3534), used at [booking-email.ts:1591](features/bookings/lib/booking-email.ts:1591) and six more sites) and lowercase hints like [:2492](messages/en.json:2492).
- **P3-18. Email footers still carry the Aseer-fixed tagline** in both locales ([en.json:3499](messages/en.json:3499) and seven more; [ar.json](messages/ar.json) likewise) while the site footer and the newest template use the place-agnostic line — one shared footer key.
- **P3-19. How-it-works omits Apple Pay** ([:4056](messages/en.json:4056)) while checkout, terms and the footer advertise it.
- **P3-20. 404 and error copy:** "may have moved, paused, or never existed" does not parse ([:3657](messages/en.json:3657)); "We could not load this page" ([:3663](messages/en.json:3663)) against contracted copy everywhere else.
- **P3-21. "h" vs "hr"** for hours ([:3672](messages/en.json:3672) "about {hours}h" vs [:2938](messages/en.json:2938) "hr").
- **P3-22. The host description hint mentions "AI agents"** ([:2608](messages/en.json:2608)).
- **P3-23. Admin cancel confirmation describes a request being turned down** but applies to confirmed bookings ([:1004](messages/en.json:1004)).
- **P3-24. WhatsApp templates use emoji** ([guest.ts:480](lib/notifications/whatsapp/templates/guest.ts:480), [host.ts:72–78](lib/notifications/whatsapp/templates/host.ts:72), [internal.ts:36](lib/notifications/whatsapp/templates/internal.ts:36)) although the 2026-08 brand audit recorded a no-emoji rule for WhatsApp — owner to confirm which rule stands.

### Arabic

- **P3-25. Several ICU plurals omit `many`/`zero`** (`admin.dashboard.metrics.health.stars`, `hostDashboard.numbers.ratingCount`, `…responseTime`, `…daysPerWeek`); output happens to be correct today, but the inconsistency invites the P2-14 mistake.
- **P3-26. Email subjects interpolate the raw `GH-` reference without bidi isolation** ([booking-email.ts:314](features/bookings/lib/booking-email.ts:314), [:616](features/bookings/lib/booking-email.ts:616), [:1146](features/bookings/lib/booking-email.ts:1146) …) while bodies use `bidiIsolate()`.
- **P3-27. The Hijri toggle the BRIEF specifies is plumbed but unexposed** ([lib/format.ts:83–96](lib/format.ts:83) supports `calendar: 'islamic'`; no caller, no setting) — build it or drop it from the brief (opportunity).
- **P3-28. "تجارب غارميش الأصلية" as a removable filter chip is three words against one-word neighbours** (`experiencesIndex.originalsToken`); verify it does not crowd the × control at 375 px.

### Design system hygiene

- **P3-29. No shared `Textarea`/`Select` primitive** — 21 raw `<textarea>` and 10 raw `<select>` copy the same class string, with one drift already (`px-3` vs `px-4`).
- **P3-30. `Card` primitive used in 5 files while 77 hand-roll `rounded-card` divs**; migrate opportunistically.
- **P3-31. `size-3` (12 px) icons inside card chips** ([experience-card.tsx:246–269](features/experiences/components/experience-card.tsx:246)) below the 16 px minimum; either document a "micro" tier or use `size-4`.
- **P3-32. Two raw radius overrides** (`rounded-sm` in the revenue chart, `rounded-none` in the skeleton).
- **P3-33. Category-disable and promo-deactivate toggles skip `ConfirmSubmit`** ([category-toggle-form.tsx:56–67](app/[locale]/admin/catalog/category-toggle-form.tsx:56), [promo-active-toggle.tsx:51–64](app/[locale]/admin/promo-codes/promo-active-toggle.tsx:51)) while the VAT toggle has one.
- **P3-34. `resolveSettleAnomaly` returns `{ success: false }` on its own success path** ([features/admin/bookings/actions.ts:667](features/admin/bookings/actions.ts:667)); harmless today because the button only reads `.message`, but it inverts the codebase's discriminated-state convention.
- **P3-35. Booking-status words diverge by audience without a glossary:** `pending` is "Awaiting host confirmation" for guests, "New request" for hosts, "Pending" for admins ([en.json](messages/en.json) `me.status`, `hostBookings.status`, `admin.bookingStatus`). Deliberate per audience, but support staff hold the mapping in their heads; see P2-8 for the accept/approve/confirm part that is not deliberate.

---

## What is working well

- **Zero horizontal overflow** on every public page at 320, 375, 768 and 1280 px in both locales, signed out and signed in (the earnings page is the single exception).
- **Design-token discipline is near-perfect:** no default-palette classes, no raw hex outside Satori/PDF/iframe contexts, 250+ radius-token uses against two raw overrides, no `font-bold`, shadow only on floating layers, every `ArrowLeft/Right` and `Chevron` mirrors in RTL, no component-level focus-ring overrides.
- **Accessibility fundamentals are real, not nominal:** skip link moves focus into `main`, one h1 per page, labelled landmarks, icon-only nav links carry names, the filter sheet is a proper dialog (focus trapped, Escape restores focus to the trigger), the gallery lightbox restores focus, the calendar is a `grid` with row/column headers and disabled days that say _why_ ("too close to the start time"), the party stepper announces changes, search results update a live region ("1 experience").
- **The booking form is the best-built surface in the app:** idempotency keys survive retries, every value is echoed on failure, focus moves to the first invalid control (scrolled clear of the sticky bar), stale availability is handled honestly, the mobile bar shows which day is being booked and refuses to submit an unseen auto-selected date.
- **Sign-in is thorough:** WebOTP autofill, `one-time-code`, auto-submit on six digits, resend cooldown, every failure message mapped.
- **Arabic is the strongest domain:** 3,429 keys in perfect parity, zero Arabic-Indic digits, غارميش spelled consistently, calm MSA register, correct ، and ؟, centralised `numberingSystem: 'latn'` formatting, and a deliberate bidi-isolation strategy in emails and WhatsApp.
- **English copy never blames the user or leaks internals** on guest surfaces; ICU plurals are used everywhere; legal pages read as prose with policy numbers interpolated from the database.
- **State coverage on guest and host surfaces is honest:** host bookings, earnings and dashboard queries rethrow so the error boundary renders instead of a false empty state (the July C3/H2 fixes landed), error boundaries report to Sentry and retry, skeletons mirror their layouts.
- **Motion respects the brief:** transform/opacity only, one spring, `prefers-reduced-motion` closes both the CSS and Framer layers, the marquee stops permanently on interaction, the hero never animates opacity on the LCP path.
- **Host decision UI gives real context:** booking rows show seats taken and left, the guest note, and a cutoff- or capacity-aware disabled Accept with the reason; the booking detail page carries the lifecycle timeline, attestations and reschedule history the August audit asked for. Destructive host and admin actions route through `ConfirmSubmit` with a required reason.
- **Admin surfaces mask PII** (IBAN, national ID) everywhere post-approval with the full value reserved for copy-to-clipboard, and the bookings list discloses its 500-row cap instead of presenting a silently windowed total.
- **404 and bad references** (`/book/confirmed/NOPE`, `/book/NOPE/pay`, `/hosts/nope`) all land on the branded not-found page with a real 404 status.
- **Language switching keeps path, query string and the chosen date.**

---

## Prior-audit status

Every item in [UX_AUDIT.md](UX_AUDIT.md) (3 Critical, 12 High, 32 Medium, 20 Low, plus Quick wins) and every residual named in the four later audits was re-checked against the current source.

| Document                                       | Fixed                  | Partial    | Open                                      | Regressed |
| ---------------------------------------------- | ---------------------- | ---------- | ----------------------------------------- | --------- |
| UX_AUDIT.md Critical (C1–C3)                   | 3                      | 0          | 0                                         | 0         |
| UX_AUDIT.md High (H1–H12)                      | 10                     | 2 (H2, H3) | 0                                         | 0         |
| UX_AUDIT.md Medium (M1–M32)                    | 12                     | 6          | 12 (8 of them the token-drift cluster)    | 0         |
| UX_AUDIT.md Low (L1–L20)                       | 9                      | 5          | 6                                         | 0         |
| HOMEPAGE_BOOKING_AUDIT residuals               | 1 (dispute-email CTAs) | 0          | 1 (Arabic font preload — owner trade-off) | 0         |
| HOST_DASHBOARD_AUDIT deferred items            | 2                      | 0          | 0                                         | 0         |
| HOST_LISTING_AUDIT / MARKETING_AUDIT deferrals | —                      | —          | still deferred as documented              | 0         |

**No regressions.** Every "partial" is a fix applied correctly at its cited location that was not extended to sibling instances. The still-open and partial items, restated with today's evidence:

| July id                         | Status         | Today                                                                                                                                              | Where                                                                                                                                                                                                                                       |
| ------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H2                              | partial        | Bookings list and earnings now rethrow, but the five Today-page helpers still swallow DB errors → **P1-8**                                         | [host-bookings/queries.ts:325–449](features/host-bookings/queries.ts:325)                                                                                                                                                                   |
| H3                              | partial        | 500-row cap is now disclosed; status counts and search still run in JS over the window, no pagination (P2)                                         | [admin/bookings/queries.ts:26](features/admin/bookings/queries.ts:26), [admin/bookings/page.tsx:193](app/[locale]/admin/bookings/page.tsx:193)                                                                                              |
| M11                             | partial        | 4 of 6 smaller forms still wipe input on a failed submit → **P2-23**                                                                               | see P2-23                                                                                                                                                                                                                                   |
| M14                             | partial        | suspend and dispute-resolve got `ConfirmSubmit`; host-application approve/reject and the host review reply did not → **P2-17**                     | see P2-17                                                                                                                                                                                                                                   |
| M13                             | open           | host application: no client-side validation before the KYC upload, no upload phase → **P2-25**                                                     | [host-apply-form.tsx:317](app/[locale]/host/apply/host-apply-form.tsx:317)                                                                                                                                                                  |
| M25                             | open           | admin users/guests search still runs in JS after a 1,000-row cap with no notice → **P2-24**                                                        | [admin/users/queries.ts:43](features/admin/users/queries.ts:43), [:201–208](features/admin/users/queries.ts:201)                                                                                                                            |
| M1, M2, M3, M5, M7, M8, M9, M10 | open           | the design-token drift cluster is unchanged or slightly worse (gap-5 64×, hand-rolled cards 151× vs 132) → **P2-6, P2-21, P2-22, P3-29, P3-30**    | app-wide                                                                                                                                                                                                                                    |
| M16                             | open           | review form: rating validated server-side only, radiogroup not wired to its error, no character counter (P3)                                       | [review-form.tsx:79–149](features/reviews/components/review-form.tsx:79)                                                                                                                                                                    |
| M20                             | partial        | wishlist heart gained a tint cue; selected review stars still saffron on white at 1.79:1 (P3)                                                      | [review-form.tsx:105–108](features/reviews/components/review-form.tsx:105)                                                                                                                                                                  |
| M21                             | partial        | result count is `aria-live`; the grid's `FadeSwap` wrapper has no `aria-busy` (P3)                                                                 | [(catalog)/page.tsx:268–296](<app/[locale]/experiences/(catalog)/page.tsx:268>)                                                                                                                                                             |
| M23                             | open           | input borders still 1.30–1.57:1 against the 3:1 floor for field boundaries (P3)                                                                    | [input.tsx:16](components/ui/input.tsx:16), [review-form.tsx:149](features/reviews/components/review-form.tsx:149)                                                                                                                          |
| M28                             | partial        | shared `ExperienceCardSkeleton` adopted everywhere except `/wishlist` (P3)                                                                         | [wishlist/loading.tsx:15–21](app/[locale]/wishlist/loading.tsx:15)                                                                                                                                                                          |
| M30                             | partial        | grid overflow fixed with `minmax(0,1fr)`; the booking panel is still `lg:`-gated, so 768 px scrolls the whole description before the calendar (P3) | [experiences/[slug]/page.tsx:774](app/[locale]/experiences/[slug]/page.tsx:774)                                                                                                                                                             |
| M32                             | partial        | forfeited copy, terms naming, FAQ wording and admin intro fixed; UK/US spelling and the ellipsis convention remain → P3-13, P3-14                  | —                                                                                                                                                                                                                                           |
| L2                              | partial        | history capped at 100 with a progress stepper; awaiting-payment rows still show "View", not "Complete payment", and no "show all" (P3)             | [booking-history.tsx:75–84](features/account/profile/components/booking-history.tsx:75)                                                                                                                                                     |
| L3                              | open           | `/me` has no `loading.tsx` (P3)                                                                                                                    | `app/[locale]/me/`                                                                                                                                                                                                                          |
| L4                              | partial        | earnings history got real pagination; host-bookings' 200-row open bucket and the promo-codes list are still uncapped/undisclosed (P3)              | [host-bookings/queries.ts:37](features/host-bookings/queries.ts:37), [promo-codes/queries.ts:49](features/promo-codes/queries.ts:49)                                                                                                        |
| L5                              | open           | admin analytics shows "database not configured" for any query failure (P3)                                                                         | [admin/analytics/page.tsx:45](app/[locale]/admin/analytics/page.tsx:45)                                                                                                                                                                     |
| L10                             | partial        | lightbox alt gained "n/N"; carousel and mosaic thumbnails still repeat the same alt (P3)                                                           | [photo-carousel.tsx:182](components/ui/photo-carousel.tsx:182), [photo-gallery.tsx:250](features/experiences/components/photo-gallery.tsx:250)                                                                                              |
| L11                             | partial        | card rating is now `role="img"` but its label still omits the review count sighted users see (P3)                                                  | [experience-card.tsx:311–314](features/experiences/components/experience-card.tsx:311)                                                                                                                                                      |
| L13                             | open           | calendar cells use `aria-pressed` not `aria-selected`; filler cells pair `role="gridcell"` with `aria-hidden` (P3)                                 | [booking-calendar.tsx:295–348](features/bookings/components/booking-calendar.tsx:295)                                                                                                                                                       |
| L16                             | open           | `Dialog` still wraps its trigger in a `<span>` (P3)                                                                                                | [dialog.tsx:52](components/ui/dialog.tsx:52)                                                                                                                                                                                                |
| L17                             | partial        | invoice chip fixed; global-error CTA still hand-rolled, gallery remove button still 28 px, payment-mark radius still bespoke (P3)                  | [global-error.tsx:48](app/global-error.tsx:48), [gallery-manager.tsx:80](app/[locale]/admin/experiences/[id]/edit/gallery-manager.tsx:80)                                                                                                   |
| L19                             | open           | three forms use `disabled={pending}` instead of the Button `pending` prop, dropping focus mid-submit (P3)                                          | [review-form.tsx:51](features/reviews/components/review-form.tsx:51), [profile-form.tsx:39](features/account/profile/components/profile-form.tsx:39), [host-profile-form.tsx:56](features/host-profile/components/host-profile-form.tsx:56) |
| L20                             | open           | the payment provider is named three ways in guest copy (P3)                                                                                        | [en.json:3348](messages/en.json:3348), [:3414](messages/en.json:3414), [:4033](messages/en.json:4033)                                                                                                                                       |
| Arabic font preload             | owner decision | `preload: false` on IBM Plex Sans Arabic still trades a small FOUT for a shared layout module                                                      | [lib/fonts.ts:56](lib/fonts.ts:56)                                                                                                                                                                                                          |

Confirmed fixed, with the proof read in source: C1, C2, C3, H1, H4–H12, M6, M12, M15, M17, M18, M19, M22, M24, M26, M27, M29, M31, the four M32 sub-items above, L1, L6, L7, L8, L9, L12, L14, L15, L18, the dispute-email CTAs, and both HOST_DASHBOARD deferrals (notification toggles, verified phone change).

---

## Recommended order of work

1. **P1-3 `HoverLift` tab stops** — one line in `motion.tsx`, fixes keyboard order on every page.
2. **P1-2 host tab bar into `--bottom-dock`** — one attribute; stops the cookie banner and every host toast covering the navigation.
3. **P1-1 host earnings overflow** — `min-w-0` on two grid children.
4. **P1-5 cancellation policy / FAQ refund copy** — make the trust page tell the truth about the bank-transfer rail (both locales).
5. **P1-4 signed-out `/me`** — sign-in prompt instead of "Nothing here yet"; collapse the double empty state.
6. **P1-6 / P1-7 / P1-8 values echo and rethrow** — copy the patterns that already exist in `features/reviews/actions.ts`, `features/admin/users/queries.ts` and the host bookings list query; finish the July M11 forms (P2-23) in the same pass.
7. **P2-2 contrast tokens** — `--color-pending` → gold-900, hosting eyebrow → gold-800, replace the undefined `-700`.
8. **P2-4 placeholder tints** — the catalog will look empty until photography lands; make the tonal tiles read as deliberate.
9. **P2-3 hero slot** — settle on the widest word or end the sentence with the rotating word.
10. **P2-1 cookie banner height** and **P2-5 category strip position** — the two first-viewport issues on phones.

**Quick wins (under 30 minutes each):** P2-7, P2-10, P2-11, P3-4, P3-5, P3-7, P3-9, P3-12, P3-19, P3-20, P3-21, P3-22, P3-23, P2-14 (copy the sibling plural), P2-15 (`bidiIsolate`).

---

## Coverage and limits

**Examined:** every public route in both locales at 375/768/1280 px (plus 320 px for home, catalog, a detail page and the host dashboard); the signed-in host dashboard (overview, bookings, earnings, experiences, profile, reviews), `/me`, `/me/profile`, `/wishlist` and the admin TOTP gate at 375 and 1280 px in EN and AR; a read-only interaction walk of the guest funnel to the moment before submit; the code of every form, query, message catalog and layout primitive named above.

**Not examined:** the awaiting-payment page, the HyperPay widget, the confirmation page, cancel/reschedule and the refund-bank form as _rendered_ pages — exercising them writes to the live database, so they were audited from code only (their copy is covered in P2-7 to P2-10); the admin console behind the TOTP gate (code-only, this file's Admin sections); rendered email and WhatsApp output (copy only); real-device iOS Safari behaviour (safe areas, keyboard overlap) — the harness emulates a 375 × 812 touch viewport in Chromium.

**Method notes:** three attempts to run this audit as a 19-agent workflow hit the session usage limit; the audit was completed as a lead-driven walkthrough with six scoped code sweeps. The harness and screenshots live in the session scratchpad (`shots/`, `crops/`, `findings/`).
