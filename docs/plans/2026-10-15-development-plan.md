# Gharmish development plan — 2026-10-15

> Six-week horizon: 2026-10-15 → 2026-11-26. Written by the Development Planner routine, which fires on the 1st and 15th.
> It complements the Nightly Bug Hunter (#7), the weekly PM routine (#9 #10 #11) and the market research (2026-10-12). Defects go to the bug routine. This plan covers improvements only.
> Every number comes from read-only production queries (`gharmish-experiences`), from commands run on HEAD `eca727d`, or from the file cited next to it. All scores are estimates.

## الملخص بالعربية

1. منذ الخطة السابقة (٩ أكتوبر) لم يُنجز من بنود «الآن» الستة إلا الجزء البرمجي من حماية قوالب واتساب. ذهب الأسبوع إلى ٥٦ إصلاحاً للأخطاء، وما زال ١٤ طلب دمج للإصلاحات بانتظار مراجعة المؤسس.
2. أهم اكتشاف هذه المرة: أُعيد نشر التجارب الثماني في ١٢ أكتوبر، لكن بلا أي يوم متاح للحجز. منذ ذلك اليوم: ٢٤ مشاهدة لصفحات التجارب، و١٦ بحثاً كلها بلا نتائج، وصفر حجوزات. تعرض صفحة التجربة «حجز فوري» فوق تقويم فارغ، وما زال ملف إعلانات TikTok يصف التجارب بأنها «متوفرة».
3. ما زال المستحق للمضيفين ٤٬٨١٠ ريال (إجمالي ٢٦ حجزاً) منذ يونيو، ولم يُصرف أي مبلغ بعد. لا يملك أيٌّ من المضيفَين المستحقَّين آيبان مسجّلاً، ويملكان ٧ من التجارب الثماني المنشورة.
4. «الآن» (أسبوعان): صرف مستحقات المضيفين، وصفحة تجربة صادقة حين لا تتوفر مواعيد (مع زر «اسأل عن موعد» عبر واتساب)، واقتراحات تنقذ البحث الذي بلا نتائج، وتصنيف طلبات الدمج حسب الخطورة لتسريع المراجعة، وآلة حالات موحّدة للتجارب والطلبات تمنع أكثر فئات الأخطاء تكراراً، وتحديث الحزم آلياً.
5. قرارات مطلوبة: موعد أول تحويل للمضيفين، وتاريخ فتح الحجز لكل تجربة، وسياسة مراجعة طلبات الدمج، وجعل العربية اللغة الافتراضية للزوار من السعودية.

## Carry-over from the previous plan (2026-10-09)

Of the 16 Now and Next items, 1 shipped in part and 15 have not started. All 6 Now issues (#14–#19) are still open. Over the same 6 days, 17 bug-fix PRs were merged and 22 bug issues were opened.

| Item                                               | Status                      | Evidence                                                                                                                                                                                                                                                          |
| -------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1 Host payouts last mile (#14)                    | ⛔ Not started              | Its blocker shipped: `b405a51` decrypts the IBAN hint. Still 0 rows in `payouts`. Still 26 bookings / SAR 4,810 gross owed, and 0 of the 2 owed hosts has an IBAN. `markPaidSchema` has no `bankReference`                                                        |
| N2 Arabic WhatsApp template coverage + guard (#15) | 🟡 Code shipped             | `b405a51` added `unmappedWhatsAppTemplates()` and the config pass. 0 `config_missing` alerts since 10-09. Production is not yet confirmed: there have been 0 Arabic awaiting-payment sends since. The coverage grid on `/admin/dev/whatsapp-preview` is not built |
| N3 Booking-funnel instrumentation (#16)            | 🟡 Part shipped             | `b405a51`: Snapchat in-app visits are kept and scanner locales dropped (0 scanner rows since 10-12). The `booking_started`, `pay_view` and `paid` events and the `is_internal` flag are not built                                                                 |
| N4 Arabic-only apply + KYC in place (#17)          | ⛔ Not started              | Related fixes only: `5747750` (Arabic-only inclusions) and PR #87 (over-4 MB copy). The 2 pending applications are now 109 and 141 days old, with 0 documents each                                                                                                |
| N5 Verified-badge integrity (#18)                  | ⛔ Not started              | The 2 legacy hosts with no KYC now own 7 of the 8 live listings                                                                                                                                                                                                   |
| N6 Dependabot + scheduled audit (#19)              | ⛔ Not started              | No `.github/dependabot.yml`. CI is 97 of the last 100 runs green, and all 3 red runs failed only on the audit step. The nightly hunter still reports the local `pnpm scan` audit failing (10-15)                                                                  |
| X1 Paused-listing "resting" page                   | ♻️ Superseded               | Listings are `live` with no dates, not `paused`, so X1 would never trigger. It is replaced by **D1** and **D2**                                                                                                                                                   |
| X2 Zero-result "remove one filter"                 | ⬆️ Promoted to Now (**D3**) | One impossible combination is 40 of 105 searches                                                                                                                                                                                                                  |
| X3 Refund-timing promise                           | ⛔ → Later                  | 0 refunds pending                                                                                                                                                                                                                                                 |
| X4 Founder Arabic digest                           | ⛔ → folded into **D12**    | 7 unacknowledged `support_daily_report` rows since 10-09, and nothing else                                                                                                                                                                                        |
| X5 Sentry / uptime                                 | ⛔ → Later                  | 6 nights with no runtime errors (#7)                                                                                                                                                                                                                              |
| X6 Review moderation trail                         | ⛔ → folded into **D10**    |                                                                                                                                                                                                                                                                   |
| X7 Admin reschedule                                | ⛔ → Later                  | 3 tickets ever                                                                                                                                                                                                                                                    |
| X8 Payout-account change protection                | ⛔ → Later                  | Depends on N1                                                                                                                                                                                                                                                     |
| X9 PDPL refund bank-detail retention               | ⛔ → folded into **D14**    |                                                                                                                                                                                                                                                                   |
| X10 Coverage ratchet + `fetch_types`               | ⛔ → folded into **D7**     | Floor is still 20/15/15/20 (`vitest.config.ts:55`)                                                                                                                                                                                                                |

Why so little moved: the founder's review time went to the bug pipeline. Commits in the last 30 days split 56 fix / 2 feat. **D4** and **D5** below target that directly.

## Where we are

### Engineering mix, last 30 days (102 commits on `main`)

| fix | merge | docs | chore | feat | style | refactor |
| --- | ----- | ---- | ----- | ---- | ----- | -------- |
| 56  | 30    | 8    | 4     | 2    | 1     | 1        |

- **Static checks:** typecheck 0 errors; lint 0 errors and 1 intentional warning.
- **Tests:** 192 files, 2,261 tests, all passing.
- **Coverage:** 41.68% statements, 31.74% branches, 42.52% lines. The CI floor is 20/15/15/20.
- **Lowest-covered folders (lines):**
  - `features/hosts` 0%
  - `features/experiences` 13.6%
  - `features/reviews` 15.8%
  - `features/marketing` 18.3%
  - `features/analytics` 27.6%
  - `features/admin/dashboard` 28.9%
  - `features/host-earnings` 29.1%
  - every `*/components` folder 0%
- **Dependencies:** `pnpm audit --prod` is clean today. 37 packages are outdated, 8 of them by a major version.

### Health trend (Nightly Bug Hunter #7, 10-09 → 10-15)

- **Production:** flat and green for 6 nights (no runtime errors; heartbeat, payments and alerts unchanged). No P0 or P1 for 4 nights.
- **Open bug issues:** 0 → 22. **Open bug-fix PRs:** 14. All 17 open on 10-12 were merged that day; none since.
- **The defects cluster in six seams**, each fixed one call site at a time:
  - listing status: #42 #49 #78 #79 #85
  - support-thread ownership: #30 #44 #69 #98
  - application verdicts: #43 #70 #71
  - guest-row identity: #40 #57 #68 #83
  - Riyadh time: #82
  - hold liveness: #77 #99 #100

### Funnel, last 28 days

The relist happened on 2026-10-12. The split below is at 2026-10-12 00:00 UTC, so "before" covers about 25 days and "since" about 3.

| Step                    | Before relist                          | Since relist      |
| ----------------------- | -------------------------------------- | ----------------- |
| Page views              | 1,739 (254 scanner rows, now filtered) | 134               |
| Searches (zero-result)  | 89 (70, 79%)                           | 16 (**16, 100%**) |
| Listing views           | 332 (247 Arabic)                       | 24                |
| Bookings created / paid | 7 / 3                                  | **0 / 0**         |

- **One filter combination dominates search.** `category=nature&originals=1` is 40 of 105 searches in 28 days and all 16 since the relist. It is always mobile, always Arabic, with no referrer. It can never match, because no nature listing is an Original.
- **Most traffic is untagged.** 346 of 356 listing views have no referrer. Only 22 carry `utm_source=snapchat`.
- **One listing carries the demand.** The women-only Original drew 57% of pre-relist listing views and 4 of the 7 bookings.

### Supply

| Metric                                      | Value                                                                                                                                                                                        |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Experiences                                 | 8 live, 1 draft                                                                                                                                                                              |
| **Live listings with any bookable weekday** | **0 of 8**. `availability_weekdays = '{}'` since the relist (`docs/ops/2026-10-12-relist-schedule-backup.md`)                                                                                |
| Hosts                                       | 4 verified, 1 pending, 1 suspended                                                                                                                                                           |
| Host applications                           | 3 approved, 2 pending (109 and 141 days old, 0 documents each), 1 rejected                                                                                                                   |
| Newly approved hosts                        | One went live 4 days after approval. The other has been verified for 20 days with an IBAN and 0 drafts                                                                                       |
| `/hosting` → applications                   | 164 views in 60 days (57 Arabic) → 2 applications                                                                                                                                            |
| Payouts ever                                | **0**                                                                                                                                                                                        |
| Owed to hosts                               | **26 completed, paid bookings. SAR 4,810 gross, oldest 2026-06-02, owed to 2 hosts, 0 of whom has an IBAN.** This is the gross figure. The Daily Ops Digest (#13) quotes about SAR 4,230 net |
| Future pending or confirmed bookings        | 0                                                                                                                                                                                            |

## Improvement register

- **Scoring:** Value (V) and Confidence (C) are scored 1–5. Effort (E) is S (< 1 day), M (1–3 days) or L (≥ 1 week).
- **Ratio:** V÷E, with effort weights S=1, M=2, L=4. All scores are estimates.
- **Flags:** 🗄 DB migration · 📦 new dependency · 🔑 third-party account or config · 🧑‍⚖️ founder decision.
- **Prefixes:** `C` marks items carried over from the previous plan. `D` marks new items.

| #   | Item                                                                                              | Side       | V   | C   | E   | V÷E | Flags | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------- | ---------- | --- | --- | --- | --- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D4  | PR risk labels by path + written review policy                                                    | Founder    | 4   | 4   | S   | 4.0 | 🧑‍⚖️    | 15 open PRs, 0 labels. Risk appears only as a `[high-risk]` title prefix that the bot sets for itself. The rule exists only in the routine prompts (grep finds none in the repo). Source diffs are 7–67 lines (tests excluded) on 13 of 15                                                                                                                                                                                                                                                                                                                                                   |
| C6  | Dependabot + scheduled audit job (#19)                                                            | Platform   | 3   | 5   | S   | 3.0 | —     | All 3 red runs in the last 100 failed only on `pnpm audit` (`ci.yml`). There is no `dependabot.yml`. The hunter on 10-15 reports the local audit failing again on `source-map-js`                                                                                                                                                                                                                                                                                                                                                                                                            |
| D3  | Zero-result recovery: "remove one filter" links + grey zero-count chips (was X2)                  | Guest      | 3   | 5   | S   | 3.0 | —     | 70 of 89 searches before the relist and 16 of 16 after returned 0 results. `category=nature&originals=1` is 40 of 105 searches. The empty state offers only Reset (`app/[locale]/(site)/experiences/(catalog)/page.tsx:272-293`)                                                                                                                                                                                                                                                                                                                                                             |
| D6  | One Riyadh wall-clock parse helper + one `holdState()`                                            | Platform   | 3   | 5   | S   | 3.0 | —     | `lib/riyadh-time.ts` has no instant parser. The offset is hand-rolled in `cancellation.ts:19`, `whatsapp/format.ts:21`, `availability.ts:175`, `booking-request-form.tsx:1183`, and `admin/vat/page.tsx:209`, which uses none. `wallet/actions.ts:112` parses as UTC (#82). Hold liveness is decided in 8 places: `capacity-sql.ts:35` and `availability.ts:69`, plus 6 callers (#77 #99 #100)                                                                                                                                                                                               |
| D8  | Arabic by default for visitors from Saudi Arabia                                                  | Guest      | 3   | 3   | S   | 3.0 | 🧑‍⚖️    | BRIEF §4: "default for Saudi visitors based on Accept-Language **and geo**". `lib/i18n.ts:14` has `defaultLocale: 'en'`, and `proxy.ts:13` has no country check. Home views are 1,029 en vs 179 ar (28d), but listing views are 74% Arabic. Confidence is 3 because part of the en traffic is likely automated                                                                                                                                                                                                                                                                               |
| D9  | Admin TOTP recovery codes                                                                         | Founder    | 3   | 5   | S   | 3.0 | 🗄    | 1 admin with 1 TOTP factor. Re-enrolment is refused once one is confirmed (`features/admin/mfa-actions.ts:79`), so a lost phone means "owner-assisted row deletion", i.e. SQL on production. Refunds, payouts and wallet all sit behind that one device                                                                                                                                                                                                                                                                                                                                      |
| D10 | Review provenance: gate on paid + "Verified booking" label + hide/unhide trail (absorbs X6)       | Guest      | 3   | 5   | S   | 3.0 | 🧑‍⚖️    | 3 of 4 public reviews sit on bookings that were never paid (pre-launch, May–June). `features/reviews/actions.ts:100` checks only `status === 'completed'`. `setReviewHidden` records no actor or reason                                                                                                                                                                                                                                                                                                                                                                                      |
| D11 | Legal-copy guard: terms-version hash test + privacy notice names every processor + breach runbook | Founder    | 3   | 5   | S   | 3.0 | 🧑‍⚖️    | `b341775` (10-11) changed the Credit clause, but `CURRENT_TERMS_VERSION` is still `'2026-08-02'` (`lib/legal.ts:15`); the defect itself is filed as a bug, below. The privacy provider list (`messages/en.json:4395`) omits the AI processor that the WhatsApp agent sends messages to (`features/support-agent/agent.ts`). There is no SDAIA 72-hour breach runbook in `docs/`                                                                                                                                                                                                              |
| D19 | Refund IBAN change controls                                                                       | Founder    | 3   | 4   | S   | 3.0 | 🧑‍⚖️    | `saveRefundBankDetails` (`features/bookings/lib/refund-bank-core.ts:18-44`) overwrites freely from the web and the WhatsApp agent. There is no history, no notice to the booking contact and no name check against `billedName`. Every refund is a manual transfer to a typed IBAN                                                                                                                                                                                                                                                                                                           |
| C1  | Host payouts last mile (#14)                                                                      | Host       | 5   | 5   | M   | 2.5 | 🔑🧑‍⚖️  | Unchanged for 6 days: 0 payouts, SAR 4,810 gross owed since June, 0 of 2 owed hosts with an IBAN. The relist happened before any payout                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| D1  | Honest "no open dates" listings: dead-end panel, catalogue feed, sellable count                   | Guest/Host | 5   | 5   | M   | 2.5 | 🧑‍⚖️    | All 8 live listings have 0 weekdays. 24 listing views and 0 bookings since the relist. The panel shows "Instant book — pay now" above a grey dead-end note (`features/bookings/components/booking-request-form.tsx:718-739`). The `noDates` copy promises "new dates are added regularly" (`messages/ar.json:3177`). The TikTok feed hardcodes `'in stock'` (`app/api/catalog/tiktok.csv/route.ts:62-66`, TODO). The host checklist marks "live" done on status alone (`app/[locale]/host/(dashboard)/page.tsx:146-148`). #9's planned alert counts `status='live'`, so it would stay silent |
| D2  | Seasonal "opens on" date + one-click schedule restore                                             | Host/Guest | 4   | 4   | M   | 2.0 | 🗄🧑‍⚖️  | The relist was done by wiping weekdays and backing up the schedules in a markdown file. `readiness.ts:85` requires weekdays to publish, yet all 8 live rows have none. `pauseHostExperience` (`features/host-experiences/actions.ts:738-773`) records no reason or resume date: 0 pause events ever. The horizon is 60 days (`availability.ts:48`)                                                                                                                                                                                                                                           |
| D5  | One status machine for listings and applications, with a structural test                          | Platform   | 4   | 4   | M   | 2.0 | —     | 10 status-race bugs in these two tables since 10-09 (#29 #36 #42 #43 #49 #70 #71 #78 #79 #85); 6 are still open. Unconditional writes: `host-experiences/actions.ts:565-568` (#49), `host-applications/actions.ts:427-437` (`eq(id)` only, #71). Approve always sets `live` (#79). The verified-host check is copied 3 times. Bookings already has `features/bookings/lib/transitions.ts` as the model                                                                                                                                                                                       |
| C3  | Booking-funnel instrumentation, remaining part (#16)                                              | Founder    | 4   | 4   | M   | 2.0 | 🗄    | No event exists between listing view and booking row. `/host/apply` is not tracked                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| C4  | Arabic-only apply + KYC in place (#17)                                                            | Host       | 4   | 5   | M   | 2.0 | 🧑‍⚖️    | Unchanged. New evidence: `contactEmail` is also required (`features/host-applications/schemas.ts:91`), which blocks WhatsApp-only hosts                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| C5  | Verified-badge integrity (#18)                                                                    | Host/Guest | 4   | 5   | M   | 2.0 | 🧑‍⚖️    | Badge-holders with no KYC now own 7 of 8 live listings                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| D7  | Real-Postgres race tests + coverage ratchet (absorbs X10)                                         | Platform   | 3   | 4   | M   | 1.5 | —     | `lib/test/db-fake.ts` routes by query shape and never evaluates WHERE, so a missing `eq(status, …)` still passes. Every recent race fix (`02cc986`, `a79987d`, `7820dd9`, `f3cfb19`, `c08563a`, `8a36838`) is tested by faking "0 rows". The CI `e2e-db` job already starts `postgres:16`                                                                                                                                                                                                                                                                                                    |
| D12 | Ops snapshot (one tested number set) + alert playbook + failed-deliveries view (absorbs X4)       | Founder    | 3   | 4   | M   | 1.5 | —     | The plan said SAR 4,810 (gross) and the digest says about 4,230 (net) for the same debt. Routines hand-write SQL (#8 logged `column "is_original" does not exist`). `/admin/alerts` shows raw detail with no next step (`app/[locale]/admin/alerts/page.tsx:71-135`). 13 WhatsApp failures since 08-15 were visible only through SQL                                                                                                                                                                                                                                                         |
| D16 | Versioned host services agreement, accepted before the first payout                               | Host       | 3   | 4   | M   | 1.5 | 🗄🧑‍⚖️  | Legal audit B5 is open: the 15% commission was never agreed in writing (`docs/legal/legal-audit-2026-08-02.md`). The first Mark-paid (C1) would deduct it                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D13 | Listing photo on the WhatsApp/Snap share card                                                     | Guest      | 3   | 3   | M   | 1.5 | —     | `app/[locale]/(site)/experiences/[slug]/opengraph-image.tsx` renders text only. 346 of 356 listing views arrive with no referrer, which is typical of in-app shares                                                                                                                                                                                                                                                                                                                                                                                                                          |
| D14 | PDPL data-subject tooling: export, erase/pseudonymise, refund-bank retention (absorbs X9)         | Guest      | 3   | 4   | M   | 1.5 | 🧑‍⚖️    | The privacy page promises access, copy and deletion (`messages/en.json:4405-4408`). No code erases or exports a person                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| D17 | Keep a live listing on sale while a material edit is reviewed                                     | Host       | 3   | 4   | M   | 1.5 | 🗄    | `MATERIAL_FIELDS` includes price (`features/host-experiences/actions.ts:398-414`). Any change demotes to `pending_review` (`:513-530`). HOST_LISTING_AUDIT proposed `pending_payload`, which never shipped                                                                                                                                                                                                                                                                                                                                                                                   |
| D18 | Two-stage, phone-first host application                                                           | Host       | 3   | 3   | M   | 1.5 | 🧑‍⚖️    | 164 `/hosting` views → 2 applications in 60 days. The 904-line form asks for IBAN, bank and email before any interest is recorded                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| D23 | First-listing concierge (admin builds, host signs off)                                            | Host       | 3   | 3   | M   | 1.5 | 🧑‍⚖️    | One host has been verified for 20 days with 0 drafts. The plan's parked "host sign-off on admin-created listings" trigger is now met                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| D20 | Support-agent lock owner token                                                                    | Platform   | 2   | 4   | S   | 2.0 | 🗄    | `releaseLock` clears with `eq(id)` only (`features/support-agent/agent.ts:424-427`). The take-over bugs keep recurring (#30 #44 #69 #98)                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D22 | Resolving a ticket hands the thread back to the bot                                               | Founder    | 2   | 5   | S   | 2.0 | 🧑‍⚖️    | `resolveTicket` (`features/support/actions.ts:161-225`) never resets `conversations.state`. 2 of 5 conversations are stuck in `human` with no open ticket                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D15 | VAT-readiness gate before `vat_enabled` can be saved                                              | Founder    | 2   | 4   | M   | 1.0 | 🗄🧑‍⚖️  | The invoice number is a random booking reference (`invoice/page.tsx:252`), and credit notes are `CN-{ref}`. The credit note also reverses VAT on the wallet leg (`:181-183`). Settings require only a registration number (`features/admin/settings/actions.ts:81-123`). Trailing-12-month paid volume is SAR 5,505                                                                                                                                                                                                                                                                          |
| D21 | One guest identity key for per-guest rules                                                        | Platform   | 2   | 4   | M   | 1.0 | 🧑‍⚖️    | The promo throttle is keyed on `guestId` only (`features/promo-codes/lib/throttle.ts:34`), and a signed-out booking creates a fresh row (#83)                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| D24 | Close or open a date range on the calendar                                                        | Host       | 2   | 4   | M   | 1.0 | —     | `setDayAvailability` (`features/availability/actions.ts:45`) takes one date per POST                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

**Dropped:**

- **Already tracked:** the zero-live alert and pause reason (#9, refined by D1), the host-pipeline SLA (#10), and the waitlist (#11). D1 deliberately uses WhatsApp, so it does not wait on #11's table.
- **Owner decisions:** refund automation and host insurance.
- **Too little traffic yet:** agent token logging and the near-SLA alert.
- **Proposed by reviewers:** view-models for the 1,000-line forms. Parked until the next booking-form change.

**Correction to the previous plan:** "SAR 4,810 owed" is the **gross** booking total. Hosts are owed the net. D12 makes both figures come from one tested query.

## Themes

1. **Make what is live sellable** (D1, D2, D3, D13): demand is arriving and every page leads to a dead end.
2. **Pay and trust the hosts we have** (C1, C5, D16, C4): there have still been no payouts, and the two hosts owed money now carry 7 of 8 listings.
3. **Cut the founder's review load** (D4, D5, D6, D7, D12): the bug stream is consuming the time meant for the plan. Fix whole classes, and make review cheaper.
4. **Trust and compliance basics** (D9, D10, D11, D19, D14): small, cheap items with large downside if skipped.
5. **See the business** (C3, C6, D8): the funnel, dependencies and the default language.

**Balance:** Now has 2 host-facing items (C1 and D1's host half), 2 guest items (D1, D3) and 3 founder/platform items (D4, D5, C6). Platform weight is higher than usual on purpose: the evidence says review throughput, not ideas, is the constraint.

## Roadmap

### Now (weeks 1–2, alongside the PM Top 3 #9 #10 #11)

| #   | Item                                                | Theme | Size | Depends on                                                           | Flags | Issue |
| --- | --------------------------------------------------- | ----- | ---- | -------------------------------------------------------------------- | ----- | ----- |
| 1   | C1 Host payouts last mile                           | 2     | M    | Founder: first transfer date and the 2 IBANs                         | 🔑🧑‍⚖️  | #14   |
| 2   | D1 Honest "no open dates" listings + sellable count | 1     | M    | Shares the alert definition with #9; build together                  | 🧑‍⚖️    | #101  |
| 3   | D3 Zero-result recovery                             | 1     | S    | —                                                                    | —     | #102  |
| 4   | D4 PR risk labels + review policy                   | 3     | S    | Founder approves the policy; routine prompts updated by hand         | 🧑‍⚖️    | #103  |
| 5   | D5 Listing + application status machine             | 3     | M    | Merge open PRs #89 #90 #76 first, because they touch the same writes | —     | #104  |
| 6   | C6 Dependabot + scheduled audit job                 | 5     | S    | —                                                                    | —     | #19   |

**Capacity note:** D3, D4 and C6 are under a day each. D1 and D5 both touch `features/host-experiences/actions.ts`, so do D1 first and D5 second, in one session or one after the other. C1 is mostly founder action (collect IBANs, transfer) plus about a day of code.

### Next (weeks 3–6)

| #   | Item                                                       | Theme | Size | Depends on                                  | Flags |
| --- | ---------------------------------------------------------- | ----- | ---- | ------------------------------------------- | ----- |
| X1  | D2 Seasonal "opens on" date + schedule restore             | 1     | M    | D1                                          | 🗄🧑‍⚖️  |
| X2  | C3 Funnel events, remaining part (#16)                     | 5     | M    | —                                           | 🗄    |
| X3  | C4 Arabic-only apply + KYC in place, email optional (#17)  | 2     | M    | D5 (application writes)                     | 🧑‍⚖️    |
| X4  | C5 Verified-badge integrity (#18)                          | 2     | M    | C4                                          | 🧑‍⚖️    |
| X5  | D16 Host services agreement                                | 2     | M    | Counsel draft; before the second payout run | 🗄🧑‍⚖️  |
| X6  | D6 Riyadh parse helper + `holdState()`                     | 3     | S    | Rebase PR #86 onto it                       | —     |
| X7  | D7 Real-Postgres race tier + coverage ratchet              | 3     | M    | D5 (first cases)                            | —     |
| X8  | D12 Ops snapshot + alert playbook + failed deliveries      | 3     | M    | —                                           | —     |
| X9  | D10 Review provenance + moderation trail                   | 4     | S    | —                                           | 🧑‍⚖️    |
| X10 | D11 Legal-copy guard + privacy processors + breach runbook | 4     | S    | The terms-version bug fix                   | 🧑‍⚖️    |
| X11 | D9 Admin TOTP recovery codes                               | 4     | S    | —                                           | 🗄    |
| X12 | D19 Refund IBAN change controls                            | 4     | S    | —                                           | 🧑‍⚖️    |
| X13 | D8 Arabic default for Saudi visitors                       | 5     | S    | —                                           | 🧑‍⚖️    |

### Later (parked, with the trigger that would promote each)

- **D13 Photo share card:** promote when 3 or more listings are sellable.
- **D14 PDPL tooling (+ refund-bank retention):** promote on the first data-subject request, or at 100 guests (15 today).
- **D15 VAT-readiness gate:** promote when the founder starts ZATCA registration, or when trailing-12-month paid volume passes SAR 250k (SAR 5,505 today).
- **D17 Pending version for live edits:** promote on the first price change to a listing with future bookings.
- **D18 Phone-first application:** promote once C3 tracks `/host/apply` and its conversion is measurable.
- **D23 First-listing concierge:** promote on a founder yes.
- **D20 Agent lock token:** promote on the next thread-ownership bug after D5, or above 50 conversations a month (5 ever).
- **D21 Guest identity key:** promote with the first promo campaign.
- **D22 Ticket hand-back:** promote above 5 tickets a week.
- **D24 Range calendar:** promote if hosts ask after D2.
- **X3 Refund-timing promise and X7 admin reschedule:** promote on the next bank refund, or above 5 tickets a week.
- **X5 Sentry and uptime:** promote on the first production error group the nightly hunter cannot explain from Vercel logs.
- **X8 Payout-account change protection:** promote after the first Mark-paid.
- **Unchanged from the previous plan:**
  - R19 DB e2e
  - R20 chargebacks
  - delivery timeline
  - settings audit trail (now part of D15)
  - wallet ledger trigger
  - Arabic `llms.txt`
  - `/hosting` calculator (research H1 needs the founder's 15% decision)
  - the shared listing-form split
- **"Next available date" card chip:** its trigger (5+ live) is met, but it needs D2's date model first. Fold it into D2's second step.

## Build cards

### C1 — Host payouts last mile (#14, carried over)

The build card in #14 still stands. Changes:

- **Add to scope:**
  - Show an "owed, no IBAN" banner on the admin experience page next to Publish and Relist, so a relist ahead of payment is a visible choice. This is the reviewer's "payable gate", kept as a warning, not a block.
  - Quote both gross and net on `/admin/payouts`.
- **Updated "why now":** nothing has moved in 6 days. The relist went ahead before payment. The 2 owed hosts own 7 of the 8 live listings.
- **Metric:** owed-and-unpaid net SAR older than 14 days. Target 0 by 2026-11-26.

### D1 — Honest "no open dates" listings + sellable count

- **Goal:** A guest who lands on a listing with no bookable date sees an honest state and a one-tap way to ask for a date, and the founder and host can see that "live" is not the same as "sellable".
- **Why now:**
  - Since the 2026-10-12 relist, all 8 live listings have 0 weekdays: 24 listing views, 0 bookings.
  - The panel shows the green "Instant book — pay now, your spot is confirmed instantly" note on 6 of 8 listings, above a grey paragraph promising "new dates are added regularly" (`messages/ar.json:3177`).
  - The TikTok catalogue feed says `in stock` for all of them (`app/api/catalog/tiktok.csv/route.ts:62-66`), while the page JSON-LD says `SoldOut`.
  - #9's planned zero-live alert counts `status='live'`, so it would not fire.
- **Scope, in:**
  - hide the booking-mode note when there are no dates;
  - new `noDates` copy plus an "Ask for a date on WhatsApp" link with Arabic prefilled text;
  - the TikTok feed emits `out of stock` when weekdays are empty;
  - a shared `isSellable()` (live with at least one bookable date in 14 days), used in three places: the host checklist and attention list, an admin dashboard "live but no dates" count, and #9's alert definition.
- **Scope, out:**
  - the "opens on" date (D2);
  - waitlist storage (#11);
  - a batch next-date read for cards (D2, step 2).
- **Approach:**
  - `features/bookings/components/booking-request-form.tsx:718-739`: when `noDates`, skip `modeNote` and render the new panel with a `wa.me` link built with `lib/whatsapp.ts` and `supportWhatsappE164()` (`lib/env.ts:295`), plus prefilled text naming the listing title.
  - `app/[locale]/(site)/experiences/[slug]/page.tsx`: pass `modeNote=null` when `availableDates.length === 0`.
  - `messages/{ar,en}.json`: `noDates`, `askForDate`, `askForDatePrefill`.
  - `app/api/catalog/tiktok.csv/route.ts`: `e.availabilityWeekdays.length === 0 ? 'out of stock' : 'in stock'`, and remove the TODO's first half.
  - `features/listings/lib/sellable.ts`: a pure `isSellable(row, now)` built on `isDateBookable` and `BOOKING_HORIZON_DAYS`, with tests.
  - `app/[locale]/host/(dashboard)/page.tsx:146-148`: "live" is done only when sellable. Add an attention row: "N listings live but no open dates".
  - `features/admin/dashboard/metrics-queries.ts`: a sellable count tile.
  - Comment on #9 with the corrected alert definition.
- **Acceptance criteria:**
  - [ ] A live listing with `availability_weekdays='{}'` shows no instant/request note, shows the new copy, and has a working `wa.me` link in both locales.
  - [ ] The TikTok CSV row for that listing reads `out of stock` (route test).
  - [ ] `isSellable` unit tests: empty weekdays, all dates blacked out, cutoff passed today, and a normal listing.
  - [ ] The host checklist does not tick "live" for an unsellable listing, and the attention row appears.
  - [ ] The admin dashboard shows "8 live / 0 sellable" on today's data.
  - [ ] `pnpm scan` is green.
- **Arabic/RTL/Saudi:** WhatsApp is the expected next step in KSA. Write the prefill in Arabic Gulf-neutral register. Use logical spacing. The copy must not promise dates that don't exist (consumer-protection rules on misleading availability).
- **Metric:** clicks on the ask-for-date link per listing view on unsellable listings (add `utm_content=ask_date` to the link and count inbound WhatsApp threads in `conversations`). Also the sellable count, from the admin tile and `select count(*) from experiences where status='live' and cardinality(availability_weekdays)>0`. That count is 0 today.
- **Size and dependencies:** M. Coordinate with #9 so only one alert ships.
- **Risks:** WhatsApp traffic lands on the support agent, so check that the agent prompt handles "when is the next date?" (the available-dates tool exists).

### D3 — Zero-result recovery (was X2)

- **Goal:** When filters match nothing but the catalogue has listings, offer the 1–3 single-filter removals that would return results, with counts, and grey out filter chips that would return 0.
- **Why now:**
  - 70 of 89 searches before the relist and 16 of 16 after were zero-result.
  - One combination, `category=nature&originals=1`, is 40 of 105 searches in 28 days. It always comes from Arabic mobile with no referrer, and it can never match because no nature listing is an Original.
  - The empty state offers only Reset (`app/[locale]/(site)/experiences/(catalog)/page.tsx:272-293`).
- **Scope, in:**
  - suggestion links in the "no results, catalogue not empty" branch;
  - per-option counts used to disable zero-count chips in `filter-rail.tsx` and `filter-sheet.tsx`.
- **Scope, out:** changing ranking, and the empty-catalogue case (#11).
- **Approach:**
  - Compute counts with the existing `matchesCriteria` (`features/experiences/lib/search.ts`) over the facet projection the page already loads.
  - Add a small `ZeroResultSuggestions` server component in `features/experiences/components/`.
  - Add copy to `messages/{ar,en}.json`.
- **Acceptance criteria:**
  - [ ] Unit test: criteria `{category: nature, originalsOnly: true}` suggests "drop Originals" with the correct nature count.
  - [ ] No suggestion appears when the catalogue is empty.
  - [ ] Zero-count chips render disabled with `aria-disabled` and remain readable in RTL.
- **Arabic/RTL/Saudi:** Arabic filter labels. Use logical properties only.
- **Metric:** zero-result share of searches, from `analytics_events where type='search'`. Today: 79% before the relist, 100% after. Target below 30% once any listing is sellable.
- **Size:** S. No dependencies. **Risks:** low. The founder should also check whether a campaign or bio link carries this URL.

### D4 — PR risk labels by path + review policy

- **Goal:** Every PR carries a machine-assigned `risk:high` or `risk:low` label based on the paths it touches, and the repo holds the written policy the routines follow.
- **Why now:**
  - 14 bug-fix PRs are waiting.
  - The founder merges in bursts (17 on 10-12, none since).
  - "High-risk" is a title prefix the bot assigns to itself, and the rule exists only in routine prompts outside the repo.
  - Feature work from the last plan did not start (carry-over table).
- **Scope, in:**
  - `.github/risk-paths.txt`;
  - a `label` job in `.github/workflows/ci.yml` using `GITHUB_TOKEN` and the preinstalled `gh` (no third-party action);
  - `docs/ops/review-policy.md`.
- **Scope, out:** auto-merge, and editing the routine prompts (the founder does that).
- **Approach:**
  - High-risk globs: `features/payments/**`, `features/wallet/**`, `features/bookings/lib/**`, `features/admin/payouts/**`, `db/**`, `app/api/webhooks/**`, `features/auth/**`, `features/support-agent/tools.ts`, `lib/legal.ts`.
  - The job runs on `pull_request` with `permissions: pull-requests: write`, diffs against base and adds one label.
  - The policy covers:
    - a daily merge window, oldest-first, CI green;
    - a WIP cap: no new P3 fix PRs while 8 or more are open;
    - P3s on surfaces with fewer than 10 events in 28 days batched into one weekly PR;
    - a second bug in the same seam goes to D5/D6/D20, not another point fix.
- **Acceptance criteria:**
  - [ ] A test PR that touches `features/payments/` gets `risk:high`.
  - [ ] A copy-only PR gets `risk:low`.
  - [ ] The job never fails CI. Label errors are warnings.
  - [ ] `docs/ops/review-policy.md` exists and is linked from CLAUDE.md "Shared checkout".
- **Arabic/RTL/Saudi:** n/a.
- **Metric:** median age of open bug-fix PRs (today the oldest is 3 days and 14 are open). Target: at most 6 open, all younger than 48 h, by 2026-10-29. Measure with `list_pull_requests` on `bugfix/*`.
- **Size and dependencies:** S. The founder approves the policy.
- **Risks:** a path list can under-label. Keep the bot's title prefix as a second signal.

### D5 — One status machine for listings and applications

- **Goal:** Every status write to `experiences` and `host_applications` goes through one helper that checks the allowed `from` states, writes the moderation or audit event in the same transaction, and logs lost races. A structural test forbids direct writes.
- **Why now:**
  - Listing-status and application-verdict races produced 10 bug issues since 10-09 (#29 #36 #42 #43 #49 #70 #71 #78 #79 #85). 6 are still open, and 4 of the 14 open fix PRs are in these seams (#66 #76 #89 #90).
  - Each fix patches one call site. The next site breaks the same way, and the hunter's 10-13 and 10-14 entries both say so.
  - `host-experiences/actions.ts:565-568` and `host-applications/actions.ts:427-437` write status with `eq(id)` only.
  - Moderation events are written on `db`, outside the status transaction (`host-experiences/actions.ts:516` vs `:556`).
- **Scope, in:**
  - `features/listings/lib/status-machine.ts` (transition table, `editable(status)` policy, `transitionListing(tx, …)`);
  - `features/host-applications/lib/status-machine.ts`;
  - a filesystem test modelled on `lib/import-boundaries.test.ts`;
  - migrating the call sites.
- **Scope, out:** conversations (D20) and bookings (already have `transitions.ts`).
- **Approach:**
  - The helper does `UPDATE … WHERE id=$1 AND status = ANY($from) RETURNING`, inserts the event row with the same `tx`, and on 0 rows re-reads and returns `wrong_state` or `not_found`, calling `reportWarning`.
  - Call sites:
    - `features/host-experiences/actions.ts` (save, submit, publish, pause, archive);
    - `features/admin/experience-moderation/actions.ts`;
    - `features/host-experiences/moment-actions.ts` (uses `editable`);
    - `features/host-applications/actions.ts`;
    - `features/admin/host-applications/*`.
- **Acceptance criteria:**
  - [ ] Table tests cover every allowed and refused transition.
  - [ ] The structural test fails on a new `.set({ status:` against `experiences` or `hostApplications` outside the machines.
  - [ ] The regression tests for #49, #71, #79 and #85 pass through the helper.
  - [ ] Every `wrong_state` from the helper emits one warning.
  - [ ] No behaviour change in the existing 2,261 tests.
- **Arabic/RTL/Saudi:** n/a. Behaviour stays identical, and the copy is unchanged.
- **Metric:** new nightly-hunter issues in the listing-status and application seams over the 4 weeks after merge. 10 over the last 6 days; target ≤ 1.
- **Size and dependencies:** M. Land after PRs #76, #89 and #90 merge, because they change the same writes.
- **Risks:** a wide diff in money-adjacent code. Ship listings first, then applications, as two PRs.

### C6 — Dependabot + scheduled audit job (#19, carried over)

The card in #19 stands. **New evidence:** 3 of the last 100 CI runs were red, all only at the audit step. The 10-15 hunter reports the local `pnpm scan` audit failing on `source-map-js` while CI passes, which is exactly the flakiness a scheduled, separate job isolates. There are 37 outdated packages, 8 by a major version.

### Next — short cards

- **D2 — Seasonal "opens on" date + schedule restore.**
  - **Build:** add `experiences.bookable_from date null` and `closed_reason text null` (migration). `bookableDates()` starts at `max(today, bookable_from)`. The detail page, card and feed say "Opens {date}" ("يفتح الحجز في …"). The host gets "Close until…" and "Reopen with previous schedule" controls, with the weekdays snapshotted on the moderation event. An admin bulk restore takes the 8 schedules from `docs/ops/2026-10-12-relist-schedule-backup.md`.
  - **Then:** add a batch `nextBookableDate` read for the card chip and ranking.
  - **Metric:** sellable listings (0 today) and bookings per listing view.
  - 🗄🧑‍⚖️ The founder sets an opening date per listing.
- **C3 (#16) Funnel events:** build the remaining `booking_started`, `pay_view`, `paid`, `is_internal` and `/host/apply` tracking as carded. Add an `ask_date` click event for D1.
- **C4 (#17) Arabic-only apply + KYC in place:** as carded. Also make `contactEmail` optional (`features/host-applications/schemas.ts:91`), since BRIEF §8 makes phone primary. Build on D5's application machine.
- **C5 (#18) Verified badge:** as carded.
- **D16 Host services agreement:**
  - **Build:** an Arabic-first agreement drafted by counsel. Add `HOST_AGREEMENT_VERSION` beside `lib/legal.ts`, and `hosts.agreement_version` + `agreement_accepted_at` (migration). Add an acceptance card on `/host`. Mark-paid warns until it is accepted.
  - 🗄🧑‍⚖️
- **D6 Riyadh parse helper + `holdState()`:**
  - **Riyadh helpers:** add `riyadhInstant(date, time)`, `parseRiyadhLocal()` and `toRiyadhLocalInput()` in `lib/riyadh-time.ts`, migrate the 7 sites, and add an ESLint `no-restricted-syntax` ban on `new Date(<string>)` outside that file.
  - **Hold state:** add `holdState(booking, now)` next to `holdStillCounts` (`features/bookings/lib/capacity-sql.ts:35`) with a TS/SQL parity truth table, and replace the 8 callers.
  - **Metric:** 0 new Riyadh-time or hold-liveness bugs.
- **D7 Real-Postgres race tier:** add `vitest.db.config.ts` (`**/*.db.test.ts`) and `pnpm test:db`, run in CI `e2e-db` after `db:migrate`, with a two-connection `race()` helper. The first cases are approve vs suspend, and resubmit vs approve. Also raise the coverage floor to about 39/29/29/40 and narrow `include` to `**/*.{ts,tsx}` (`vitest.config.ts:49`).
- **D12 Ops snapshot:**
  - Add `features/admin/dashboard/ops-snapshot.ts`. It returns, as aggregates: owed net and gross per host count and oldest age (via `payoutExpr`, `features/bookings/lib/payout-sql.ts:62`), refunds due, queues, actionable unacknowledged alerts, failed deliveries over 7 days, and the sellable count.
  - Expose it through `pnpm ops:digest` for the routines.
  - Add `ALERT_PLAYBOOK` per kind (action link + 2–3 steps) on `/admin/alerts`.
  - Add a "Failed deliveries (7d)" table.
  - Remove `support_daily_report` from the badge.
  - The Arabic WhatsApp morning digest from X4 consumes the snapshot.
- **D10 Review provenance:** gate `submitReview` on `paid_at is not null`. Add a "Verified booking / حجز مؤكَّد" line on `review-card.tsx`. Add a reason code + actor on hide/unhide. 🧑‍⚖️ The founder decides the label or hiding for the 3 pre-launch reviews.
- **D11 Legal-copy guard:**
  - Add a Vitest that hashes the `termsPage`, `privacyPage` and `cancellationPolicyPage` subtrees in both locales against `CURRENT_TERMS_VERSION`.
  - Replace the provider paragraph with a table (name, purpose, country, transfer basis) in both languages, including the AI processor.
  - Add `docs/legal/breach-runbook.md` (SDAIA, 72 h).
  - 🧑‍⚖️ Wording and counsel.
- **D9 Admin TOTP recovery codes:** generate 8 hashed codes at enrolment and show them once (migration). Accept a code in `verifyAdminMfa` through the existing throttle. Raise an `admin_alerts` row on each use.
- **D19 Refund IBAN controls:**
  - Log each save as a `payment_events` row with the last 4 digits only.
  - Email the booking contact on every change.
  - The admin refund action requires "name mismatch reviewed" when the beneficiary name differs from `billedName`.
  - 🧑‍⚖️ Block or confirm on a mismatch.
- **D8 Arabic default for Saudi visitors:** in `proxy.ts`, before `intlMiddleware`, when there is no `NEXT_LOCALE` cookie and no locale prefix and `x-vercel-ip-country` is `SA` (or GCC), prefer `ar`. **Metric:** the home `ar` share among real visitors, which needs C3's traffic cleaning. 🧑‍⚖️

## Decisions needed from the founder

1. **Pay the hosts (C1).** When does the first transfer happen? Who collects the 2 IBANs, and by when? Should the host agreement (D16) be accepted before the first payout or after it?
2. **Opening dates (D1, D2).** Were the cleared schedules a seasonal close? If so, set an opening date per listing. Or restore them now from the backup?
3. **Review policy (D4).** Approve the high-risk path list, a daily merge window, and a WIP cap of 8 open fix PRs with weekly batching of low-traffic P3s. Then update the routine prompts to cite `docs/ops/review-policy.md`.
4. **Arabic by default for Saudi visitors (D8).** BRIEF §4 already says yes, so confirm.
5. **Pre-launch reviews (D10).** 3 of the 4 public reviews come from unpaid pre-launch bookings. Label them or hide them?
6. **Admin resilience (D9).** Use recovery codes only, or also add a second admin?
7. **Carried over:** the verified-badge treatment for the 2 legacy partners (C5), who writes the English bio (C4), and Sentry vs log drain (X5, Later).

## Handed to the bug routine

- #105 (P2): legal copy changed in `b341775` (2026-10-11) without bumping `CURRENT_TERMS_VERSION` (`lib/legal.ts:15`) or the "Last updated" date. `termsCarriedOver()` compares only the version, so guests who accepted before 10-11 are not asked again.
- Data note, no issue (no code path implicated yet): the oldest approved host application has `host_id` NULL, and one `pending` host row is about 142 days old with no approved application. Worth a look during C5.

## Method and limitations

- **Access check:** git push (dry run), GitHub issues and PRs, Supabase `select 1` and the Vercel project all succeeded.
- **Inputs read:**
  - the 2026-10-09 plan;
  - the 2026-10-09 PM report (the only one in `docs/product/weekly/`; no second report exists yet);
  - the 2026-10-12 market research;
  - the last 13 comments on #7;
  - all 38 open issues and 16 open PRs;
  - `git log` for 30 days;
  - `pnpm test:coverage` on `eca727d`.
- **Reviewers:** five read-only reviewers covered guest growth, host supply, ops/admin, engineering health and trust/compliance.
- **Re-verified by me:**
  - **Production queries:** funnel split at the relist, the search-string distribution, live vs sellable, owed amount and IBANs, payouts count, and admin alert kinds since 10-09.
  - **Code reads:** the `noDates` panel and copy, the TikTok `'in stock'` line, `defaultLocale`, `proxy.ts`, the OG image component, `resolveTicket` state handling, readiness weekdays, the host checklist "live" rule, `CURRENT_TERMS_VERSION` vs `b341775`, the review gate, the `db-fake` header, `riyadh-time` exports, `releaseLock`, and the application resubmit write.
  - **CI:** the last 30 runs are green.
- **Reviewer-reported, not re-verified:**
  - **Engineering:** the per-folder coverage (taken from the coverage log the reviewer parsed); the 37 outdated packages and 8 majors; PR source-diff sizes; the 8 hold-liveness call sites.
  - **Ops and support:** alert acknowledgement averages (94 h for `config_missing`) and the 13 WhatsApp failures since 08-15.
  - **Trust and supply:** the 3 of 4 reviews on unpaid bookings, and `/hosting` 164 views → 2 applications.
  - **Figures from routine output:** the Daily Ops Digest's net figure (about SAR 4,230).
- **Small samples:** 7 bookings in 28 days, several of them tests, and 0 since the relist. Every ratio is directional.
