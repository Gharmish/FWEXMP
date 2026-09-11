# Homepage & Booking Journey Audit — 2026-08-28

> Senior-marketplace-lens (Airbnb-calibre) audit of the guest funnel: homepage →
> discovery → experience detail → date/party selection → checkout & payment →
> confirmation & post-booking. Method: 8 parallel code auditors over the working
> tree + adversarial verification of every P0/P1, plus a live walkthrough of
> gharmish.com (desktop + 375px, EN + AR, DOM/a11y-level inspection, booking flow
> driven to the moment before submit). Standards: BRIEF.md, WCAG 2.2 AA, and
> top-tier marketplace conversion table stakes. Owner-locked decisions
> (day-preset filters, keyless Leaflet, international phone picker, manual
> bank-transfer refunds, no-VAT copy, catalog cap 6, sub-44px calendar cells)
> were treated as settled and are not re-flagged.
>
> **Update 2026-08-30 — REMEDIATED.** The findings below were the report;
> they have since been implemented across ~80 files (10 file-disjoint fix
> packages + a security re-review pass). See **Remediation status** directly
> below for what shipped, what changed from the original recommendation, and
> the two residual items outside this change set. `pnpm typecheck`, `pnpm lint`,
> and all 1522 Vitest tests pass. Nothing has been committed (per CLAUDE.md).

## Remediation status (2026-08-30)

**Both P0s + all ten P1s + the large majority of P2/P3s are fixed.** Two DB
content fixes were also applied directly (the "A set of Lights" orphan removed;
five listings' missing Arabic inclusions/what-to-bring backfilled).

An adversarial verification pass (3 reviewers) then caught issues in the first
implementation, which were fixed in a second pass — most notably **two security
regressions the fix itself introduced**:

- **Refund bank-details form must NOT accept the `?k=` link token.** The first
  pass token-authorized it (so a cookieless guest could submit an IBAN); but
  that form directs money _out_, and the token is forwardable — a leaked link
  could redirect a victim's refund. Corrected to the audit's other branch:
  cookie/session only, with a **sign-in prompt** for token-only viewers. The
  cookieless guest still recovers (email CTA → tokened booking page → read view
  - sign-in), but authorizing the payee now requires a real account.
- **Supersede hold-release must not trust the submitted phone.** The first pass
  released the old hold when `hold.contactPhone === input.phone` — attacker-
  suppliable. Corrected to require the same-device cookie **or** a valid signed
  link token for the superseded reference (threaded pay-page → detail → form →
  action), so a bare leaked reference can't cancel a stranger's hold.

Other second-pass fixes: honest cancelled-header refund copy (branches on
`refundBank`, matching the email), JSON-LD review author no longer double-
abbreviates Arabic compound names, **P1-6 language switcher now preserves query
params** (it had been missed entirely — no package owned it), meeting-point
"approximate" map snaps its center to a ~1 km grid so the exact point can't be
reverse-averaged, support-WhatsApp link uses the shared resolver, homepage
social-proof strip now also excludes emoji-bearing reviews, EN "30 min" copy.

**Two residuals NOT addressed here (deliberately):**

1. **`features/disputes/lib/dispute-email.ts` re-introduces the P0-1 regression**
   (one CTA uses the `GH-XXXXXX` code → 404s; another drops the `?k=` token).
   This file is **another session's uncommitted work** (present in this session's
   git baseline), so per the shared-checkout rule it was left untouched. **It
   must be fixed by that session or excluded from any commit/deploy** — restore
   its `bookingManageUrl(locale, idempotencyKey)` CTAs.
2. **Arabic font preload trade** (`lib/fonts.ts`): `preload:false` on IBM Plex
   Arabic removes the preload on _Arabic_ pages too (next/font emits preloads
   per module, not per locale). Net win for EN pages; a small FOUT for the
   Arabic-first launch market. Left as the documented, typecheck-safe option;
   flip it or split per-locale layout modules if the owner prefers.

A handful of low-value NITs from the audit were consciously skipped (e.g.
removing now-orphaned `getAllSlugs`/`getAllHostSlugs` exports in a
concurrently-edited query file). The `closedDatesEffective` strike-through
covers only the latest of two consecutive different-date rejections — accepted,
since it can never double-book.

## Verdict

The booking engine itself is in unusually good shape — the capacity gate is
genuinely race-proof (`SELECT … FOR UPDATE` re-sum), idempotency is minted and
replayed correctly, timezone handling is Riyadh-correct end to end, the policy
snapshot drives honest per-date cancellation copy, and auth never interrupts
the funnel. The two locales are near-parity and digits/RTL discipline is real.

The problems cluster at the **edges of the flow**, and the worst ones are in
the **post-booking loop**, where two P0 regressions actively strand guests
today: every emailed CTA lost its signed `?k=` token (so approval/pay/review
links dead-end on a sign-in wall for exactly the guests they were sent to), and
manual bank-transfer refunds for host/admin cancellations never collect the
guest's IBAN — the money is queued with nowhere to go while the copy claims
it's "on its way". Below those, the recurring themes are: **honesty gaps at
state edges** (completed bookings shown as "request received", card-refund copy
on the bank rail, stale capacity after a race), **conversion-critical content
gated on hydration** (booking panel, pay-page header SSR at opacity 0),
**trust-surface hygiene** (uncurated homepage testimonials, full guest names on
reviews, exact host coordinates public), **Arabic-first gaps in an
Arabic-first product** (search can't match the place/host names the UI
displays, broken duration plurals on every card, the +1 type-step missing from
transactional prose), and a **photo content gap** (one photo per listing) that
no code fix can compensate for on a premium brand.

## Scorecard by stage

| Stage                         | Grade | One-line assessment                                                                                              |
| ----------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------- |
| Homepage                      | B     | Strong narrative + clean hero; motion/CLS violations, social proof uncurated and buried                          |
| Discovery (/experiences)      | C+    | URL-driven filter architecture done right; Arabic search misses displayed names, sorting/skeleton/card-chip gaps |
| Experience detail             | B+    | Playbook-complete page; photo gap, meeting-point privacy, rail overload                                          |
| Date & party selection        | A−    | Race-proof engine, honest cutoff copy; feedback gaps when things go wrong                                        |
| Checkout & payment            | B     | Correct settlement model; mada last, missing price math, blocking receipt email                                  |
| Confirmation & post-booking   | D     | Two P0 regressions + wrong-state headers undermine an otherwise complete surface                                 |
| Cross-cutting mobile/RTL/a11y | B     | Real RTL/digit discipline; language switcher data loss, focus/a11y regressions on payment                        |
| Performance & resilience      | B−    | Good wave discipline on detail; checkout waterfalls + unbounded queries on money pages                           |

---

## P0 — actively breaking the journey (2)

### P0-1 · Every emailed booking link lost its signed `?k=` token — CTAs dead-end on the sign-in wall

`features/bookings/lib/booking-email.ts:267,580-586,680,827,976,1126,1157,1837`

`link-token.ts` exists precisely because notification links open in browsers
with no last-booking cookie (WhatsApp in-app jar, second device), and its
docstring mandates: _"Use for every link we send the guest (email, WhatsApp,
.ics bodies)."_ The marketing-remediation commit (a0a7b02) replaced every
tokened helper call in `booking-email.ts` with bare
`${SITE_URL}/${locale}/book/confirmed/${reference}` URLs — receipt/invoice,
cancellation CTA, reschedule CTA, both reminders, the approved-request **pay
link**, payment-failed retry, the review invite, and the `.ics` body. WhatsApp
buttons (`lib/notifications/whatsapp/links.ts`) still use the tokened helpers;
only email regressed. Verified directly: every URL in the file is bare.

Consequence: a guest opening the approval email on any browser without the
cookie — other device, cleared cookies, or **any guest with 2+ bookings** (the
cookie holds only the last one) — hits "Sign in to see this booking" instead of
the pay page. The pay page explicitly depends on the token
(`checkoutViewerCanAccess`). This blocks payment completion, invoice access,
and review submission from email, silently, at scale.

**Fix (S):** restore `bookingManageUrl` / `bookingInvoiceUrl` / `bookingPayUrl`
for every guest-facing URL in `booking-email.ts` (including `#review` after the
token query and the `.ics` description). Add a test that greps rendered email
HTML for `?k=` on every guest CTA so a refactor can't strip it again.

### P0-2 · Manual bank-transfer refunds dead-end for host/admin/dispute cancellations

`features/bookings/lib/booking-email.ts:575` + `features/bookings/refund-bank-actions.ts:77` + `lib/notifications/whatsapp/templates/guest.ts:644`

With `refunds_via_bank_transfer` ON (the default), only the **guest's own**
cancel form collects bank details. When the **host or admin** cancels a paid
booking, `refundDueSar` is queued with no payee, and three gaps strand the
money: (1) the cancellation notification never asks for bank details — the
WhatsApp copy says _"Your full refund is on its way — our team processes it by
hand"_ / _"We've started refunding {amount}"_, both false while nothing can
start; (2) the email CTA and WhatsApp button route to the **invoice** page, not
the booking page where `RefundBankDetailsForm` lives; (3) even a guest who
reaches the booking page via the tokened link cannot submit the form —
`submitRefundBankDetails` requires cookie/session (`bookingViewerCanAccess`;
the token is read-only by design) and answers _"We couldn't find that
booking."_ The refund sits owed until the guest independently signs in with
email or contacts support.

**Fix (M):** on queueing a refund with no payee: send a dedicated "where should
we send your refund?" message whose CTA is the tokened **booking** page; change
the refund-pending copy to honest ("we need your bank details to send it");
and either admit bank-details submission to the token-authorized action set
(it only directs the guest's own money, analogous to checkout) or render a
sign-in prompt instead of a doomed form for token-only viewers.

---

## P1 — materially hurts conversion, trust, or access (10)

### P1-1 · Completed bookings render the "Request received — you won't be charged unless they accept" header

`app/[locale]/book/confirmed/[ref]/page.tsx:375`

The ~10-state header chain has no `completed` branch; `isConfirmed` is strictly
`status === 'confirmed'`, so a completed booking falls through to the default
request copy, and "What happens next" shows the pre-approval steps. This is the
exact page the day-after review invite deep-links (`#review`): the guest
arrives to rate their finished, paid experience under a header claiming it's an
unconfirmed request. **Fix (S):** add a completed branch (eyebrow, thanks,
point at review + invoice; suppress next-steps).

### P1-2 · Token-only viewers (every WhatsApp tap) see cancel/reschedule/review/report forms that always fail with misleading errors

`app/[locale]/book/confirmed/[ref]/page.tsx:930,1047,1113,1202,1269`

The `?k=` token authorizes reads only, but the page renders every mutating
control regardless of which proof admitted the viewer. All those actions
require cookie/session and return anti-probing shapes: the guest's own booking
answers _"We couldn't find that booking"_ (cancel/reschedule) or _"This booking
belongs to a different account"_ (review). Worst case: the WhatsApp review
invite opens the composer, the guest writes a paragraph, taps submit — and the
review is lost with an accusatory error. Only `RefundToCardButton` handles this
correctly (explicit owner check + sign-in hint). **Fix (M):** have
`getBookingViewForViewer` report which proof passed; for token-only viewers
replace mutating forms with a one-line "Sign in with the email you booked with
to cancel / change / review" prompt, mirroring the RefundToCard pattern.

### P1-3 · Refund copy claims "refunded to your card" on the manual bank-transfer rail (the default)

`app/[locale]/book/confirmed/[ref]/page.tsx:395` + email `cancelIntro*` keys

When the admin records the wire, the page and the email both say the money went
"to the card used" — minutes after the guest typed their IBAN into the cancel
form, and contradicting the on-page confirmation ("Our team will transfer your
refund to the bank account you entered"). Guests will watch the wrong statement
for their money. **Fix (S):** branch terminal copy on `booking.refundMethod`
(already exposed on `BookingDetail`): `'manual'` → bank-account copy,
`'gateway'` → card copy; same in `sendBookingCancellationEmail`.

### P1-4 · Reviews publish the guest's full booking name, undisclosed

`features/reviews/queries.ts:42` + `features/reviews/components/review-card.tsx:35`

The full name typed into the booking form renders verbatim on public reviews;
the review form gives no display-name choice and no notice. First name +
initial is table stakes (Airbnb/Booking); publicly attaching a woman's full
name to a review on a **women-only** experience is a serious cultural/privacy
exposure in the launch market and will suppress the platform's only
social-proof engine. **Fix (S):** truncate at render (first name + initial) in
both locales; add "Posted publicly as {firstName}" to the form. Keep the full
name in the DB for support.

**Live-site corollary (same family):** the homepage "From our guests" strip
auto-surfaces the latest high-rated reviews with zero curation gate — today it
shows a review by "Aziz Al-Asmari" (the owner's own name, with a 🙏❤️ emoji)
**on the women-only experience**, reading as a male guest on a women-only
product and/or self-review. Add a `featured` curation flag (admin-set) or at
minimum exclude `women_only` reviews and emoji-heavy text from the homepage
strip.

### P1-5 · Capacity-race rejection (`date_full`) is invisible from the submit point — dead tap on mobile

`features/bookings/components/booking-request-form.tsx:441-453,470-509` + `features/bookings/actions.ts:771-777`

When the slot fills between selection and submit, the only feedback renders
under the calendar, one-to-two viewports above the submit/sticky bar; the
form-level message chain doesn't map `date_full`, and the scroll-to-error
effect skips the hidden date input, so sighted mobile users see nothing happen.
Every other date rejection gets both the alert and the scroll; the race case —
the likeliest to hit a real guest at the scarcest moment — escapes both.
Verified adversarially. **Fix (S):** map `date_full` into `formMessage` and/or
scroll the calendar into view when the only error field is `preferredDate`.

### P1-6 · Language switcher drops all query params — kills signed booking links and resets catalog state

`components/layout/language-switcher.tsx:24-26`

next-intl's `usePathname` excludes the query string, so the always-visible
locale toggle strips `?k=` (turning a guest's own paid booking into the sign-in
wall — unrecoverable for an anonymous phone-only guest except by re-opening the
original message), resets every catalog filter, and loses the pay-step
`date/party` carry-back. Arabic-first market with bilingual households makes
mid-journey switching a real path. **Fix (S):** preserve `useSearchParams()` in
the switcher's href.

### P1-7 · Six public-path queries on money/high-traffic pages bypass `boundedQuery` — a poisoned-pool hang stalls the render until the function timeout

`features/payments/queries.ts:31`, `features/wallet/ledger.ts:31`, `features/wallet/queries.ts:24`, `lib/marketing/referral.ts:47`, `features/disputes/queries.ts:126`, `features/reviews/queries.ts:284`

`lib/deadline.ts` exists because a hung pooled connection never rejects —
try/catch can't fire. Unbounded on the pay/confirmed pages:
`getStoredBillingForBooking`, `getWalletBalanceSar` (no catch at its pay-page
call site either — a transient error 500s the whole payment page for a
decorative line), `getSessionGuestId`, `ensureReferralCode` (an UPDATE inside a
GET render), `hasOpenDisputeForBooking`; and on the homepage,
`getRecentReviews` (strands the social-proof Suspense boundary and holds the
stream open). Verified adversarially. **Fix (S):** wrap each in `boundedQuery`
per the sibling convention; degrade wallet to 0 on error; move the referral
mint into `after()`.

### P1-8 · Rotating hero headline animates `width` — layout shifts under the primary CTA for ~14s

`components/marketing/hero-headline.tsx:139-142`

The rotating slot animates `width` so the sentence reflows — scripted per-frame
layout movement on the highest-traffic page, directly against BRIEF §3
("transform/opacity only — never layout properties") and the CLS < 0.05
budget; when the width change rewraps the 2–3-line display-size H1, the intro
and "Explore Aseer" CTA shift vertically mid-reach. **Fix (M):** fix the slot
to the widest measured word (the measurement code already knows all widths) and
swap words in place with the existing y/opacity transition. (Verifier note: if
the per-word width spring is considered essential brand craft, it needs an
explicit owner exception to the brief.)

### P1-9 · Arabic search cannot match place or host names as displayed, and has no orthography folding

`features/experiences/lib/search.ts:230-239`

`matchesQuery` builds its haystack from `titleEn, titleAr, placeName, hostName`
— but placeName/hostName are the **English** DB strings ("Jabal Sawda",
"Abdulaziz Alasmari"), while the Arabic UI displays them via `toArabicText()`
("جبل السودة", "عبدالعزيز الأسمري") and the AR placeholder promises "ابحث
بالاسم أو المكان". Typing exactly what the card shows returns zero results.
There is also no hamza/ta-marbuta/alef folding, so the common lazy spelling
"ابها" fails against "أبها". For an Arabic-first market this breaks the
advertised search contract on the primary audience's input. Verified
adversarially. **Fix (M):** add `toArabicText(placeName/hostName)` to the
haystack and normalize both sides (strip diacritics/tatweel, fold أ/إ/آ→ا,
ة→ه, ى→ي) — ~10 lines, no Meilisearch needed yet.

### P1-10 · Reduced-motion users get a permanently visible, dead sticky Book bar on mobile

`features/bookings/components/booking-request-form.tsx:996`

`animate={{ y: reduce ? 0 : stickyBarVisible ? 0 : '110%' }}` — under
`prefers-reduced-motion` the fixed bottom bar never retracts. When the inline
submit scrolls into view the bar gains `inert` + `pointer-events-none` while
staying fully visible: a live-looking "Book now" bar whose taps pass through to
whatever sits underneath, permanently occluding ~72px of every detail page
(including the area over the real submit and footer). The primary mobile
conversion control breaks for exactly the users the brief's reduced-motion
mandate protects. Confirmed by two independent verifiers. **Fix (S):** keep
position toggling in both modes and disable only the spring:
`animate={{ y: stickyBarVisible ? 0 : '110%' }}` with
`transition={reduce ? { duration: 0 } : SPRING}`.

---

## P2 — clear improvements, moderate impact

### Trust & honesty at decision points

- **Booking-form mode note uses confirmed green for request-to-book**
  (`booking-request-form.tsx:604`): BRIEF §3 mandates pending is _"never the
  confirmed green"_ — render the request-mode note on the pending
  (saffron) or info surface. _(S)_
- **Preselected date defaults to today inside the non-refundable window; the
  mobile sticky CTA can submit it unseen**
  (`booking-request-form.tsx:388,1026`): the calendar auto-selects
  `availableDates[0]` (live check: today, with the "payment won't be
  refundable" note shown only in the panel), and for returning guests the
  ever-visible sticky bar submits directly — a one-tap commitment to a date the
  calendar never showed them. Make the bar's first activation scroll to the
  calendar unless the guest explicitly picked a date. _(M)_
- **After `date_full`, the calendar keeps offering the full date with a stale
  "Available on this date" hint** (`booking-request-form.tsx:629`): no
  `router.refresh()` on any failure path; guest can loop. _(S)_
- **Capacity ceiling unexplained between 5 and maxGroupSize, and party size
  silently clamps on date change** (`booking-request-form.tsx:395` +
  `page.tsx:348`): three disagreeing signals; a group can submit for fewer
  people than intended with no notice. _(M)_
- **Calendar can't distinguish sold-out / doesn't-run / cutoff — one
  undifferentiated gray** (`booking-calendar.tsx:294-343`): kills the scarcity
  story and makes the host's schedule illegible; add per-day status +
  strikethrough for full days + reason in the aria-label. _(M)_
- **"Change date or guests" from the pay step strands the old 30-minute hold**
  (`pay/page.tsx:509-518`): double capacity block, burns the 3-hold phone cap
  on the guest's own edits, and leaves multiple live pay links for different
  dates. Cancel the superseded hold when the replacement is created. _(M)_
- **Contact channels accepted with zero verification or typo-guard**
  (`features/bookings/actions.ts:286` area): every lifecycle notification goes
  to unverified email/phone; one typo orphans the booking (host loses the
  sale) and sends the guest's name + meeting point to a stranger's WhatsApp.
  Add a confirmation-page "we sent it to X — didn't get it?" corrector and/or a
  delivery-failure surface. _(M)_
- **Exact meeting-point coordinates public before booking**
  (`meeting-point-map.tsx:32`): publishes hosts' home locations
  (majlis/cooking/art categories) and hands disintermediation the full
  meet-here info. Show approximate area pre-booking; the precise pin already
  lives post-confirmation. _(M)_
- **Full decrypted IBAN echoed to anyone holding the read-only booking link**
  (`features/bookings/queries.ts:130`): a forwarded WhatsApp link now leaks
  bank name + beneficiary + full IBAN. Mask at render (`SA•• …34`), require
  re-entry to change. _(S)_
- **`/pay/return` mints a booking access token for anyone holding the bare
  reference UUID** (`pay/return/route.ts:35`): inconsistent with the
  everywhere-else rule that the reference alone must not grant access. Bind the
  mint to a genuine just-settled window or carry `?k=` through
  `shopperResultUrl`. _(M)_

### Checkout & payment

- **mada renders last in the accepted-methods row** (`payment-marks.tsx:110`):
  BRIEF §5 is mada-first and the widget honors it; the visual row is the one
  surface that contradicts it, at the moment a mada holder scans for their
  scheme. Reorder (or add an order prop for checkout). _(S)_
- **No `price × party` line in the pay-step summary** (`pay/page.tsx:400-412`):
  pay-after-approval guests arrive a day later from WhatsApp and can't verify
  the total is arithmetic. Always show unit × count first. _(M)_
- **Wallet credit silently caps at total − 1 SAR** (`checkout-actions.ts:158`):
  a guest with SAR 500 credit on a SAR 480 booking sees "−479" unexplained,
  then completes full card + 3DS for 1 riyal. State the cap up front. _(S)_
- **Clickwrap/policy links navigate in-tab and destroy the filled form** —
  both the booking form (`experiences/[slug]/page.tsx:448-464`) and checkout
  (`pay/page.tsx:180-196`): reading what you're agreeing to costs the whole
  form (bfcache is least reliable in exactly the WhatsApp in-app browser).
  `target="_blank"` or a Sheet. _(S)_
- **Post-3DS redirect blocked on rendering + sending the receipt email**
  (`pay/return/route.ts:74`): the guest stares at a blank inter-gateway page
  while a PDF renders and Resend round-trips; move into `after()` (already the
  codebase pattern). _(S)_

### Detail page & structure

- **Desktop booking rail is a 9-field form with nested internal scrolling; the
  CTA hides below the panel fold on 1366×768**
  (`experiences/[slug]/page.tsx:909`): slim the rail toward
  date/guests/total/CTA; collect identity on the next step. _(L)_
- **`#reviews` anchor lands under the sticky navbar**
  (`reviews-section.tsx:66`): add `scroll-mt-20`. _(S)_
- **Host-written paragraphs collapse into a wall of text on the guest page**
  (`experiences/[slug]/page.tsx:738,750` + `host-card.tsx:73`): descriptions up
  to 4,000 chars render without `whitespace-pre-line`, so every newline the
  host typed collapses — while the host dashboard and admin moderation views
  render the identical text with `whitespace-pre-line`. The host approves
  paragraphs; the guest gets a slab. Long prose is the primary selling surface
  while photos are thin. _(S)_
- **Host/admin-authored place, city, and moment-time strings render in English
  on Arabic pages** (`experiences/[slug]/page.tsx:358,789` +
  `lib/arabic-content.ts`): the ~50-entry seed dictionary silently falls back;
  the `cities.nameAr` registry exists and is unused here; `moments.timeOfDay`
  is monolingual. Join the registry + add `placeNameAr`/`timeOfDayAr` to the
  host flow. _(M)_
- **Photo depth**: every listing currently has exactly **one** photo (live
  check: lightbox "1 / 1"; the desktop mosaic needs 5+ and never shows). The
  zero-photo code path also degrades badly (bare `bg-mist-deep` rectangle on
  detail — `photo-gallery.tsx:160`; dead non-clickable placeholder block on
  cards, near-invisible on dark Originals cards — `experience-card.tsx:143`).
  Content: schedule the 5-photo shoots (photography is the brand's stated
  co-creation promise). Code: category-tinted, linkable placeholders as the
  degrade. _(M + content)_

### Cross-cutting & performance

- **Conversion-critical content SSRs at opacity 0 via `MountFade eager`** —
  the detail page's entire booking panel (`experiences/[slug]/page.tsx:910`),
  the pay page's `CheckoutProgress` + `h1` + deadline note
  (`pay/page.tsx:318-357`, typically an initial load from a WhatsApp link, so
  the static-branch never saves it), and the homepage hero intro + primary CTA
  (`page.tsx:188-201`): invisible until hydration on mid-range Android/4G — the
  launch market's normal device — and permanently invisible without JS.
  Verifier downgraded from P1 on fast-connection grounds, but it directly
  fights the brief's FCP < 1.0s-on-4G budget. Switch to transform-only `RiseIn`
  or render static. _(S)_
- **Arabic +1 type-step applied only on marketing surfaces**
  (`experiences/[slug]/page.tsx:738,750`, `pay/page.tsx:341`,
  `confirmed/[ref]/page.tsx:715`): the prose guests read to transact renders at
  English sizes while marketing copy gets the bump — the brief's rule,
  inverted. Centralize a `.prose-body` utility. _(M)_
- **Sequential DB waterfalls on pay (~6 serial reads) and confirmed (~7+)
  pages** (`pay/page.tsx:89-292`, `confirmed/[ref]/page.tsx:157-602`): the
  detail page documents waves-of-≤4; the money pages chain awaits. Group into
  waves. _(M)_
- **Detail page has zero Suspense boundaries** — reviews + related + wishlist
  reads block first byte on the journey's most important page; in-page Suspense
  below the `notFound()` decision is fully compatible with the deliberate
  no-loading.tsx rule (status commits before fallbacks flush). _(M)_
- **Filter sheet's sticky Apply bar sits on the iOS home indicator**
  (`filter-sheet.tsx:180` / `sheet.tsx:74`): the booking bar solved this with
  `pb-[max(...,env(safe-area-inset-bottom))]`; the shared Sheet didn't inherit
  it. Note `viewport-fit=cover` is also missing app-wide
  (`app/[locale]/layout.tsx:88`), so every `env(safe-area-inset-*)` currently
  evaluates to 0 — inert plumbing that will bite in the installed standalone
  app. _(S)_
- **Review-star rating: invisible keyboard focus + ~36px targets**
  (`review-form.tsx:87-110`): the sr-only radio holds the focus ring; the
  visible star shows nothing (WCAG 2.4.7 on a required control). _(S)_
- **Wallet sign-in hint tells guests to sign in with their phone — a route
  that no longer grants access post-2026-08-21** (`confirmed/[ref]/page.tsx:978`):
  align with the updated email-evidence copy. _(S)_
- **Review submit redirects to `/me`, losing context and often showing no
  confirmation** (`features/reviews/actions.ts:156,232`): render the thank-you
  state in place (the page already knows how) + revalidate. _(S)_

---

## P3 — polish and hygiene (selected)

**Copy & i18n**

- Arabic payment-pending copy reads "this page _talks_ automatically"
  (`تتحدّث` → `تُحدَّث`) — at the tensest moment of the journey (`messages/ar.json`).
- Request-mode hint promises the host confirms "the exact start time" that the
  page states as fixed, twice (`bookingRequest.preferredDateHint`, both locales).
- Reviews namespace mixes تقييم and مراجعة one line apart (`reviews.showAll`).
- Full-refund cancel confirm never states amount or destination while the
  partial branch does (`cancel.confirm`).
- Lapsed-hold copy says "nothing was charged" while applied wallet credit is
  still out for up to an hour (`holdLapsedDescription`).
- IP-throttled guests are told they have "too many open bookings" they don't
  have (`actions.ts:540-552`) — distinct copy for the IP branch.
- Guest WhatsApp templates ship ✨🤍📅💳 emoji against the locked no-emoji brand
  decision (`whatsapp/templates/guest.ts:585,263`) — confirm with owner or strip
  in an additive v4 wave.
- **Content bug (live):** flower-men "What to bring" lists **"A set of
  Lights"** — nonsense on the flagship Original; fix the row (likely meant a
  flashlight/torch).
- Arabic eyebrows stay at 11px against the +1-step rule (4 call sites).

**Interaction & a11y**

- Guest stepper drops rapid taps — non-functional `setPartySize(effectiveParty + 1)`
  (`booking-request-form.tsx:671,687`); reproduced live (2 taps → 2 guests).
  Use functional updaters.
- Party stepper is the only input up to maxGroupSize 50 (49 taps); total not in
  an aria-live region.
- Payment-method toggle: `role=radio` without the radio keyboard contract, 40px
  tall (`payment-details-form.tsx:484-518`).
- Payment field errors not linked via `aria-describedby`
  (`payment-details-form.tsx:415-438`) — the booking form one step earlier does
  this correctly.
- Focus dropped when the details form swaps to the payment widget
  (`payment-details-form.tsx:327`); move focus to the pay heading.
- Deadline countdown reaches zero without changing page state
  (`payment-deadline-note.tsx:43`).
- Star-rating rows use `aria-label` on generic elements (ignored by most AT) in
  social-proof strip, review card, and experience card — use `role="img"`.
- Reschedule section vanishes silently once used/expired
  (`confirmed/[ref]/page.tsx:1189`) — state why instead.
- Discount/credit minus sign renders on the wrong side in Arabic
  (`pay/page.tsx:420-431`) — move the sign inside the LTR isolate.
- Price-filter remove button's aria-label falls back to the raw English key
  (`active-filters.tsx:81`).
- PhotoGallery lightbox is the one hand-rolled modal outside Base UI and has no
  swipe on touch (`photo-gallery.tsx:272`).
- Confirmation review section skips h1 → h3 (`confirmed/[ref]/page.tsx:1050`).
- Duplicate category tiles visible for reduced-motion/no-JS users
  (`category-tiles.tsx:183`).
- Refund-bank forms are the only journey forms relying on **native browser
  validation** (`refund-bank-fields.tsx:54` + `cancel-booking-button.tsx:145`
  `reportValidity()`): empty-IBAN submits show the browser's own bubble in the
  _browser's_ language — English bubbles on an Arabic UI at the money-critical
  step. Add `noValidate` + the shared zod check like the booking form.
- Wishlist has no nav entry point or post-save affordance: hearts everywhere,
  but the only route to /wishlist is the footer's collapsed Account accordion,
  and saving fires no toast (`navbar.tsx:56`, ToastProvider already mounted).
- Every gallery tile/slide is announced identically as "View photos"
  (`photo-gallery.tsx:222,244`) — reuse the localized "photo {n} of {m}"
  template.
- Arabic count grammar: "حتى {count} ضيفاً" is wrong for 3–10 guests
  (`experienceDetail.groupSizeUpTo`, `bookingRequest.partySizeHint`) —
  neighbouring keys already use full ICU plurals.
- "Apply credit" is a full-width primary button that outranks the checkout CTA
  on mobile (`wallet-checkout-field.tsx:43`) — demote to secondary.
- Signed-out guests with wallet credit get no hint credit exists at checkout
  (`pay/page.tsx:118`) — add a neutral sign-in line.

**Homepage structure & SEO**

- Social proof sits ~5–6 viewports deep, below both brand-story bands — move
  adjacent to the catalog.
- Hosts row is uncapped while the catalog is deliberately capped at 6 — cap +
  "Meet all hosts".
- Search pill drops the guest at the top of the catalog instead of into the
  search field — carry a focus intent.
- Homepage JSON-LD omits ItemList of rendered experiences + SearchAction;
  detail JSON-LD omits Review items and x-default hreflang (its own sitemap
  advertises x-default).
- A transient availability-query failure renders as a definitive 8-week
  sell-out and flips JSON-LD to SoldOut (`experiences/[slug]/page.tsx:320,563`).
- `getPlatformSettings` is neither `React.cache()`-deduped nor cached — every
  guest page pays the query at least twice (page body + footer) against the
  5-connection pool the wave discipline budgets (`lib/platform-settings.ts:88`).
- Both font families preload on every page regardless of locale
  (`lib/fonts.ts:19`): an EN page preloads ~134KB of IBM Plex Arabic as
  high-priority requests competing with the LCP image — against the
  FCP < 1.0s-on-4G budget. Preload only the active locale's primary face.
- framer-motion ships its full bundle (~30-40KB gz) in the first-load JS of
  every route via `MotionProvider`, though the initial document renders every
  primitive static by design — adopt `LazyMotion`/`domAnimation` in
  `motion.tsx` (all call sites already funnel through it).
- The detail page spends a fifth serial round trip on an inline
  `(await getWishlistSet()).has(...)` in JSX (`[slug]/page.tsx:632`) — move it
  into the wave-2 `Promise.all`.
- `robots.txt` blocks `book/confirmed/` but not `book/[reference]/pay`.
- `generateStaticParams` on the detail page does build-time DB work that
  force-dynamic never uses (a residual build-failure surface).
- Recent-reviews query bypasses the TODO(ar) placeholder guard; detail
  title/description/story bypass `pickLocalized` similarly.
- No pre-booking way to ask the host a question — route a modest "Questions?
  WhatsApp us" link through the existing support line. _(product gap)_
- `HeroRidgeline` is dead code (~6KB source, no importer).

---

## Discovery (/experiences) — detail

The architecture is right: all filter state is URL query params (deep-linkable,
no history spam), the sheet's live "Show N" count shares the exact
`matchesCriteria` predicate with the server so counts can't drift, an aria-live
result count doubles as the SR status line, and filtered views canonicalize
correctly with ItemList JSON-LD. Beyond P1-9 (Arabic search) and the latent
photo-less card degrade, the P2s:

- **Sorting excludes Originals from the ranked grid**
  (`(catalog)/page.tsx:91-99,140`): `showFeatured` checks every criterion
  except `sort`, so "Price: low to high" keeps the Featured row pinned and
  strips featured slugs from the sorted grid — if an Original is the cheapest
  match it simply isn't in the ranked list, while the rail's count still counts
  it. Collapse the featured row when a non-default sort is active. _(S)_
- **Arabic duration grammar is wrong on every card** —
  `{durationHours} {t('hours')}` with singular "ساعة" renders "3 ساعة",
  "4 ساعات" needed for 3–10 (`experience-card.tsx:211`): visibly broken Arabic
  on the Arabic-first surface; the filter sheet's own duration labels get it
  right. Convert to an ICU plural (incl. "ساعتان", the 1.5h case). _(S)_
- **Card badge row can't wrap — chips clip at 375px**
  (`experience-card.tsx:149` + Card `overflow-hidden`): "FOOD & COFFEE" +
  "Request to book" + "New" exceeds the ~279px column, silently clipping the
  trust/conversion chips in both locales. Add `flex-wrap gap-y-1`. _(S)_
- **Catalog loading skeleton doesn't match the real layout**
  (`(catalog)/loading.tsx:12-36`): text-only `min-h-64` cards with no media
  block, different hero padding (py-20 vs py-12 on mobile), no search/rail —
  the reveal reflows the viewport against the CLS budget. Ironically
  `experience-card-skeleton.tsx` exists because "hand-rolled skeletons had
  drifted" — and this loading file doesn't use it. _(S)_
- **On mobile, search and filters sit ~2 screens below the Featured block**
  (`(catalog)/page.tsx:200-246`): the featured row renders exactly on the
  default landing state, so a first-time mobile guest scrolls ~1000px+ of
  featured cards before discovering search/filter exists; the rail is only
  sticky after being reached. Put a compact search+filters entry above the
  featured block on mobile. _(M)_
- **Search box desyncs from the URL after "Reset/Clear filters"**
  (`search-input.tsx:34`): local state initializes once; the rail's reset and
  the empty-state link clear `?q=` via client nav, leaving a stale failing
  query visible over full-grid results, with no removable `q` token to
  disambiguate. Sync on URL change. _(S)_

P3: EN filter pills use the Riyal glyph while prices use "SAR" (one journey,
two marks); grid gutters differ between the catalog (`gap-4`) and the /abha +
category landings (`gap-6`); /abha renders no message when the city has zero
live experiences (category landings have one); the filter-sheet footer
safe-area gap is covered under Cross-cutting above.

---

## What's already strong (don't break it)

- The **booking creation path** is race-proof (`FOR UPDATE` re-sum), idempotent
  (client-minted UUID, re-minted on bfcache restore, unique-constraint
  backstop), throttled with an escape hatch, and never gates on auth.
- **Riyadh-clock correctness** end to end: the classic UTC-shift calendar bugs
  are absent; cutoffs evaluate against wall-clock.
- **Policy honesty machinery**: per-date cancellation deadlines projected from
  the snapshot into the calendar hint; the "starts soon → non-refundable"
  warning updates live as the date changes (verified in the browser).
- **Settlement model**: server-side verification against HyperPay, never the
  redirect; 25-min checkout reuse; widget teardown on superseded totals.
- **Locale discipline**: dir=rtl, Latin digits everywhere (verified live), ص/م
  times, fluent Arabic policy copy, mirrored calendar arrows, x-default→ar on
  most surfaces.
- **Hero LCP contract** on the H1 itself (SSR visible, transform-only,
  aria-hidden rotation with sr-only canonical text, rotation stops after one
  cycle per WCAG 2.2.2).
- **Calendar a11y**: ARIA-grid with roving tabindex, descriptive day labels,
  correctly aria-disabled non-running days (verified live).
- Skip link, global focus-visible ring, Base UI overlays, `after()` for
  side-effects — the conventions exist and are mostly followed; most findings
  above are deviations from the codebase's own good patterns.

## Suggested fix order

1. **Same day:** P0-1 (restore tokened email links + grep test), P0-2a
   (honest refund-pending copy + CTA → booking page), P1-3 (refund copy rail
   branch), P1-1 (completed header).
2. **This week:** P0-2b (token-authorized bank-details or sign-in prompt),
   P1-2 (proof-aware booking page), P1-4 (review display names + homepage strip
   curation), P1-5 (`date_full` visibility), P1-6 (language switcher params),
   P1-7 (boundedQuery sweep), P1-10 (reduced-motion sticky bar — one line),
   Arabic duration plural, `whitespace-pre-line`, mada order, wallet cap copy,
   clickwrap target=\_blank, receipt email → `after()`.
3. **Next:** P1-8 (hero width animation), P1-9 (Arabic search folding),
   sticky-bar first-tap-scrolls, calendar day-status model, hold-superseding
   edit flow, price × party on pay, MountFade → RiseIn on conversion surfaces,
   Arabic type-step centralization, waterfall waves + detail Suspense, sorting
   vs Originals, catalog skeleton, badge-row wrap, mobile filter placement.
4. **Content (non-code):** 5-photo shoots per listing, fix "A set of Lights",
   curate homepage testimonials, decide the WhatsApp emoji question.
