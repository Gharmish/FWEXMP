# Host dashboard — audit findings & development plan

> Produced 2026-07-03 from a four-surface audit of the host area
> (`/host`, `/host/bookings`, `/host/experiences`, `/host/earnings`,
> `/host/reviews`). Companion to `audit-remediation-plan.md`.

---

## Audit summary

**Core verdict:** secure and correct at the core; weaknesses are structural.

### What's healthy

- **Security** — every query/action scoped to the authenticated host; foreign
  rows return `not_found` (no ID enumeration); guest phone withheld until
  confirmed; one-reply-per-review enforced with a race-proof conditional
  UPDATE; suspended hosts blocked server-side.
- **Booking state machine** — capacity re-checked under a row lock on
  approval; concurrent transitions guarded by status-conditional UPDATEs;
  lapsed approval deadlines flip to `expired`; refunds fire on host
  cancellation.
- **Money** — integer SAR arithmetic; commission snapshotted per booking
  (`bookings.commissionBps`) so history never restates; refunded bookings
  excluded from earnings; payouts only count collected payments; CSV export
  is RFC-4180 with formula-injection defusal.
- **Conventions** — no `any`/`@ts-ignore`, no raw hex, no `console.log`,
  logical properties, next-intl throughout.
- Hosts **do** already have blackout / stop-sell editing via the
  `ScheduleCalendarSection` calendar on the experience edit page.

### Findings

**Functional bug — retracted on verification.** The audit flagged
confirmed-but-unpaid bookings whose `paymentDeadline` lapses as staying
`confirmed` forever. In fact the release-holds cron (pass 1) already
cancels them and emails guest + host. The real residue is cosmetic: on the
daily (Hobby-plan) cron cadence the host can see "Awaiting payment" for up
to a day after the deadline — fixed by showing a "Payment window lapsed"
badge once the deadline passes.

**High-impact structural gaps**

1. No `app/[locale]/host/layout.tsx` — no persistent navigation shell
   (admin has `AdminShell`); each host page repeats auth + host resolution.
2. No host gallery upload — `experiences.images` is empty everywhere while
   the public detail mosaic needs 5+ photos. `galleryObjectKey()` exists
   unused; admin already has a gallery-manager to borrow from.
3. `/host` overview shows no numbers — no earnings snapshot, no upcoming
   bookings, no review/rating summary, no SLA urgency beyond a count.

**Medium gaps**

- Bookings: no SLA countdown, no search/filters, hard 500-row cap with no
  pagination, no detail view, no host email on new request.
- Earnings: no date-range filter, no per-experience breakdown, no monthly
  summary, no payout-schedule visibility, 200-row ledger cap.
- Reviews: no rating aggregate/histogram on the host page, no guest
  notification when the host replies.
- Experiences: no map picker (raw lat/lng inputs, unbounded coords), no
  preview-before-publish, no `/host/experiences` index route.

**Small defects**

- `FIELD_ERROR_KEY` missing `maxGroupSize` / `minAge` entries
  (`experience-form.tsx`), so their errors render generically.
- Unused `sectionAvailability` copy field (`build-form-copy.ts`).
- Suspended hosts see enabled-looking booking buttons that silently no-op.
- Possible orphaned storage object on slug-collision retry (rare).
- IBAN stored plaintext (masked in UI); no change audit trail.
- `divide-[var(--color-sarat-black)]/8` arbitrary value on `/host` page.

---

## Development plan

### Phase 1 — Shell + correctness

1. `app/[locale]/host/layout.tsx` + `HostShell` (mirror `AdminShell`):
   left rail Overview / Bookings / Experiences / Earnings / Reviews,
   pending-request badge, sign-out; auth + host resolution gated once.
2. Lapsed-payment clarity: show "Payment window lapsed" on host bookings
   once `paymentDeadline` passes (the cron already cancels + emails; only
   the interim badge misled).
3. Small-fix batch: `FIELD_ERROR_KEY` entries, dead copy field, token
   cleanup, explicit disabled state for suspended hosts, empty-state links,
   Saudi-bounds validation on lat/lng.

### Phase 2 — Overview that earns its place

4. KPI row on `/host`: SAR owed / upcoming / paid, next 3 upcoming
   bookings, newest review + average rating (queries mostly exist).
5. Bookings upgrades: live SLA countdown on pending requests,
   status/search filters, pagination. (The "no host email on new request"
   finding was stale — `sendHostNewBookingEmail` already fires on
   creation.)

### Phase 3 — Listing quality

6. Host gallery upload (reuse admin gallery-manager + `galleryObjectKey`
   pipeline) — unblocks the public mosaic for every listing.
7. Mapbox location picker replacing raw lat/lng inputs (graceful fallback
   to manual entry when no token is configured).
8. Preview-before-publish (host-only render of the public detail page).

### Phase 4 — Earnings & reviews polish

9. Earnings: date-range presets, per-experience breakdown, monthly
   summary; UTC note on the CSV.
10. Reviews: rating aggregate + histogram, guest email on host reply.
11. IBAN change audit trail (field-level encryption deferred — needs a key
    management decision).

### Deferred decisions (owner)

- **Arabic listing entry** — keep partnership-team manual flow vs. add an
  AI-translate-and-approve step in the listing form.
- **Payout schedule visibility** — requires deciding the actual payout
  cadence first.
- **Booking rescheduling/modification** — new feature (state machine +
  payment implications); out of scope for this plan.
- **IBAN field-level encryption** — pgcrypto / Supabase Vault choice.
