# Gharmish development plan — 2026-10-09

> Six-week horizon (2026-10-09 → 2026-11-20). Written by the Development Planner routine (fires 1st and 15th).
> Complements the Nightly Bug Hunter (#7), the System Health Log (#8), and the weekly PM routine (#9, #10, #11, PR #12). Defects go to the bug routine. This plan covers improvements only.
> All numbers come from read-only queries against production (`gharmish-experiences`), from commands run on HEAD `6dcceb0`, or from the cited files. Scores are estimates.

## الملخص بالعربية

1. هذه أول خطة تطوير؛ لا توجد خطة سابقة. المنتج متين هندسياً (٢١٨٦ اختباراً ناجحاً)، والعائق في التشغيل والعرض لا في الكود: لا تجربة منشورة الآن، وطلبا استضافة عالقان منذ أكثر من ١٠٠ يوم.
2. أهم اكتشاف: لم يُصرف للمضيفين أي مبلغ قط. ٢٦ حجزاً مكتملاً ومدفوعاً بقيمة ٤٬٨١٠ ريال مستحقة لمضيفَين منذ يونيو، وليس لدى أيٍّ منهما آيبان مسجّل. هذا يسبق إعادة نشر التجارب (#9).
3. رسائل واتساب العربية «حجزك بانتظار الدفع» فشلت ٤ مرات من ٤ خلال ٢٨ يوماً لغياب معرّف القالب العربي المعتمد، في الخطوة التي يخسر فيها المنتج معظم حجوزاته.
4. «الآن» (أسبوعان): صرف مستحقات المضيفين، وإصلاح قوالب واتساب العربية، وقياس مسار الحجز كاملاً، وتمكين المضيف العربي من التقديم وإكمال وثائقه، والتحقق من شارة «مضيف موثّق»، وأتمتة تحديثات الحزم.
5. قرارات مطلوبة من المؤسس: موعد ودورية صرف المستحقات، وهل تبقى شارة التوثيق للمضيفين القدامى قبل استكمال وثائقهم، والموافقة على قوالب واتساب الجديدة، وتفعيل Sentry.

## Carry-over from the previous plan

**This is the first development plan.** `docs/plans/` did not exist before this run, so there is nothing to carry over.

Related open work that this plan builds on, rather than duplicates:

| Item                                                           | Owner routine | Status                                                                |
| -------------------------------------------------------------- | ------------- | --------------------------------------------------------------------- |
| #9 Restore sellable inventory + zero-live-listings alert       | PM            | Open, created today                                                   |
| #10 Host pipeline: verified → first live listing               | PM            | Open, created today                                                   |
| #11 "Notify me" waitlist on empty catalog / zero-result search | PM            | Open, created today                                                   |
| PR #12 PM weekly report 2026-10-09                             | PM            | Open                                                                  |
| PR #1 Booking consent + women-only gates                       | —             | Stalled since 2026-07-10 (91 days). Founder decision in the PM report |

## Where we are

### Engineering mix, last 30 days (51 commits on `main`)

| Type                | Commits |
| ------------------- | ------- |
| fix                 | 25      |
| refactor            | 8       |
| docs                | 8       |
| test                | 3       |
| chore               | 3       |
| style / perf / feat | 1 each  |
| merge               | 1       |

There was one `feat` in 30 days. The month went into audit remediation (2026-09-12/13), payment go-live (2026-09-21), and DB-pooler hardening (2026-09-30). The code is in good shape. Product growth work has not started.

Hotspots, by files touched in 30 days: `app/[locale]` (308), `features/admin` (174), `features/bookings` (133), `db/migrations` (80).

### Health

| Signal                         | Value                                                                                                                                                                    | Source                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| Typecheck / lint               | 0 errors / 0 errors, 1 intentional warning                                                                                                                               | `pnpm typecheck`, `pnpm lint`  |
| Tests                          | 184 files, 2,186 tests, all pass                                                                                                                                         | `pnpm test:coverage`           |
| Coverage                       | 40.7% statements, 30.7% branches, 41.5% lines. CI floor is 20/15/15/20                                                                                                   | `vitest.config.ts:55`          |
| Lowest-covered folders (lines) | components 1.9%, features/host-dashboard 4.8%, features/hosts 4.1%, lib/analytics 5.6%, features/reviews 15.8%, features/host-bookings 18.7%, features/experiences 19.9% | coverage report                |
| CI                             | 11 of the last 15 runs green. All 4 red runs failed only at `pnpm audit --prod --audit-level=high`                                                                       | `ci.yml:26`, Actions history   |
| Bug log                        | 2026-10-09: all clear. 8 defects fixed in `c9460d9`. 0 open bug issues                                                                                                   | #7 (first entry, no trend yet) |
| System health                  | 🔴 0 live listings. Crons 100% green, `/api/health` ok                                                                                                                   | #8 (first entry)               |

### Funnel, last 28 days

`analytics_events` has a `type` column (enum `page_view | search | experience_view`). The routine brief's `event` column does not exist. Booking steps come from `bookings`.

| Step                                   | Count | Note                                                                             |
| -------------------------------------- | ----- | -------------------------------------------------------------------------------- |
| Page views                             | 1,884 | 250 (13%) are scanner probes with a non-`ar`/`en` locale                         |
| Searches                               | 82    | 62 (76%) returned 0 results. 76 of 82 were Arabic. 28 queries mention women-only |
| Experience views                       | 378   | 267 Arabic                                                                       |
| Bookings created                       | 8     | 4 paid, 4 cancelled unpaid. Mostly a 5 SAR internal test listing                 |
| Paid, excluding the 5 SAR test listing | 1     | Later refunded                                                                   |

The biggest drop is **experience view → booking start** (378 → 8, 2.1%). It cannot be diagnosed further because no event exists between "viewed listing" and "booking row created".

### Supply

|                                                                           |                                                                                                                                                                      |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Experiences                                                               | 8 paused, 1 draft, **0 live**                                                                                                                                        |
| Hosts                                                                     | 4 verified, 1 pending, 1 suspended                                                                                                                                   |
| Verified hosts without an approved application (legacy / "grandfathered") | 2. They own all 8 paused listings                                                                                                                                    |
| Host applications                                                         | 3 approved, 2 pending (104 and 135 days old, 0 documents each), 1 rejected                                                                                           |
| **Payouts ever**                                                          | **0**                                                                                                                                                                |
| **Owed to hosts**                                                         | **26 completed, paid bookings. SAR 4,810 gross, oldest 2026-06-02, owed to 2 hosts. Neither host has an IBAN on file.** 12 of the 26 are under SAR 50 (likely tests) |

## Improvement register

Value and Confidence are scored 1–5. Effort is S < 1 day, M 1–3 days, L ≥ 1 week. Ratio = Value ÷ effort weight (S=1, M=2, L=4). All scores are estimates. Flags: 🗄 DB migration · 📦 new dependency · 🔑 third-party account or config · 🧑‍⚖️ founder decision.

| #   | Item                                                                                        | Side       | V   | C   | E   | V÷E | Flags | Evidence                                                                                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------- | ---------- | --- | --- | --- | --- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Arabic WhatsApp template coverage + config guard                                            | Guest      | 4   | 5   | S   | 4.0 | 🔑    | `notification_deliveries`, 28d: 4 of 4 `booking_awaiting_payment`/ar WhatsApp sends failed with "no approved content SID for template/locale". Failure raised at `lib/notifications/dispatch.ts:144-145`. Template health is not checked in `features/maintenance/passes/config.ts`                         |
| R2  | Snapchat in-app visits counted + scanner rows excluded                                      | Founder    | 3   | 4   | S   | 3.0 | —     | `features/analytics/capture.ts:56` `BOT_UA` contains `snapchat`. 250 of 1,884 page views have a junk locale                                                                                                                                                                                                 |
| R3  | Arabic-only host can apply and keep a profile                                               | Host       | 3   | 5   | S   | 3.0 | 🧑‍⚖️    | `features/host-applications/schemas.ts:38` and `features/host-profile/schemas.ts:14` require `bioEn` of at least 40 characters, while `bioAr` is optional. The Arabic label reads "النبذة (بالإنجليزية)" (`messages/ar.json:671`)                                                                           |
| R4  | Dependabot + scheduled, separate audit job                                                  | Founder    | 3   | 5   | S   | 3.0 | —     | No `.github/dependabot.yml`. `ci.yml` has no `schedule:`. The audit step at `ci.yml:26` blocked 4 of 15 runs, including bug-fix batch `c9460d9`                                                                                                                                                             |
| R5  | Zero-result recovery: "remove one filter" suggestions                                       | Guest      | 3   | 4   | S   | 3.0 | —     | 58% of searches were zero-result before the pause, 76% after. The empty state only offers a full reset (`app/[locale]/(site)/experiences/(catalog)/page.tsx` ~269-290). OPS_AUDIT §8 item, still open                                                                                                       |
| R6  | Refund-timing promise + overdue alert                                                       | Guest      | 3   | 4   | S   | 3.0 | 🧑‍⚖️    | Copy promises "a few business days" (`messages/en.json:3270`). The 2 manual bank refunds took about 20 and 41 days (trust reviewer). Only one `refund_due` alert is sent, with no follow-up                                                                                                                 |
| R7  | Founder morning digest in Arabic on WhatsApp; daily report stops inflating the badge        | Founder    | 3   | 4   | S   | 3.0 | 🔑    | 8 unacknowledged `support_daily_report` rows make up the entire admin badge. 0 `admin_alert` WhatsApp deliveries ever (`ADMIN_ALERT_WHATSAPP` path, `lib/admin-alerts.ts:166-187`)                                                                                                                          |
| R8  | Production error visibility: Sentry DSN, uptime monitor on `/api/health`                    | Founder    | 3   | 4   | S   | 3.0 | 🔑🧑‍⚖️  | Audit §9.3 C4: no DSN in production. `lib/config-check.ts` does not check `SENTRY_DSN`. No monitor polls `/api/health`                                                                                                                                                                                      |
| R9  | PDPL: clear guest refund bank details after settlement                                      | Guest      | 3   | 4   | S   | 3.0 | —     | `features/bookings/lib/refund-bank-core.ts:26` and `cancel-core.ts:174` never null the fields. 1 settled refund still holds them                                                                                                                                                                            |
| R10 | Payout-account change protection                                                            | Host       | 3   | 4   | S   | 3.0 | 🔑🧑‍⚖️  | `features/host-earnings/actions.ts:32-89` changes the IBAN with an OTP only. No notice to the host, and `markHostPaid` does not read `payout_iban_events`                                                                                                                                                   |
| R11 | **Host payouts last mile**: IBAN chase, aging alert, bank reference, "you are owed" message | Host       | 5   | 5   | M   | 2.5 | 🔑🧑‍⚖️  | 0 payouts ever. SAR 4,810 owed since 2026-06-02 to 2 hosts with no IBAN. Mark-paid takes only `hostId` and `expectedAmountSar` (`features/admin/payouts/actions.ts:49-53`), so `payouts.bank_reference` is never written. The only IBAN prompt is on `/host` (`app/[locale]/host/(dashboard)/page.tsx:183`) |
| R12 | Booking-funnel instrumentation + internal-traffic flag                                      | Founder    | 4   | 4   | M   | 2.0 | 🗄    | Enum `analytics_event_type` has only 3 values (`db/schema.ts:1645`). There is no step between experience view and booking. 125 bookings all-time came from 13 guests, with test traffic mixed in                                                                                                            |
| R13 | Pending applicant can add and fix KYC documents in place                                    | Host       | 4   | 5   | M   | 2.0 | —     | A pending application renders a read-only status page (`app/[locale]/(site)/host/apply/page.tsx:54`). Both pending applications have 0 documents and are 104 and 135 days old. `approveApplication` refuses them as `documents_incomplete`. OPS_AUDIT P0-3(a), still open                                   |
| R14 | Verified-badge integrity: legacy hosts through KYC, badge backed by evidence                | Host/Guest | 4   | 5   | M   | 2.0 | 🧑‍⚖️    | 2 verified hosts have no approved application and no KYC documents. "Verified {date}" uses the join date (`app/[locale]/(site)/hosts/[slug]/page.tsx:228`)                                                                                                                                                  |
| R15 | Paused listing shows a "resting" page + notify-me instead of a 404                          | Guest/Host | 4   | 4   | M   | 2.0 | 🧑‍⚖️    | `loadDetailBySlug` filters `status = 'live'` (`features/experiences/queries.ts:247`). All 8 listing URLs, including the Snapchat campaign landing, now 404                                                                                                                                                  |
| R16 | Review moderation trail + published review policy                                           | Guest      | 3   | 5   | M   | 1.5 | 🗄🧑‍⚖️  | `setReviewHidden` is a bare update with no actor or reason (`features/admin/reviews/actions.ts:42`). The only hidden review is the only negative one (2★). Hiding it moves the public average from 4.00 to 4.67                                                                                             |
| R17 | Admin can reschedule for a guest + edit contact phone                                       | Admin      | 3   | 4   | M   | 1.5 | 🧑‍⚖️    | `RescheduleBookingCoreInput.actor` is `'guest' \| 'agent'` (`features/bookings/lib/reschedule-core.ts:48`), so the human the agent escalates to cannot move a date                                                                                                                                          |
| R18 | Raise coverage floor + per-folder floors on money paths; `fetch_types: false`               | Platform   | 2   | 5   | S   | 2.0 | —     | Floor 20/15/15/20 vs actual 40.7/30.7/31.1/41.5. 23.5% of `gharmish_app` statements are the postgres.js type lookup (`pg_stat_statements`, engineering reviewer)                                                                                                                                            |
| R19 | DB-mode e2e through pay → confirm → cancel → refund                                         | Platform   | 3   | 4   | M   | 1.5 | —     | `e2e/db/booking.spec.ts` stops at "request submitted" (TEST-09)                                                                                                                                                                                                                                             |
| R20 | Chargeback notification handling                                                            | Admin      | 3   | 3   | M   | 1.5 | 🔑    | `app/api/webhooks/hyperpay/route.ts:143-144` treats only `DB` as a capture. A chargeback is silently ignored                                                                                                                                                                                                |

Dropped or merged: the women-only relaunch (operational input to #9 and listed under Decisions), the host-pipeline SLA (#10), the waitlist (#11), the zero-live alert and pause reason (#9), refund automation (owner decision), the cron run ledger and analytics roll-ups (audit §6 roadmap), and ticket analytics (3 tickets ever).

Correction to the reviewers: new `admin_alerts` kinds do **not** need a migration. `kind` is `text({ enum: ADMIN_ALERT_KINDS })` (`db/schema.ts:2213`), which is a TypeScript-only enum.

## Themes

1. **Pay and trust the hosts we have** (R11, R14, R10): supply cannot come back while existing hosts have never been paid and the Verified badge has no evidence behind it.
2. **Unblock new supply** (R3, R13): the apply flow should work for an Arabic-only Aseeri host and be finishable without admin help. This complements #10, which covers review speed and nudges.
3. **Convert the demand that arrives** (R1, R15, R5, R6): Arabic WhatsApp recovery, no dead-end URLs, recovery from zero results, honest refund timing.
4. **See the business** (R12, R2, R7, R8): a funnel that reaches payment, clean traffic, and a founder digest and error tracking that actually reach the founder.
5. **Platform safety net** (R4, R18, R19, R9, R16, R17): automated updates, a coverage ratchet, PDPL hygiene, and moderation and admin tooling.

The plan serves both sides: Now has 3 host items, 2 guest/founder items and 1 platform item.

## Roadmap

### Now (weeks 1–2, alongside the PM Top 3 #9 #10 #11)

| #   | Item                                                           | Theme | Size | Depends on                                                      | Flags | Issue  |
| --- | -------------------------------------------------------------- | ----- | ---- | --------------------------------------------------------------- | ----- | ------ |
| N1  | Host payouts last mile (R11)                                   | 1     | M    | IBAN-decrypt bug fix (handed to the bug routine, below)         | 🔑🧑‍⚖️  | see PR |
| N2  | Arabic WhatsApp template coverage + guard (R1)                 | 3     | S    | —                                                               | 🔑    | see PR |
| N3  | Booking-funnel instrumentation + clean traffic (R12 + R2)      | 4     | M    | —                                                               | 🗄    | see PR |
| N4  | Host application: Arabic-only + finish KYC in place (R3 + R13) | 2     | M    | —                                                               | 🧑‍⚖️    | see PR |
| N5  | Verified-badge integrity for legacy hosts (R14)                | 1     | M    | Shares the KYC upload with N4. Should land before the #9 relist | 🧑‍⚖️    | see PR |
| N6  | Dependabot + scheduled audit job (R4)                          | 5     | S    | —                                                               | —     | see PR |

Capacity note: N2 and N6 are under a day each. N1, N4 and N5 overlap in files (`features/host-applications`, `features/host-earnings`) and should run one after another, not in parallel sessions.

### Next (weeks 3–6)

| #   | Item                                                             | Theme | Size | Depends on                                 | Flags |
| --- | ---------------------------------------------------------------- | ----- | ---- | ------------------------------------------ | ----- |
| X1  | Paused listing "resting" page + notify-me (R15)                  | 3     | M    | #11 waitlist table (needs `experience_id`) | 🗄🧑‍⚖️  |
| X2  | Zero-result "remove one filter" suggestions (R5)                 | 3     | S    | —                                          | —     |
| X3  | Refund-timing promise + overdue alert (R6)                       | 3     | S    | —                                          | 🧑‍⚖️    |
| X4  | Founder Arabic WhatsApp digest; report rows leave the badge (R7) | 4     | S    | —                                          | 🔑    |
| X5  | Production error visibility (R8)                                 | 4     | S    | —                                          | 🔑🧑‍⚖️  |
| X6  | Review moderation trail + policy (R16)                           | 5     | M    | —                                          | 🗄🧑‍⚖️  |
| X7  | Admin reschedule + contact-phone edit (R17)                      | 5     | M    | —                                          | 🧑‍⚖️    |
| X8  | Payout-account change protection (R10)                           | 1     | S    | N1                                         | 🔑🧑‍⚖️  |
| X9  | PDPL refund bank-detail retention (R9)                           | 5     | S    | —                                          | —     |
| X10 | Coverage ratchet + `fetch_types: false` (R18)                    | 5     | S    | —                                          | —     |

### Later (parked, with the trigger that would promote each)

- **R19 DB-mode e2e money journey.** Promote when the next payment-path change is planned.
- **R20 Chargebacks.** Promote on the first chargeback or once HyperPay confirms which notifications the account sends.
- **Per-booking delivery timeline + resend on `/admin/bookings/[id]`.** Promote when support volume exceeds about 10 tickets a week (3 ever today).
- **Settings audit trail (`platform_settings_events`).** Promote at ZATCA registration.
- **Wallet ledger append-only trigger + daily integrity check.** Promote when wallet credit exceeds SAR 1,000 (SAR 190 today).
- **"Next available" date on experience cards.** Promote once 5 or more listings are live.
- **Arabic `llms.txt` with booking facts.** Promote when chatgpt.com referrals exceed 20 a month (6 in 28 days).
- **Seasonal bookable window instead of pausing.** Promote if the founder confirms the October pauses were seasonal.
- **/hosting take-home calculator.** Promote after the founder decides whether to publish 15%.
- **Host sign-off on admin-created listings.** Promote when the next co-created listing is planned.
- **Share listing-form sections host↔admin; detail-page view-model; split `db/schema.ts`.** Promote when the next listing-field change lands. Each is M and engineering-only.

## Build cards

### N1 — Host payouts last mile

- **Goal:** Every host who is owed money knows it, the admin sees how old the debt is, and every manual transfer is recorded with its bank reference.
- **Why now:** 0 payouts have ever run. 26 bookings worth SAR 4,810 gross have been owed since 2026-06-02 to 2 hosts, and neither has an IBAN, so `markHostPaid` refuses them as `no_iban`. These same hosts own all 8 paused listings. Relisting (#9) before paying them is a retention and trust risk.
- **Scope, in:**
  - a weekly maintenance pass;
  - a new alert kind `payout_overdue`;
  - a `bankReference` field on Mark-paid;
  - an "oldest owed" figure on `/admin/payouts`;
  - a WhatsApp/email "you are owed SAR X, add your IBAN" message;
  - a next-transfer line on `/host/earnings`.
- **Scope, out:** automated bank transfers (the audit §6 "Payout automation" item) and any change to commission.
- **Approach:**
  - `features/maintenance/passes/finance.ts`: a weekly pass. For each host whose owed balance is above 0 and who has no IBAN, send `host_payout_owed` (deduped weekly through `notification_deliveries.dedupe_key`). Raise `payout_overdue` when the oldest owed booking is more than N days old (founder sets N; suggested 14).
  - `db/schema.ts` `ADMIN_ALERT_KINDS`: add `payout_overdue`. This is TS-only and needs no migration.
  - `features/admin/payouts/actions.ts` `markPaidSchema`: add an optional `bankReference` (trimmed, max 64) and write it to `payouts.bank_reference`.
  - `app/[locale]/admin/payouts/page.tsx` + `mark-paid-button.tsx`: show the reference input and an "oldest owed: N days" column.
  - `app/[locale]/host/(dashboard)/earnings/page.tsx`: show what is owed, the blocker (no IBAN / below threshold) and the next transfer date.
  - `lib/notifications/whatsapp/templates/host.ts` + registry: a new `host_payout_owed` template in ar and en; sync with `pnpm whatsapp:templates`.
  - `messages/{ar,en}.json`.
- **Acceptance criteria:**
  - [ ] A host with an owed balance and no IBAN gets at most one reminder per 7 days, on the channels their notification settings allow.
  - [ ] `payout_overdue` is raised once while unacknowledged and is not duplicated.
  - [ ] Mark-paid stores `bank_reference`, and the host statement (`features/host-earnings/queries.ts:314`) shows it.
  - [ ] `/admin/payouts` shows the oldest-owed age per host.
  - [ ] Unit tests cover the pass (dedupe, threshold) and the action (zod, echoed `values`). `pnpm scan` is green.
- **Arabic/RTL/Saudi:** Arabic-first, warm and plain copy in riyals with Western digits per BRIEF §4. IBAN format `SA` + 22. Sends respect Riyadh quiet hours. WhatsApp is the primary channel.
- **Metric:** owed-and-unpaid SAR, plus the age of the oldest owed booking. Target: SAR 0 older than 14 days by 2026-11-20. Query: `select sum(total_amount), min(created_at) from bookings where status='completed' and payment_status='paid' and payout_id is null`.
- **Size and dependencies:** M. The IBAN-decrypt fix (bug hand-off below) must land before the first Mark-paid.
- **Risks:** Meta template approval lead time. Some of the 26 bookings are tests under SAR 50, so the founder should void or confirm them before the first transfer.

### N2 — Arabic WhatsApp template coverage + guard

- **Goal:** Every guest payment message that has an English WhatsApp template also sends in Arabic, and a missing locale raises an alert within an hour.
- **Why now:** In the last 28 days, 4 of 4 Arabic `booking_awaiting_payment` WhatsApp sends failed ("no approved content SID for template/locale"). This happened at the pay step, where most real bookings are lost. 76 of 82 searches are Arabic.
- **Scope, in:**
  - set the missing Arabic SIDs in `TWILIO_WHATSAPP_CONTENT_SIDS` (a founder/env step);
  - a config-check rule that every registry template has both `ar` and `en` SIDs;
  - a coverage grid on `/admin/dev/whatsapp-preview`.
- **Scope, out:** new templates and copy changes.
- **Approach:**
  - Run `pnpm whatsapp:templates status` and add the approved `booking_awaiting_payment` and `booking_payment_reminder` Arabic SIDs in Vercel production.
  - `features/maintenance/passes/config.ts`: iterate `lib/notifications/whatsapp/registry.ts` and raise `config_missing` with detail `{ template, locale }` for every missing pair.
  - The preview page shows per template × locale whether a SID is configured, plus 7-day sent and failed counts from `notification_deliveries`.
- **Acceptance criteria:**
  - [ ] A test in which the registry has an `en` SID but no `ar` SID produces exactly one `config_missing` alert naming the pair.
  - [ ] Production: 0 `failed` deliveries with "no approved content SID" over 7 days after the env change.
  - [ ] The grid renders in RTL.
- **Arabic/RTL/Saudi:** Meta approves each language separately, so the Arabic variant can fail on its own. This guard catches that.
- **Metric:** `select count(*) from notification_deliveries where status='failed' and error like 'no approved content SID%' and created_at > now()-interval '7 days'` should be 0.
- **Size and dependencies:** S. None.
- **Risks:** If the Arabic template was never submitted, Meta approval takes 1–3 days.

### N3 — Booking-funnel instrumentation + clean traffic

- **Goal:** The founder can see every step from listing view to paid, by locale and source, without test or scanner traffic.
- **Why now:** Listing view → booking start is 2.1% (378 → 8), with nothing to show where people drop. 13% of page views are scanner probes. Snapchat in-app visits are probably being dropped as bots (`capture.ts:56`). Test bookings dominate "paid".
- **Scope, in:**
  - new event types `booking_started`, `pay_view`, `paid`;
  - a `hasLocale` guard in `record()`;
  - remove `snapchat` from `BOT_UA` once the user agent is confirmed;
  - page-view tracking on `/host/apply` and `/host/apply/submitted`;
  - `is_internal` on `experiences` and on the guest profile, honoured by admin metrics.
- **Scope, out:** session IDs and cookies (consent rules), and any new analytics vendor.
- **Approach:**
  - `db/schema.ts` `analyticsEventTypeEnum`: add 3 values, then `pnpm db:generate` (migration). Add the `is_internal boolean default false` columns.
  - `features/analytics/capture.ts`: the guard and the UA change.
  - Server-side `record()` calls in `features/bookings` (request step), on the `/book/[reference]/pay` page, and in `features/payments/settle.ts` on the paid flip.
  - `features/admin/dashboard/metrics-queries.ts`: a funnel tile that excludes internal rows.
- **Acceptance criteria:**
  - [ ] Each new event is written exactly once per booking (tests).
  - [ ] Scanner paths (e.g. `/xmlrpc.php`) write no row.
  - [ ] A Snapchat in-app UA is recorded, and the Snap preview crawler (`bot`) is not.
  - [ ] The admin funnel tile matches a hand-run SQL query on seed data.
  - [ ] `pnpm db:preflight` passes before deploy.
- **Arabic/RTL/Saudi:** Split every step by `locale`. Snapchat is the main paid social channel in KSA.
- **Metric:** funnel completeness, meaning every paid booking in the last 7 days has `booking_started`, `pay_view` and `paid` events (target 100%), and a clean page-view share of at least 98%.
- **Size and dependencies:** M. Needs a migration.
- **Risks:** Enum additions must be applied before the deploy (CLAUDE.md preflight rule).

### N4 — Host application: Arabic-only + finish KYC in place

- **Goal:** An Arabic-only host can apply, and a pending applicant can upload missing or rejected documents without being rejected and starting again.
- **Why now:** The apply and profile schemas require an English bio (`features/host-applications/schemas.ts:38`, `features/host-profile/schemas.ts:14`). Both pending applications are stuck at 0 documents after 104 and 135 days, and neither the applicant nor the admin can move them (`documents_incomplete`). Distinct from #10, which covers SLA and nudges.
- **Scope, in:**
  - in both schemas, require at least one bio of 40+ characters in either language (`superRefine`);
  - fix the Arabic label at `messages/ar.json:671`;
  - an upload section on the pending status page for missing or rejected required documents.
- **Scope, out:** Nafath, and auto-translating bios.
- **Approach:**
  - `features/host-applications/schemas.ts` and `features/host-profile/schemas.ts`.
  - `app/[locale]/(site)/host/apply/page.tsx`: under the status surface, render a document form when `status='pending'` and any required document is missing or rejected.
  - Reuse the per-document inputs and carry-over logic in `features/host-applications/actions.ts` (~167-182), and add an `addApplicationDocuments` action that uses `useActionState` and never throws.
- **Acceptance criteria:**
  - [ ] An Arabic-only bio passes and an empty pair fails, in both schemas (tests).
  - [ ] A pending applicant uploads a missing ID. The admin can then approve without a `documents_incomplete` refusal.
  - [ ] A rejected document can be replaced, and the replacement resets that document's review state.
  - [ ] An `host_application_submitted`-style alert fires on resubmission.
- **Arabic/RTL/Saudi:** Arabic-first labels. Saudi documents (IBAN letter, freelance permit, commercial registration) often arrive in stages.
- **Metric:** pending applications older than 14 days with 0 documents (target 0). Median days from application to decision, from `host_applications.reviewed_at - created_at`.
- **Size and dependencies:** M. None.
- **Risks:** The founder must decide who writes the English bio for Arabic-only hosts (the partnerships team at approval, or Claude-written per the waived rule).

### N5 — Verified-badge integrity for legacy hosts

- **Goal:** The public "Verified" badge appears only for hosts with recorded KYC evidence and shows the real approval date.
- **Why now:** 2 of 4 verified hosts have no application and no KYC documents, yet carry the badge. Its copy claims "We reviewed {host}'s national ID" (`messages/en.json:3789`). "Verified {date}" uses the join date (`app/[locale]/(site)/hosts/[slug]/page.tsx:228`). These are the hosts whose listings #9 would relist.
- **Scope, in:**
  - a `/host/verify` flow that reuses N4's document sections, prefilled from the host record, and creates an application linked to the existing host;
  - IBAN capture in the same flow (feeds N1);
  - the badge gated on an approved application, with the approval date shown.
- **Scope, out:** tourism-licence display (Later) and Nafath.
- **Approach:**
  - New page under `app/[locale]/host/(dashboard)/verify/`.
  - `features/host-applications/actions.ts`: a `submitVerification` action.
  - The badge query in `features/hosts/queries.ts` and the host profile page.
- **Acceptance criteria:**
  - [ ] A host with no approved application shows no badge (or a founder-chosen "Partner" label).
  - [ ] Approving a verification application shows the badge with `reviewed_at`.
  - [ ] Both legacy hosts receive one notification linking to `/host/verify`.
- **Arabic/RTL/Saudi:** "موثّق" must mean what it says. Family audiences and women-only bookings rely on it.
- **Metric:** verified hosts without an approved application (target 0). `select count(*) from hosts h where verification_status='verified' and not exists (select 1 from host_applications a where a.user_id=h.user_id and a.status='approved')`. Today: 2.
- **Size and dependencies:** M. Builds on N4's upload component.
- **Risks:** Removing the badge from the only active partners before relisting. Founder decision on a grace label.

### N6 — Dependabot + scheduled audit job

- **Goal:** New advisories are found on a schedule and arrive as PRs, instead of blocking unrelated bug-fix pushes.
- **Why now:** All 4 of the last 15 red CI runs failed only at `pnpm audit --prod --audit-level=high` (`ci.yml:26`). Three reactive dependency commits landed in 90 days. Audit §6 "Dependency automation" is still open on the automation half.
- **Scope, in:**
  - `.github/dependabot.yml` (npm weekly with grouped minor/patch updates, plus github-actions);
  - move the audit into its own `audit` job with `schedule: cron '0 2 * * *'`;
  - `concurrency` and `timeout-minutes` on the jobs.
- **Scope, out:** major upgrades (TypeScript 7, Sentry 11, Vitest 5, ESLint 10).
- **Acceptance criteria:**
  - [ ] A test push with a known advisory runs tests and reports the audit separately.
  - [ ] The scheduled run appears in Actions.
  - [ ] The CLAUDE.md deploy rule names the job that must be green.
- **Arabic/RTL/Saudi:** n/a.
- **Metric:** share of red CI runs caused only by the audit, over the next 30 runs (target 0, from 4 of 15).
- **Size and dependencies:** S. None. Dependabot is built into GitHub and needs no new package.
- **Risks:** Dependabot PR volume, mitigated by grouping.

### X1 — Paused listing "resting" page

- **Goal:** A paused listing URL shows a branded noindex page with host, reviews and "notify me when it returns", instead of a 404.
- **Why now:** All 8 listing URLs 404 today, including the Snapchat campaign landing, TikTok shares, saved listings and rebook emails.
- **Scope:**
  - in: a read for `status='paused'` only;
  - in: a page variant with `robots: noindex`;
  - in: the notify-me form from #11 with `experience_id`;
  - out: draft and archived listings.
- **Approach:** `features/experiences/queries.ts` gets a `getPausedDetailBySlug`. `app/[locale]/(site)/experiences/[slug]/page.tsx` branches to a `RestingListing` server component. The #11 table gains `experience_id` (migration).
- **Acceptance criteria:**
  - [ ] A paused slug returns 200 with noindex and a signup form.
  - [ ] A draft or archived slug still 404s.
  - [ ] Signups are attributed to the experience.
- **Arabic/RTL/Saudi:** Aseer is seasonal, so the copy should read as "resting", not "gone".
- **Metric:** notify-me signups per paused-page view, from `analytics_events` plus the waitlist table.
- **Size:** M. Depends on #11.
- **Risks:** SEO choice: noindex keeps it out of the index, while 200 keeps backlinks alive. Founder decides.

### X2 — Zero-result "remove one filter" suggestions

- **Goal:** When filters match nothing but the catalog has supply, offer the 1–3 single-filter removals that would return results, with counts.
- **Why now:** 26 of 45 searches (58%) were zero-result before the pause. The empty state only offers a full reset.
- **Approach:** In `app/[locale]/(site)/experiences/(catalog)/page.tsx`, in the "no results, catalog not empty" branch, compute counts with the existing `matchesCriteria` (`features/experiences/search.ts:290`) and render a small server component with links.
- **Acceptance criteria:**
  - [ ] Unit test: for criteria {nature, originals}, the suggestion that drops "originals" shows the correct count.
  - [ ] No suggestion is offered when the catalog itself is empty (#11 handles that case).
- **Arabic/RTL/Saudi:** Arabic filter labels, logical spacing.
- **Metric:** share of zero-result searches followed by a non-zero search in the same hour (needs N3), or simply the zero-result rate.
- **Size:** S. None. **Risks:** low.

### X3 — Refund-timing promise + overdue alert

- **Goal:** Guests are promised a concrete refund window, and the admin is alerted when it is about to be missed.
- **Why now:** The 2 manual bank refunds took about 20 and 41 days against a "few business days" promise.
- **Approach:**
  - Add a `refund_overdue` kind (TS-only).
  - The hourly pass in `features/maintenance/passes/finance.ts` raises it when the refund bank details are more than N business days old (Sun–Thu, Riyadh) and the refund is not settled.
  - Update `messages/{ar,en}.json` keys `doneRefundPending` and friends with the number N.
- **Acceptance criteria:**
  - [ ] Tests for the business-day calculation over a Friday/Saturday weekend.
  - [ ] One alert per booking while unacknowledged.
- **Metric:** median days from refund-bank-details submitted to refund settled (target ≤ N).
- **Size:** S. Founder sets N. **Risks:** none.

### X4 — Founder Arabic WhatsApp digest

- **Goal:** One Arabic WhatsApp message each morning with the numbers that need attention, sent only when something is non-zero. The daily report no longer inflates the admin badge.
- **Why now:** The 8-item badge is made up entirely of `support_daily_report` rows. 0 admin WhatsApp alerts have ever been sent. Average acknowledgement time is 59.5 hours.
- **Approach:**
  - Set `ADMIN_ALERT_WHATSAPP` in Vercel and add `ADMIN_ALERT_LOCALE` (default `ar`).
  - `features/support-agent/report.ts` adds payouts owed, refunds due, pending applications and reviews, failed deliveries and live listings (the counts in `features/admin/dashboard/queries.ts:127-168`).
  - Exclude `support_daily_report` from `features/admin/dashboard/nav-counts.ts`.
- **Acceptance criteria:**
  - [ ] An all-zero day sends nothing.
  - [ ] The badge excludes report rows.
  - [ ] A test covers the Arabic render.
- **Metric:** mean time to acknowledge actionable alerts (target < 12 h, from 59.5 h).
- **Size:** S. Flags: 🔑 Vercel env and template approval.

### X5 — Production error visibility

- **Goal:** Production errors are grouped and retained, and an outage pages the founder within 5 minutes.
- **Why now:** No Sentry DSN is set in production (audit §9.3 C4). Vercel logs are short-lived. Nothing polls `/api/health`.
- **Approach:**
  - Founder: create a Sentry project (free tier) and set `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN`.
  - Add `SENTRY_DSN` to `lib/config-check.ts`.
  - Point an uptime monitor at `https://gharmish.com/api/health`.
- **Acceptance criteria:**
  - [ ] A test error from a preview appears in Sentry with release and environment.
  - [ ] `config_missing` fires when the DSN is absent in production.
- **Metric:** a Sentry issue exists for every Vercel runtime error group over 7 days.
- **Size:** S. Flags: 🔑🧑‍⚖️.

### X6 — Review moderation trail + policy

- **Goal:** Every hide or unhide records who did it and why, and guests can read a short review policy.
- **Why now:** The only hidden review is the only negative one, and hiding it moves the public average from 4.00 to 4.67, with no record of why.
- **Approach:**
  - New `review_moderation_events` table (migration).
  - `features/admin/reviews/actions.ts` requires a reason code (`abusive`, `personal_data`, `off_topic`, `not_a_guest`).
  - Add a policy section on `/trust-and-safety` in ar and en.
- **Acceptance criteria:**
  - [ ] Hiding without a reason is refused (zod).
  - [ ] Events appear on `/admin/activity`.
  - [ ] The policy page renders in both locales.
- **Metric:** hidden reviews with a recorded reason (target 100%).
- **Size:** M. Flags: 🗄🧑‍⚖️ (policy wording; re-check the existing hidden review).

### X7 — Admin reschedule + contact-phone edit

- **Goal:** The human support agent can do what the WhatsApp bot can: move a booking date and fix a contact number.
- **Approach:**
  - `features/bookings/lib/reschedule-core.ts`: add `actor: 'admin'` with an `overrideCutoff` flag that skips only `window_passed` and `limit_reached`, never capacity.
  - Add the action and UI on `/admin/bookings/[id]`, and write an audit row.
  - Make `bookings.contact_phone` editable with E.164 validation.
- **Acceptance criteria:**
  - [ ] Capacity is still enforced (test).
  - [ ] An audit row is written.
  - [ ] The guest is notified through the existing reschedule notification.
- **Metric:** escalated conversations that end without a resolution action.
- **Size:** M. Founder decision: does an admin move use up the guest's one free reschedule?

### X8 — Payout-account change protection

- **Goal:** An IBAN change is announced to the host on every channel, and Mark-paid waits 72 hours after a change.
- **Approach:**
  - `features/host-earnings/actions.ts`: after the update, send `host_payout_account_changed` (email + WhatsApp).
  - `features/admin/payouts/actions.ts` refuses `iban_recently_changed` within 72 hours, based on `payout_iban_events`.
- **Acceptance criteria:**
  - [ ] Tests for the refusal window.
  - [ ] Notification dedupe.
- **Metric:** n/a (control). **Size:** S. Depends on N1. Flags: 🔑🧑‍⚖️ (template, waiting period).

### X9 — PDPL refund bank-detail retention

- **Goal:** Guest refund bank fields are cleared 30 days after the refund settles.
- **Approach:** add a `features/maintenance/passes/retention.ts` step that nulls the bank fields where `refunded_at < now() - 30 days`, and one log line per run (counts only).
- **Acceptance criteria:**
  - [ ] Tests against the fake database.
  - [ ] Production count of settled refunds still holding bank details: 0 after the first run.
- **Size:** S. No migration.

### X10 — Coverage ratchet + DB client round trip

- **Goal:** CI fails on a real coverage regression, and fresh connections stop paying for a type lookup.
- **Approach:**
  - `vitest.config.ts`: global thresholds about 39/29/29/40; per-glob floors for `features/payments/**`, `features/wallet/**` and `features/bookings/lib/**` at current minus 2; narrow `include` to `**/*.{ts,tsx}`.
  - `lib/db.ts`: `fetch_types: false`, with a pg-proxy test that array columns still parse.
- **Acceptance criteria:**
  - [ ] `pnpm test:coverage` passes at the new floors.
  - [ ] Array columns round-trip.
  - [ ] The `pg_type` lookup share in `pg_stat_statements` falls (from 23.5%).
- **Size:** S.

## Decisions needed from the founder

1. **Pay the hosts.** When will the first transfer to the 2 owed hosts happen, and what cadence follows (weekly or monthly)? Which of the 12 bookings under SAR 50 are tests to void? (N1)
2. **Verified badge for legacy partners.** Hide it, or show a "Partner" label until KYC is on file? (N5)
3. **English bio for Arabic-only hosts.** Who writes it? (N4)
4. **WhatsApp templates.** Approve submitting `host_payout_owed` and any missing Arabic SIDs. (N1, N2)
5. **Error tracking.** Sentry free tier or a Vercel log drain, plus an uptime monitor. (X5)
6. **Refund promise.** How many business days should guests be told? (X3)
7. **Women-only first.** It drew 191 of 378 listing views (51%) and 4 of 5 real booking starts in 28 days. Relist the two women-only listings first under #9, and point paid social at `/ar/experiences/women-only` rather than a single listing. This links to PR #1.
8. **Paused-page SEO.** Should paused listings return 200 noindex or stay 404? (X1)

## Handed to the bug routine

- `features/admin/payouts/actions.ts:169` takes `host.payoutIban.slice(-4)` of the **encrypted** IBAN, so the first payout email would show ciphertext. Fix: `decryptPii(...)`. This blocks N1's first Mark-paid.
- One booking is marked `refunded` with no refund method, amount or date. Worth one look; it skews refund metrics.

## Method and limitations

- **Access check:** git push (dry run), GitHub issues and PRs, Supabase `select 1` and the Vercel project all succeeded.
- **Reviewers:** five read-only reviewers covered guest growth, host supply, ops/admin, engineering health and trust/compliance. I re-verified the top items myself:
  - **Production queries:** payouts and owed amounts, notification failures, host/application provenance, reviews, the analytics schema, and funnel counts.
  - **Code reads:** the bio schemas, the pending-application page, the paused-listing 404 filter, `BOT_UA`, `setReviewHidden`, the reschedule actor, the mark-paid schema, the IBAN slice, `ci.yml`, `vitest.config.ts` and the alert-kind column type.
- **Not independently verified (reviewer-reported):**
  - refund durations (20 and 41 days);
  - the 59.5 h acknowledgement average;
  - the CI 4-of-15 audit failures;
  - the `pg_stat_statements` shares;
  - the Snapchat UA behaviour (the first step of N3 confirms it).
- **Corrections to the routine brief:** `analytics_events` has a `type` column, not `event`, and nothing records booking start, pay or paid events.
- **Missing inputs:** `docs/research/` does not exist, so no market-research report was available. `docs/product/weekly/` exists only on the unmerged PM branch (PR #12), and only one report was read. The bug log and the health log each have one entry, so there is no trend yet.
- **Small samples:** 8 bookings in 28 days, mostly test traffic. Treat every ratio as directional.
