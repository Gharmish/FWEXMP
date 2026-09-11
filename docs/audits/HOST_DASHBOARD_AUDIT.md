# Host dashboard — UX + engineering audit

**Date:** 2026-08-22 · **Scope:** `/host` (overview), `/host/bookings`, `/host/earnings`, `/host/reviews`, `/host/profile`, `/host/experiences` (index only), the `HostShell`/`HostNav` chrome, and `features/host-*` queries/actions · **Lens:** Airbnb host-app standard (senior eng + product design)

**Remediation status (2026-08-22, same day):** every P1, P2 and P3 below was fixed in the commit that carries this file — Today overview, mobile tab bar + badge, request decision context (seats / cutoff / guest note), `host` cancellation kind with reason, cached host resolver, booking detail page, action outcome notices, Open/Past/Calendar views, earnings ledger scope + pagination, reviews unreplied-first + 24h reply edit, help link, editable contact details, touch targets, `pickLocalized` everywhere. **Follow-up (2026-08-23):** the two pieces deferred on the day — per-channel notification toggles and verification of a changed contact phone — shipped in the next commit: channel + category toggles on `/host/profile` (enforced in the host-contact resolvers, critical account notices exempt), Twilio Verify over WhatsApp for a new number with the old one kept live until the code checks out, a change notice to the previous address, an audit row, and admin visibility of all of it.

The listing create/edit flow was audited separately today in [HOST_LISTING_AUDIT.md](HOST_LISTING_AUDIT.md); this document doesn't repeat those findings.

Severity: **P0** integrity/blocker · **P1** loses bookings, money, or trust — fix before inviting more hosts · **P2** quality · **P3** polish.

Verified against the local dev server signed in as the live host (3 live listings, 1 upcoming, 45 past bookings) at 1280px and 375px, EN and AR.

---

## Scorecard

| Area                          | Score | One-liner                                                                                                                                          |
| ----------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data integrity & auth         | 8/10  | Ownership scoping, PII gating, SLA expiry and capacity re-checks are all right; host cancellations are mis-stamped as `operator`                   |
| Overview ("home")             | 4/10  | A long summary page, not a "today" surface: 4.6 viewports on mobile, duplicates two other pages, shows onboarding steps to a host with 45 bookings |
| Bookings — acting on requests | 5/10  | Accept/Decline with countdown is solid; no decision context (seats left, guest note), no detail page, no mobile badge                              |
| Bookings — reading the list   | 5/10  | Three stacked buckets; Past renders 50 rows inline (11,000px on a phone); no calendar/week view                                                    |
| Earnings                      | 7/10  | Riyal-accurate ledger + statements + CSV; the all-time/filtered split is unlabeled, 200-row cap is silent                                          |
| Reviews                       | 6/10  | Clean, reply works; no "needs reply" ordering, no pagination, no edit                                                                              |
| Profile                       | 8/10  | Right scope; contact phone/email never editable                                                                                                    |
| Chrome / navigation           | 6/10  | Rail is brand-faithful; mobile hides the only time-critical signal (pending requests) behind the hamburger                                         |
| Performance                   | 5/10  | Every host query re-resolves user → host row; overview is ~14 DB round trips in two-deep chains (2.1–4.4 s app time locally)                       |
| Accessibility & RTL           | 7/10  | RTL is clean (LTR isolation on phone/time/ref); five 20px-tall links on mobile, section counts glued to headings                                   |

---

## What's already good (don't regress)

- Every host read resolves the host from the session (`hosts.userId`), never from a URL param; foreign bookings answer `not_found`, not `forbidden` ([host-bookings/actions.ts:13](features/host-bookings/actions.ts:13)).
- Guest phone is withheld until the booking is confirmed/completed — declined guests never leak contact details ([host-bookings/queries.ts:28](features/host-bookings/queries.ts:28)).
- Accept re-locks the experience row and re-sums capacity; a lapsed approval window expires the request instead of approving it ([transition-executor.ts:170](features/bookings/lib/transition-executor.ts:170)).
- Host can't approve inside the booking cutoff (`too_late`), can't complete a future-dated booking, can't withdraw a request (`cancelled` filtered for `pending`).
- `SlaCountdown` shares one 30s clock across every chip and renders nothing server-side, with the absolute "Respond by" as the no-JS fallback.
- Bookings filters are a GET form — the URL is the state; `q` escapes LIKE wildcards; `experienceId` is UUID-validated.
- Earnings math mirrors admin payouts to the riyal (snapshotted commission, VAT split out and labeled "to ZATCA", clawbacks shown as deductions), with printable per-transfer statements.
- `getHostDashboard` is `cache()`d and **rethrows** on DB error — a transient outage renders the error boundary, not a redirect to `/host/apply`.
- Auto-completion cron (date + 1) means payouts and reviews don't depend on hosts pressing "Mark completed".
- Mobile drawer springs from the inline-start edge and flips in RTL; `[data-site-chrome]` hides the marketing nav so the rail _is_ the chrome.
- No `TODO(ar)` leaked anywhere on the live host's Arabic pages; `dir="ltr"` isolation on phone, time, money, reference.

---

## P0 — must fix

None. The dashboard's integrity layer is sound. The problems below are information architecture, decision support, and a structural performance waterfall.

---

## P1 — fix before onboarding more hosts

### P1-1 · The overview is a summary page, not a "today" surface

[page.tsx](<app/[locale]/host/(dashboard)/page.tsx>) stacks seven sections: greeting + share card → profile card → earnings KPIs → coming up / latest review → **"Get ready to host" (3 onboarding steps)** → full experiences list → footer links. Measured: 2,662px at 1280 wide, **3,778px at 375 wide** (4.6 phone viewports).

Three of those sections are copies of other rail destinations (Profile card ≈ `/host/profile`, experiences list ≡ `/host/experiences`, KPIs ≡ `/host/earnings`). The onboarding block renders **unconditionally** — the live host with 3 live listings and 45 bookings is told to "Use 'New experience' below to draft your listing" on every visit, and the copy ("below") is wrong on mobile where the CTA is in the top bar.

Airbnb's host home is a _Today_ tab: the things that need a decision, then what's happening next, then alerts. Nothing evergreen.

**Fix — restructure as Today:**

1. **Needs your attention** (only renders when non-empty): pending requests with inline Accept/Decline + countdown; listings in `changes_requested`; confirmed bookings awaiting guest payment; reviews without a reply; IBAN missing.
2. **Coming up**: next 7 days grouped by day (today / tomorrow / weekday), party size and seats left per session — across all listings.
3. **Money**: Owed · On the calendar · Paid, one row, linking to earnings.
4. **Your numbers**: rating, response rate, response time (the same trust chips guests see — see P2-4).
5. **Setup checklist** — _only while incomplete_: verification pending → first listing → hero photo → IBAN → first listing live. Disappears when done (replaces "What's next").

Drop the profile card and the full experiences list from the overview; the rail already has both one tap away.

### P1-2 · Pending requests are invisible on mobile

The only persistent pending indicator is the chip on the Bookings item in [host-nav.tsx:90](features/host-dashboard/components/host-nav.tsx:90). Below `lg` that nav lives inside the drawer. The mobile top bar ([host-shell.tsx:106](features/host-dashboard/components/host-shell.tsx:106)) shows hamburger · logo · **New experience** — the least time-sensitive action in the product gets the prime slot, while a request with a 24h SLA has no signal at all unless the host is on the overview.

The WhatsApp notification covers the first touch, but the app gives no reinforcement once they're in.

**Fix (minimum):** dot/count badge on the hamburger button when `pendingRequests > 0`; move the primary CTA out of the mobile header (it's also on the experiences page and overview).
**Fix (Airbnb-grade):** bottom tab bar on mobile — _Today · Bookings (badge) · Listings · Earnings · Menu_ — and reserve the drawer for Profile / Reviews / Back to site / Sign out. The rail stays as-is on desktop.

### P1-3 · Request rows give the host nothing to decide with

A request row ([bookings/page.tsx:109](<app/[locale]/host/(dashboard)/bookings/page.tsx:109>)) shows: title, status, guest name, party size, date, time, payout, reference, "Requested on", respond-by, Accept, Decline. Missing at the moment of decision:

- **Seats already taken on that date** — the server rejects with `over_capacity` _after_ the click; the host can't see "5 of 8 booked" beforehand.
- **Is this inside my cutoff?** — `too_late` is only discovered on click. Compute the same `startWindowClosed` predicate server-side and render the Accept button disabled with the reason.
- **Anything from the guest** — there is no guest-message column on `bookings` at all. Dietary needs, kids' ages, pickup point, "we don't speak Arabic" — none of it reaches the host. Airbnb's request card leads with the guest's message.
- **Guest context** — first-time vs. returning guest (count of prior completed bookings with this host), preferred language (`guests.preferredLanguage` already exists), whether the booking is women-only-attested where relevant.

**Fix:** add `guestNote` (nullable text, ≤500) to the booking form + schema + row; add `seatsTaken`/`maxGroupSize` to `HostBookingRow` via a correlated sum in `listBookingsForHost` (same expression the executor already uses); render _"5 of 8 seats taken · 3 left"_ and the cutoff state on the card.

### P1-4 · Host cancellations are recorded as platform cancellations

`transitionBookingAsHost` → `executeBookingTransition` stamps every cancel with `cancellationKind: 'operator'` ([transition-executor.ts:182](features/bookings/lib/transition-executor.ts:182)). The enum is `guest | operator | emergency | system` — there is no `host`. Consequences:

- Admin can't tell a host-initiated cancel from an ops one; there's no host cancellation rate to monitor or to show the host (Airbnb treats host cancellations as the #1 host-quality signal and penalises them).
- No reason is captured from the host — the confirm dialog is a single sentence.
- The guest email says _"Your host couldn't run this booking"_ for **admin** cancels too (`cancelByHostIntro*`) — misattribution in the other direction.

**Fix:** add `'host'` to `cancellation_kind`; stamp it when `actor.kind === 'host'`; require a reason (select: weather/safety · personal emergency · guest unreachable · other + text) stored in `cancellationReason`; pick email copy by kind; surface "Cancellations (last 12 months)" in the host's own stats (P2-4). Consider the admin dashboard's host-quality view reading the same column.

### P1-5 · Every host query re-resolves user → host row (serial round-trips)

`getCurrentHostIdForWrite` ([host-experiences/queries.ts:160](features/host-experiences/queries.ts:160)), `getHostEarningsTotals`, `listReviewsForHost`, `getHostReviewAggregate`, `countPendingRequestsForHost` each do `getCurrentUser()` → `hosts.findFirst` → real query. The overview fans out six of these in `Promise.all`, plus the layout's own two. Net: ~7 redundant `hosts` lookups per render, each making its consumer a two-deep chain against a DB in eu-central-1. Dev logs for `/en/host` show **2.1–4.4 s application-code** on a warm server; `/host/bookings` 1.8–2.8 s. Dev inflates this, but the chain shape survives to prod.

Only `getHostDashboard` is `cache()`d.

**Fix:** wrap `getCurrentHostIdForWrite` (and `resolveHostIdForCurrentUser`) in React `cache()`, or — cleaner — have every host query accept `hostId` and let pages pass it from the already-memoised `getHostDashboard()`. Then fold the overview's six reads into two: one bookings aggregate (pending count + next 3 + awaiting-payment) and one earnings/review aggregate. Budget: ≤4 round trips for the overview.

### P1-6 · No booking detail page

`/host/bookings/[ref]` is a redirect into the list's search ([bookings/[ref]/page.tsx](<app/[locale]/host/(dashboard)/bookings/[ref]/page.tsx>)). Everything about a booking is crammed into one list row (measured **300px tall on mobile** for a confirmed booking), and the only link on the row — the title — goes to the _public_ listing page, which is not what a host expects when tapping a booking.

There is no surface for: the guest's note (P1-3), attestations (terms, women-only, min-age), payment timeline (requested → approved → paid → reminded), refund details on cancelled rows, the reschedule history (`rescheduledFromDate`, `rescheduleCount` exist in schema), or a larger WhatsApp/call action.

**Fix:** make `/host/bookings/[ref]` a real page (host-scoped `getBookingForHost(referenceCode)`), make the row a link to it, demote the public-listing link to a secondary icon, and move Cancel to the detail page (destructive actions shouldn't sit on a list row).

### P1-7 · Actions give no feedback, and redirect wipes the host's context

`transitionBookingAsHost` succeeds by `redirect('/host/bookings')` ([host-bookings/actions.ts:112](features/host-bookings/actions.ts:112)). After **Accept** the row silently moves from Requests to Upcoming with an "Awaiting guest payment" badge — nothing says _"Accepted. {guest} has {N} hours to pay; the seat is held until then and released automatically if they don't."_ Decline and Cancel likewise end in silence. The redirect also drops any active `q`/`experience`/`past` params.

**Fix:** return `{ success: true, kind: 'approved', paymentDeadline }` and render a dismissible status line in the row (or a toast); on redirect, carry the current search string. Copy for each outcome is already half-written in the WhatsApp templates (`host_booking_confirmed`, etc.) — reuse the language.

---

## P2 — quality

| #     | Finding                                                                                                                                                                                                                                                                                                                                  | Where                                                                                                                                                                                                                                                                                                               | Fix                                                                                                                                                                      |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P2-1  | **Past section renders 50 rows inline.** 45 rows → 9,861px section, 11,020px page on mobile. Every row carries the full identity block even though past rows need only date · guest · status · payout.                                                                                                                                   | [bookings/page.tsx:348](<app/[locale]/host/(dashboard)/bookings/page.tsx:348>)                                                                                                                                                                                                                                      | Tabs (_Requests · Upcoming · Past_) or collapse Past to 10 with "Show more"; compact row variant for past.                                                               |
| P2-2  | **No calendar or week view.** With three listings the host can't see "what's on Friday" — `upcoming` is a flat list sorted by date and the listing's own calendar is per-experience.                                                                                                                                                     | bookings / overview                                                                                                                                                                                                                                                                                                 | A 7-day strip on Today (P1-1) and a month grid on `/host/bookings?view=calendar` reading the same query grouped by date.                                                 |
| P2-3  | **Earnings: all-time totals sit above a filter that only narrows the sections below**, and nothing says so. A host who picks "Last 30 days" sees totals that don't move. Stat order also differs: overview = Owed · On the calendar · Paid; earnings page = Owed · Paid · On the calendar.                                               | [earnings/page.tsx:116](<app/[locale]/host/(dashboard)/earnings/page.tsx:116>)                                                                                                                                                                                                                                      | Label the strip "All time" or make it range-aware; use one order everywhere (Owed · On the calendar · Paid reads as _now → next → history_).                             |
| P2-4  | **Host never sees their own trust metrics.** Guests see rating, response rate, and response time on `/hosts/[slug]` (`getHostResponseStats`), but the dashboard shows none of them. Airbnb's host home leads with these.                                                                                                                 | overview                                                                                                                                                                                                                                                                                                            | "Your numbers" card: rating (n), response rate, typical response time, cancellations 12m (after P1-4). Reuse `getHostResponseStats` by host id.                          |
| P2-5  | **Experience list rows carry no signal.** No thumbnail, no bookings/rating per listing, no "needs attention" grouping; archived rows mixed in by `createdAt`; the `{pct}% Gharmish share` line repeated on every row is noise for the list and belongs on the detail.                                                                    | [experience-list-row.tsx](features/host-experiences/components/experience-list-row.tsx)                                                                                                                                                                                                                             | Hero thumb + title + status + next session + 30-day bookings + rating; sort `changes_requested` → `pending_review` → `live` → `paused` → `draft`, archived under a fold. |
| P2-6  | **Five links are 20px tall on mobile**: "Edit profile", "View earnings", "All bookings", "All reviews" (overview), and the experience-title links on every booking row (24px). The project's own minimum is 44px.                                                                                                                        | overview, bookings rows                                                                                                                                                                                                                                                                                             | `min-h-11 inline-flex items-center` (the pattern the WhatsApp link already uses).                                                                                        |
| P2-7  | **Bookings, earnings, reviews render raw `titleAr`** (`loc === 'ar' ? row.experienceTitleAr : row.experienceTitleEn`) while the experiences list uses `pickLocalized`. A host with an untranslated listing will see `TODO(ar): …` as a booking title. Not reproducible on the live host (all translated), but the guard is inconsistent. | [bookings/page.tsx:141](<app/[locale]/host/(dashboard)/bookings/page.tsx:141>), [earnings/page.tsx:220](<app/[locale]/host/(dashboard)/earnings/page.tsx:220>), [reviews/page.tsx:107](<app/[locale]/host/(dashboard)/reviews/page.tsx:107>), [overview page.tsx:266](<app/[locale]/host/(dashboard)/page.tsx:266>) | Use `pickLocalized` everywhere a bilingual title is picked.                                                                                                              |
| P2-8  | **Reviews: no "needs reply" priority, no pagination (500-row limit), no per-listing grouping, reply can't be edited or withdrawn.**                                                                                                                                                                                                      | [reviews/page.tsx](<app/[locale]/host/(dashboard)/reviews/page.tsx>)                                                                                                                                                                                                                                                | Sort unreplied-first; "Awaiting your reply (n)" chip; paginate at 20; allow edit within 24h (mirror `editableUntil` on the guest side).                                  |
| P2-9  | **No help or support entry anywhere in the dashboard.** The WhatsApp support line (+966 55 900 2592, agent-staffed) exists but the rail never links it; `error.tsx` offers only Retry.                                                                                                                                                   | `HostShell` rail footer                                                                                                                                                                                                                                                                                             | "Help" item in the rail footer → WhatsApp deep link with a prefilled "Host · {name}" message; also on the error boundary.                                                |
| P2-10 | **Contact phone/email aren't editable.** `hosts.contactPhone/contactEmail` are copied at approval and drive every notification; a host who changes number silently stops receiving requests. No notification preferences either.                                                                                                         | `/host/profile`                                                                                                                                                                                                                                                                                                     | "Contact & notifications" card: phone (OTP re-verify), email, per-channel toggles.                                                                                       |
| P2-11 | **Earnings ledger: silent 200-row cap, no pagination; "On the calendar" bookings aren't in the ledger at all** (completed only) so the host can't reconcile the upcoming figure.                                                                                                                                                         | [host-earnings/queries.ts:143](features/host-earnings/queries.ts:143)                                                                                                                                                                                                                                               | Paginate like Past bookings; a "Projected" tab or a status filter on the ledger.                                                                                         |
| P2-12 | **"New experience" CTA is always on, including for suspended hosts** whose actions will fail with `suspended`; pending-verification hosts can draft but not publish and nothing says so until they try.                                                                                                                                  | [host-shell.tsx:123](features/host-dashboard/components/host-shell.tsx:123)                                                                                                                                                                                                                                         | Hide for suspended; for `pending`, show a one-line note in the setup checklist (P1-1).                                                                                   |
| P2-13 | **Reference code (`GH-…`) is 11px mono with no copy affordance** — it's the thing hosts quote on WhatsApp.                                                                                                                                                                                                                               | [bookings/page.tsx:189](<app/[locale]/host/(dashboard)/bookings/page.tsx:189>)                                                                                                                                                                                                                                      | Copy-on-tap chip (same component as the share card's copy button).                                                                                                       |
| P2-14 | **Guest phone hidden on requests, unexplained.** Correct policy, but the card gives no hint, so hosts think it's a bug.                                                                                                                                                                                                                  | request rows                                                                                                                                                                                                                                                                                                        | _"Contact details appear once you accept."_ in the meta line for `pending`.                                                                                              |

---

## P3 — polish

- **Stale `ErrorKey` union** in [host-transition-button.tsx:15](<app/[locale]/host/(dashboard)/bookings/host-transition-button.tsx:15>) lacks `too_late`; it works only because `key in copy.errors` is a runtime check. Derive the type from `HostBookingActionResult['message']`.
- **`HostBookingRow.reference` (idempotencyKey) is selected and mapped but never rendered.** Drop it from the host row — less surface, one fewer secret-ish value in the RSC tree.
- **Section counts are glued to headings**: `<h2>Upcoming<span>1</span></h2>` reads as "Upcoming1" to assistive tech. Add a visually-hidden separator or `aria-label`.
- **Loading skeleton doesn't mirror the overview** ([loading.tsx](<app/[locale]/host/(dashboard)/loading.tsx>): 4 KPI cards + 2 panels vs. real: share card + profile card + 3 KPIs) → layout shift on swap. Will resolve itself under P1-1; otherwise match shapes.
- **"Mark completed" sits on Past rows** with no explanation that it's optional (the cron completes at date + 1). Either hide it or caption it.
- **Redirect after a transition drops filters** (covered in P1-7).
- **Overview fetches `listReviewsForHost(1)` + aggregate + earnings totals separately** — fold into the single aggregate once P1-5 lands.
- **Eyebrow labels at 11px uppercase** are brand-consistent but on the earnings KPI strip they carry the _meaning_ of each number (Owed / On the calendar / Paid). Consider 12px or sentence-case for data labels while keeping 11px for decorative eyebrows.

---

## Proposed "Today" overview (replaces the current `/host`)

```
┌ Today · Thursday 22 Aug ───────────────────────────────────────┐
│ Needs your attention                                            │
│ ▸ 2 booking requests · respond by 18:40 (4h 12m)   [Review]    │
│ ▸ "Juniper dawn walk" — changes requested          [Open]      │
│ ▸ GH-MQZYYP awaiting guest payment · 19h left                   │
├─ Coming up ─────────────────────────────────────────────────────┤
│ Tomorrow  09:00  Aseeri coffee ritual · Aziz (1) · 1/8 seats    │
│ Sat       16:00  Evening with the flowermen · 2 bookings (5/10) │
│ [All bookings →]                                                │
├─ Money ───────────────┬─ Your numbers ─────────────────────────┤
│ Owed   SAR 3,298 (10) │ ★ 4.9 (12) · Replies 100% · ~3h        │
│ Ahead  SAR   221 (1)  │ Cancellations 12m: 0                    │
│ Paid   SAR     0      │                                         │
└───────────────────────┴─────────────────────────────────────────┘
```

Setup checklist renders above "Needs your attention" only while incomplete.

---

## Build order

1. **P1-5** cache the host-id resolution (one-line change, every page gets faster) — do first; it's a prerequisite for the aggregate queries.
2. **P1-4** `host` cancellation kind + reason (schema + executor + email copy) — small, closes a data-integrity gap before more bookings accrue.
3. **P1-2** mobile pending badge / bottom tab bar.
4. **P1-1 + P2-4** Today overview with trust metrics and conditional setup checklist.
5. **P1-3 + P1-6 + P1-7** request decision context, booking detail page, action feedback — one bookings pass.
6. **P2-1 / P2-2** bookings tabs + week strip.
7. Remaining P2s (earnings labeling, reviews ordering, help link, contact editing, touch targets, `pickLocalized`), then P3s.

Out of scope here but worth the roadmap: guest messaging in-app (today it's WhatsApp-only, with no message history the platform can see for disputes).

---

## Follow-up — 2026-08-23 · the two deferred items, shipped (`41e8ff0`)

Both pieces the first pass deferred are live on gharmish.com.

### Notification preferences (`/host/profile` → Notifications)

- **Channels** — WhatsApp and email toggles (`hosts.notify_whatsapp` / `notify_email`), enforced in the two host-contact resolvers every sender already goes through ([host-contact.ts](lib/notifications/host-contact.ts), `hostEmailContext` in [booking-email.ts](features/bookings/lib/booking-email.ts)). A switched-off channel reads as "no address", so the dispatcher and the twenty-odd senders are unchanged.
- **Categories** — day-before reminders and new-review notices can be muted (`notify_reminders` / `notify_reviews`); everything else is transactional and always delivered on the enabled channels.
- **Rules** — at least one channel stays on _and_ it must have an address on file (hosts row with the approved application as fallback). Account-critical, email-only notices — suspension, reinstatement, dispute opened, payment hold lapsed, "your contact details changed" — pass `{ critical: true }` and ignore the toggles; the copy says so.
- Ops sees the contact, any pending phone change and the four toggles on the admin host page.

### Verified contact-phone change (`/host/profile` → Contact details)

- A new number is parked in `hosts.pending_contact_phone(_at)` and proven by a Twilio Verify code over WhatsApp ([twilio-verify.ts](lib/twilio-verify.ts), REST against the existing "Gharmish" Verify service; new env `TWILIO_VERIFY_SERVICE_SID`, set in production). Notifications stay on the old number until the code checks out. Resend and cancel paths; Arabic-Indic digits accepted; the sign-in send/verify throttles are reused. Empty env → changes are refused, never saved unverified.
- Proving the **new** number says nothing about who holds the session, so every contact or preference change is announced to the **previous** email with a "this wasn't me" support path, audited in `user_profile_events`, and the old number loses its WhatsApp host identity (`conversations.host_id` cleared; the application-phone fallback in `identifyHost` applies only while `contact_phone` is unset).
- Email changes save immediately; the form is a sequence-stamped step machine, so the verify step opens, closes and reopens any number of times in one page session.

### What the adversarial review caught before it shipped

Five review lenses (security, correctness, coverage, UX/i18n, completeness) with two skeptics per finding. Confirmed and fixed: the verify step could not reopen within a page session; "code expired" was never shown and left a stale pending row; "at least one channel" ignored whether that channel had an address; four email-only account notices would have gone silent when email was switched off; verifying the new number does not authenticate the actor (hence the change notices, audit trail and identity drop above); the email part of a submit saved silently before the phone step failed; the old application number kept WhatsApp host powers after a change; plus copy (day-of → day-before, "listing reviews" → moderation decisions, duplicate card titles, an ICU `{phone}` placeholder that needed `t.raw`), persistent ARIA live regions, and no focus-steal on load.

Verification: 32 new unit tests (1491 total), lint / typecheck / production build clean, headless Playwright against a real Twilio Verify round-trip (wrong code → resend → cancel → reopen with a second number), EN and AR.
