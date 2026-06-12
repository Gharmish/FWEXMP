# Gharmish — Audit remediation plan

> Source: multi-lens audit of 2026-06-12 (8 lenses: Founder, Guest, Host, Admin, UI/UX, CTO, PM, Finance).
> Scope: all P0s and the P1 clusters from the top-10 list. Audit-only findings (P2 polish) are listed at the end as a backlog.
> Sequencing rule: nothing in Phase 2+ blocks Phase 1; phases land in order, items inside a phase can be parallel.

---

## Phase 0 — Owner decisions (blockers, decide before/while Phase 1 runs)

Each has a recommended default so work can start; confirm or override.

| #   | Decision                                                                                  | Recommended default                                                                                                                                                                  |
| --- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Guest comms channel: WhatsApp Business (360dialog) / SMS before launch, or email stopgap? | **Stopgap now**: collect optional email in the booking form + make host contact email required; WhatsApp Business as a separate post-P0 track                                        |
| D2  | May hosts cancel confirmed **paid** bookings?                                             | **Yes, but** the cancellation auto-refunds in full and notifies admin (guest is never at fault for a host cancel)                                                                    |
| D3  | Cron cadence: upgrade Vercel plan for sub-daily crons?                                    | **Yes — hourly** (`0 * * * *`); the 30-min hold and 24h SLA are fiction at daily granularity. If staying on Hobby, use an external scheduler hitting the cron URL with `CRON_SECRET` |
| D4  | Commission base: 15% of VAT-inclusive gross (current) or net-of-VAT?                      | **Keep gross** (Airbnb-style), but document it in BRIEF §8 and in host-facing copy                                                                                                   |
| D5  | Commission edits: future bookings only?                                                   | **Yes** — snapshot bps on the booking at creation (Phase 3 implements this regardless)                                                                                               |
| D6  | Auto-complete: may the cron flip past-date `confirmed` bookings to `completed`?           | **Yes, at date + 1 day**; host can still cancel/dispute before that                                                                                                                  |
| D7  | Partial refunds: representable now?                                                       | **Defer the UI**, but the ledger (Phase 3) records refund _amounts_ so partial becomes possible later without migration                                                              |
| D8  | VAT/ZATCA: TRN + FATOORA invoice — build/buy/defer?                                       | **Owner-only** (needs VAT registration status). Plan reserves a slot in Phase 4 but cannot start without the TRN answer                                                              |
| D9  | Payout rail: ad-hoc per host or weekly batches?                                           | **Weekly batches** → Phase 3 builds a `payouts` record with batch reference rather than just snapshotting                                                                            |

---

## Phase 1 — Stop money/trust breakage (all P0; target: one sprint)

### 1.1 Refunds on operator cancellation `[M]`

The only place real money disappears today.

- Extract the refund executor from `features/bookings/cancel-actions.ts` (`executeRefund`) into a shared module, e.g. `features/bookings/lib/refund.ts`, so guest-cancel, host-cancel, and admin-cancel use one code path.
- `features/host-bookings/actions.ts` (`transitionBookingAsHost` → `cancelled`): when `paymentStatus='paid'`, run the shared refund (full amount), stamp `refundDueSar` on gateway failure, send `sendBookingCancellationEmail` to the guest, notify admin (uses 2.2's `notifyAdmin`, or Sentry until it lands).
- `features/admin/bookings/actions.ts` (`transitionBooking` → `cancelled`): same treatment.
- `refundBooking` (admin): attempt the HyperPay refund API first, fall back to record-only; record amount + admin id (full ledger comes in Phase 3 — interim: log fields on the booking row update + Sentry breadcrumb). Fix the stale "Moyasar" comment.
- Also: host approve action checks `approvalDeadline` before approving (stale requests currently approvable until the cron runs).
- **Tests**: unit tests for the shared refund executor (gateway success / gateway failure / DB failure), transition tests for host/admin cancel of paid bookings.
- **Done when**: no path can move a `paid` booking to `cancelled` without a refund attempt or a `refundDueSar` stamp + guest email.

### 1.2 Abandoned instant-hold state `[S]`

- `app/[locale]/book/confirmed/[ref]/page.tsx:122-127`: render awaiting-payment (with Pay CTA) for any `confirmed` + `unpaid` booking with a live `paymentDeadline` — drop the `approvedAt !== null` condition. Render a distinct "payment window lapsed" state when the deadline has passed.
- Gate the print-ticket button on `paymentStatus === 'paid'` whenever HyperPay is configured.
- `app/[locale]/book/[reference]/pay/page.tsx`: show the payment deadline (date + time) and a countdown.
- **Done when**: an unpaid instant booking never displays as "confirmed, no action needed".

### 1.3 Capacity correctness + booking abuse `[M]`

- `features/bookings/lib/availability.ts`: capacity sum excludes bookings whose `paymentStatus='unpaid'` **or** `'failed'` with `paymentDeadline < now()`. This makes the 30-minute hold true regardless of cron cadence and closes the inventory-DoS at the correctness layer.
- `features/payments/actions.ts` (`createCheckout`): apply the hold-expiry guard to `failed` as well as `unpaid` (a failed booking is currently payable arbitrarily late).
- Cron release pass: include `failed` past-deadline bookings.
- Rate-limit booking creation in `features/bookings/actions.ts` (`requestBooking`): no new dependency — DB-count recent bookings per phone and per IP (via `lib/request.ts` helpers) over a window, e.g. max 3 active unpaid/pending per phone, max 10/hour per IP; return a translated error.
- **Tests**: availability sum with expired holds; rate-limit unit test.
- **Done when**: spamming the booking form cannot exhaust visible capacity for more than the hold duration.

### 1.4 Comms truthfulness + minimum viable delivery `[M]` _(depends on D1; default = stopgap)_

- Booking form (`features/bookings/schemas.ts`, `booking-request-form.tsx`): add optional email field, copy explaining "we'll send your approval and ticket here". Persist to `guests.email`.
- Host application (`features/host-applications/schemas.ts`): make `contactEmail` **required**; copy contact email onto `hosts` at approval (new nullable `hosts.contactEmail` column) so notifications stop depending on the application row.
- New host emails in `features/bookings/lib/booking-email.ts`: guest-cancelled (to host), hold-lapsed (to host), payment-landed (to host). Wire into the cancel action, cron release pass, and settle success respectively.
- Application decision emails (approve/reject with reviewer note) in `features/host-applications/admin-actions.ts`.
- **Strip false promises** from `messages/en.json` + `ar.json`: "we'll text you", "confirm by WhatsApp", "send the meeting point by WhatsApp", sign-in `phoneHint` — reword to match reality (email + booking page).
- **Done when**: every string in the product describes a channel that exists, and the approved→pay-link email reaches any guest who gave an email.

### 1.5 Trivial P0-adjacent fixes (bundle, ~1 day total) `[S]`

- Navbar "Host with us" link for signed-out / non-host users (`components/layout/navbar.tsx`).
- Arabic letter-spacing: guard eyebrow tracking on `app/[locale]/book/[reference]/pay/page.tsx:130` and `features/account/profile/components/wallet-card.tsx:33` with the existing `loc === 'en'` pattern.
- Money deadlines rendered date+time (`formatDate` + `formatTime`): pay-by, respond-by, free-cancellation on `book/confirmed/[ref]/page.tsx:211,222,442` and in emails.

---

## Phase 2 — Time & payment integrity (P1; target: one sprint)

### 2.1 HyperPay webhook + settle hardening `[L]`

- Build `app/api/webhooks/hyperpay/route.ts` using the reserved `HYPERPAY_WEBHOOK_SECRET` (OPPWA encrypted notification → decrypt → `settleBooking`). Required before `HYPERPAY_MODE=live`.
- `features/payments/settle.ts`:
  - Check lifecycle status: a successful payment result on a `cancelled`/`declined`/`expired` booking auto-refunds via the shared executor (or stamps `refundDueSar`) and alerts admin — closes the cancel-during-3DS race.
  - Return a distinct `already_settled` outcome; `pay/return/route.ts` only sends the receipt on an actual `unpaid/processing → paid` transition (kills the replay-receipt spam).
  - Verify `status.currency` in addition to amount.
- Cron reconcile pass: include `cancelled` rows with `processing` payments.
- Cron cadence per D3: `vercel.json` → hourly.
- **Tests**: settle integration tests (mocked gateway): success, amount mismatch, success-on-cancelled, replay.

### 2.2 Admin alerting + payout operability `[M]`

- `lib/admin-alerts.ts`: `notifyAdmin(event)` → email to `ADMIN_ALERT_EMAIL` env. Wire into: host application submitted, dispute opened, `refundDueSar` stamped, settle anomaly, cron run failure.
- Cron heartbeat: stamp last-run on `platform_settings` (or a `cron_runs` table); red badge on the admin dashboard when stale > 2× cadence.
- Masked IBAN (+ copy button) on `/admin/payouts` and `/admin/hosts/[id]` — without this the operator cannot actually pay anyone.
- Dashboard work queue (`features/admin/dashboard/queries.ts`): add open disputes, refund-due count + SAR, payouts owed SAR; `?refund_due=1` filter on `/admin/bookings`.
- Show `approvalDeadline` ("expires in Xh") on pending bookings in admin + host lists; sort pending by it.

---

## Phase 3 — Money auditability (P1; target: one sprint)

### 3.1 `payment_events` ledger + checkout idempotency `[L]`

- New append-only table `payment_events`: `id, bookingId, type (checkout_created | settle_succeeded | settle_failed | refund_attempted | refund_succeeded | refund_failed | payout_marked | manual_refund_recorded), amountSar, gatewayId, resultCode, actorUserId, createdAt`. Migration via Supabase MCP `apply_migration` (NOT `db:push` — known drift issue).
- Write events from: `createCheckout`, `settleBooking`, the shared refund executor (before _and_ after the gateway call — closes the double-refund window), `refundBooking`, `markHostPaid`.
- `createCheckout`: reuse an existing checkout when one is `processing` and younger than the widget validity window instead of overwriting `checkoutId` (closes the orphan-charge path); otherwise record the superseded checkout id in the ledger so reconciliation can find it.
- Refund records carry amount + actor (partial refunds become representable per D7).

### 3.2 Payout correctness `[M]` _(shape depends on D9)_

- Snapshot `commissionBps` onto `bookings` at creation; all payout/earnings/email queries compute from the snapshot (`features/admin/payouts/queries.ts`, `features/host-earnings/queries.ts`, `features/admin/bookings/queries.ts`, `booking-email.ts`).
- Gate "owed" and `markHostPaid` on `paymentStatus='paid'`.
- `markHostPaid`: block when `payoutIban` is null or host is suspended; require the expected booking ids (or amount) from the page and refuse on mismatch; record per-booking payout events with amount + admin id + batch reference (D9 default: a `payouts` batch table).
- Host earnings page: show commission rate, gross/commission/net per row, CSV export; admin CSV export adds `paid_at`/`refunded_at`/`host_paid_at`/`payment_brand` and drops the silent 500-row truncation (chunked/unbounded).

---

## Phase 4 — Marketplace quality gates (P1; target: one sprint)

### 4.1 Review engine `[M]`

- Cron pass: `confirmed` bookings past date + 1 day → `completed` (per D6).
- Review entry point on every completed booking: confirmation page + booking-history rows (`features/account/profile/components/booking-history.tsx`), not just the `/me` last-booking card.
- Anonymous review submission requires the same cookie-or-ownership check as every other booking surface (`features/reviews/actions.ts`).
- Reviews "show more" (paginated) on `features/reviews/components/reviews-section.tsx`.

### 4.2 Launch content gates `[M]`

- `submitForReview` requires `heroImage`; `approveExperience` hard-blocks on missing hero and on `titleAr`/`descriptionAr` starting with `TODO(ar)` (`features/admin/experience-moderation/actions.ts`).
- Cancellation policy single source of truth: derive the displayed policy line from `platform_settings.cancellationWindowHours` on the detail page; retire or validate the free-text `cancellationPolicy` field against it.
- Host form gains `startTime` and a location picker (minimal: lat/lng map-click using the existing Mapbox meeting-point map component); stop defaulting every listing to 09:00 at Abha city centre.
- Show start time everywhere: detail page, booking form, confirmation `detailRows`, e-ticket, emails.
- Moderation bypass: lock content edits (moments, hero) for `paused` like `live`, or route `paused → live` after edits through `pending_review` (owner call — default: re-review when content changed since last approval).

### 4.3 ZATCA invoice slot `[blocked on D8]`

- Add TRN + sequential invoice number + FATOORA TLV QR to receipt email and print view once registration status is known.

---

## Cross-cutting

- **Integration tests for money paths** land with their phases: refund executor (1.1), settle/webhook (2.1), ledger + payout (3.x). These paths currently have zero tests.
- Every phase ends with `pnpm typecheck && pnpm lint` and a Vercel preview deploy.
- Schema changes: Supabase MCP `apply_migration`, then regenerate Drizzle metadata — never `db:push` (drift prompts to TRUNCATE `host_applications`).
- Arabic strings: AI-written ar.json is approved by owner; keep parity at 100%.

## Deferred P2 backlog (not scheduled)

WhatsApp Business API track (if D1 chooses it, it becomes Phase 2.5) · admin `user_roles` + 2FA + admin-action audit table · PII masking at the Sentry boundary · suspended-host write guard centralization · client-supplied idempotency keys · no-show status · chargeback flow · dispute→refund linkage + guest resolution notice · reschedule flow · host growth stats + day-of roster · per-route loading/error boundaries · focus-ring contrast + star touch targets · admin sub-nav · language-switcher label · multi-slot availability model · Meilisearch · MCP server/OpenAPI/pgvector (or amend BRIEF §6) · GMV gating on paid · VAT snapshot per booking.

---

### Suggested sprint map

| Sprint | Contents          | Outcome                                                     |
| ------ | ----------------- | ----------------------------------------------------------- |
| A      | Phase 1 (1.1–1.5) | No money/trust breakage; comms truthful; DoS closed         |
| B      | Phase 2 (2.1–2.2) | Payments live-ready (webhook); admin can actually operate   |
| C      | Phase 3 (3.1–3.2) | Every riyal traceable; payouts correct and recorded         |
| D      | Phase 4 (4.1–4.3) | Review engine running; nothing un-launch-worthy can go live |
