# Gharmish development plan — 2026-11-01

> Six-week horizon: 2026-11-01 → 2026-12-13. Written by the Development Planner routine, which runs on the 1st and 15th.
> It sits above the Nightly Bug Hunter (#7), the weekly PM routine (Top 3: #9 + #101, #14, #254) and the market research (2026-10-29). Defects go to the bug routine; this plan covers improvements only.
> Every number comes from a read-only production query (`gharmish-experiences`), a command run on HEAD `001ab4e`, or the GitHub API, and the source sits next to it. All scores are estimates.

## الملخص بالعربية

1. لم يُنجز أي بند من بنود الخطة السابقة (١٥ أكتوبر). السبب ليس غموض البطاقات: «المُصلح اليومي» يصرف كل يوم ميزانيته على الأخطاء (فُتح ١٠٧ بلاغات خطأ منذ ١٥ أكتوبر وأُغلق ١٨ فقط)، ولذلك لم تُبنَ بنود التحسين الصغيرة الثلاثة ولا مرة.
2. اكتشافان يغيّران الأولويات. الأول: كل الحجوزات الـ٢٦ التي تُحسب «مستحقات للمضيفين بقيمة ٤٬٨١٠ ريال» جاءت من حساب ضيف واحد، والأرجح أنها حجوزات اختبار، فيجب حسم ذلك قبل أي تحويل. الثاني: المضيف الذي يملك ٤ من التجارب الثماني المنشورة ليس له حساب دخول ولا هاتف ولا بريد، فكل إشعار حجز لتجاربه يضيع بلا أثر.
3. «الآن» (أسبوعان): بطاقات وصفحات صادقة حين لا توجد مواعيد، مع زر «اسأل عن موعد» عبر واتساب. تنظيف تنبيهات الإدارة. إظهار عمر كل بند في قائمة مهام لوحة الإدارة. عرض عدد المشاهدات لكل تجربة للمضيف. فصل فحص الثغرات عن بقية فحوص CI. حسم حجوزات الاختبار. ربط المضيف بلا حساب.
4. «التالي»: أدوات مشتركة تُغلق فئات كاملة من الأخطاء بدل إصلاحها واحداً واحداً: صلاحية الوصول إلى الحجز، وقراءة المبالغ المالية، ودفعات المهام المجدولة، وتوحيد الأرقام العربية. هذه الفئات الأربع وحدها تغطي نحو ٣٨ بلاغاً مفتوحاً.
5. قرارات مطلوبة من المؤسس: تخصيص بند تحسين واحد يومياً للمُصلح، وهل حجوزات الـ٢٦ اختبار، ومن يتواصل مع المضيف بلا حساب، والموافقة على طلبات الدمج الخمسة المعلّقة.

## Carry-over from the previous plan (2026-10-15)

**0 of 19 Now and Next items shipped.** Two related dependencies did land: the terms-version bump (#105, PR #261, merged 10-30) and the IBAN mod-97 checksum (#108, merged 10-29). The 30-day commit mix is 103 `fix` to 1 `feat`.

**Why the Daily Fixer built none of the 🤖 items:** the cards were specific enough, and none needed a decision. In every daily log from 10-17 to 10-29 (#93), the Fixer listed "improvement S: #19, #102, #103 … Waited: queue budget". On 10-30 and 10-31 it wrote "the budget went to the P0/P1/P2 bugs". Bugs always rank above improvements, and bug intake (107 opened, 18 closed since 10-15) never lets the queue empty. #19 was also misread as "needs repo settings", which it does not (see E14). **Fix: Decision 1** (reserve one Fixer slot per day for a Now 🤖 card).

| Item (10-15 id)                              | Status                         | Evidence                                                                                                                                                                                                        |
| -------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Now 1 · C1 Host payouts last mile (#14)      | ⛔ Not started (prerequisites) | #108 checksum merged. 0 rows in `payouts`. Mark-paid still never writes `bank_reference`. **Reframed:** all 26 owed bookings come from 1 guest account (E2), and 12 of them belong to a host with no login (E3) |
| Now 2 · D1 Honest no-dates + sellable (#101) | ⛔ Not started                 | No PR or branch. Re-scoped to an S 🤖 slice (E4). The alert and sellable count stay with PM #9                                                                                                                  |
| Now 3 · D3 Zero-result recovery (#102)       | ⛔ Not started (Fixer budget)  | Its main evidence stream (`nature&originals`) stopped on 10-14. Re-scoped to Arabic search (Next)                                                                                                               |
| Now 4 · D4 PR risk labels + policy (#103)    | 🟡 Superseded in practice      | Since 10-29 the hourly merge gate (#262) assigns HIGH/NORMAL risk and merges NORMAL PRs itself. No `risk-paths.txt` or `review-policy.md` exists. Recommend closing (Decision 6)                                |
| Now 5 · D5 Status machine (#104)             | ⛔ Not started (M)             | Now covers 14 open issues, up from 10. Folded with `isSellable` (Next)                                                                                                                                          |
| Now 6 · C6 Dependabot + audit job (#19)      | ⛔ Not started (Fixer budget)  | All 39 failed CI runs since 10-09 failed at the audit step. Refreshed as E14 (Now)                                                                                                                              |
| Next · D2 Seasonal opens-on date             | ⛔ Not started                 | Waiting on #9 and the owner's dates decision                                                                                                                                                                    |
| Next · C3 Funnel events (#16)                | ⛔ Not started                 | Merged with traffic hygiene (E15)                                                                                                                                                                               |
| Next · C4 Arabic-only apply + KYC (#17)      | ⛔ Not started                 | Bug #265 (re-upload a rejected KYC doc) is open and overlaps it                                                                                                                                                 |
| Next · C5 Verified-badge integrity (#18)     | ⛔ Not started                 | 1 of 8 live listings has a host with an approved tourism licence (trust reviewer)                                                                                                                               |
| Next · D16 Host services agreement           | ⛔ Not started                 | Blocked on counsel                                                                                                                                                                                              |
| Next · D6 Riyadh parse + `holdState()`       | ⛔ Not started                 | 10 open issues map to it, including P2 #273                                                                                                                                                                     |
| Next · D7 Real-Postgres race tier            | ⛔ Not started                 | Parked behind the class helpers                                                                                                                                                                                 |
| Next · D12 Ops snapshot + alert playbook     | ⛔ Not started                 | Partly replaced by E5 and E6                                                                                                                                                                                    |
| Next · D10 Review provenance                 | ⛔ Not started                 | —                                                                                                                                                                                                               |
| Next · D11 Legal-copy guard + runbook        | 🟡 Part done                   | Terms version bump merged (#261). The breach runbook moved to PM #254                                                                                                                                           |
| Next · D9 Admin TOTP recovery codes          | ⛔ Not started                 | —                                                                                                                                                                                                               |
| Next · D19 Refund IBAN change controls       | ⛔ Not started                 | Would be absorbed by the refund model (E13, then E24)                                                                                                                                                           |
| Next · D8 Arabic default for Saudi visitors  | ⛔ Not started                 | Traffic evidence now in doubt (E15)                                                                                                                                                                             |

## Where we are

### Engineering mix and pipeline (last 30 days unless stated)

| Measure                   | Value                                                                                               | Source                                                           |
| ------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Non-merge commits         | 131: `fix` 103 · `docs` 16 · `test` 6 · `chore` 3 · `feat` 1                                        | `git log --since='30 days ago' --no-merges`                      |
| PRs merged since 10-15    | 70: 64 on 10-29 (one sitting), 5 on 10-30, 1 on 11-01                                               | GitHub pulls API                                                 |
| Bug issues since 10-15    | 107 opened, 18 closed                                                                               | GitHub issues API                                                |
| Open bugs                 | 111: P0 1 (#264) · P1 1 (#247, looks resolved per #7) · P2 20 · P3 89                               | GitHub issues API                                                |
| Open PRs                  | 5, all HIGH and "Ready to merge", waiting for `/approve` since 10-31 08:23–09:21 UTC (~44 h)        | #262 gate log 11-01 01:15 UTC                                    |
| CI runs since 10-09       | 276. PR failure rate 38/168 (23%), main 1/108. Median 5.2 min                                       | Actions API                                                      |
| Failing CI step           | 39 of 39 failed runs: `pnpm audit --prod --audit-level=high`                                        | Actions jobs API                                                 |
| Typecheck / lint / tests  | ✅ / 0 errors, 1 known warning / 225 files, 2,511 tests                                             | `pnpm typecheck`, `pnpm lint`, `pnpm test:coverage` on `001ab4e` |
| Coverage                  | 43.9% statements, 34.3% branches (CI floors 20 / 15)                                                | `pnpm test:coverage`                                             |
| Lowest-covered risky code | `features/bookings/queries.ts` 4.3% stmts; `features/admin/payouts` 53/39; `features/account` 40/29 | coverage report (engineering reviewer)                           |
| Audit / outdated          | 0 high or critical; 2 moderate (via `@sentry/nextjs`). 32 packages behind, 11 a major behind        | `pnpm audit --prod`, `pnpm outdated`                             |

**Health trend (#7, last 5 runs, 10-28 → 11-01):** build, types and lint stayed green throughout, and tests rose from 2,494 to 2,510. Both old P0s (#179, #120) closed on 10-29. One new latent P0 (#264, a shared anonymous guest row on the pay page) was found on 10-31; its fix PR #268 is waiting for `/approve`. Most new P3s come from interactions between independently written fixes.

### Funnel (last 28 days, 2026-10-04 → 11-01)

| Step                                   | Count | Note                                                                                                                     |
| -------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------ |
| Page views                             | 1,403 | 49 are scanner rows from 10-04 to 10-09. 980 clean views of `/` are spread almost evenly over 24 h in both locales (E15) |
| Searches                               | 87    | 73 with zero results (84%). 81 in Arabic                                                                                 |
| Listing views (`experience_view`)      | 322   | All 8 live listings. 200 in Arabic (62%)                                                                                 |
| Booking starts (`bookings.created_at`) | 2     | The last on 10-06                                                                                                        |
| Paid (`paid_at`)                       | 0     | The last on 10-02                                                                                                        |

**The step that loses everyone is the booking panel:** every listing view lands on a calendar with no dates (owner decision since 10-12). So the improvement for now is to be honest about it and capture demand (E4), not to optimise checkout.

### Supply (2026-11-01)

| Measure                                            | Value                                                                                                                              |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Hosts                                              | 4 verified · 1 pending · 1 suspended                                                                                               |
| Live / sellable listings                           | 8 / 0                                                                                                                              |
| Live listings whose host has a login and a contact | **4 of 8**. One verified host owns the other 4 and has neither                                                                     |
| Live listings with a gallery (5+ images)           | 1 of 8 (7 have none). Lowest live price SAR 5                                                                                      |
| Pending host applications                          | 2, the oldest from 2026-05-27                                                                                                      |
| Payout rows ever                                   | 0                                                                                                                                  |
| Owed (completed, paid, `host_paid_at` null)        | 26 bookings, SAR 4,810 gross, **from 1 guest account**, paid 06-02 → 09-21                                                         |
| Bookings ever                                      | 125 from 13 guests. 2 of those guests ever paid                                                                                    |
| WhatsApp deliveries, 90 days                       | 135 read · 8 delivered · 13 failed. The last Arabic `booking_awaiting_payment` sends (10-06) failed on a missing content SID (#15) |
| Support                                            | 0 open tickets. 6 WhatsApp conversations ever, 1 in 28 days                                                                        |

## Improvement register

Value is 1–5 (revenue, supply, trust, founder time). Confidence is 1–5. Effort: S = 1, M = 2, L = 4. Sorted by value ÷ effort. **Estimates, not measurements.**

| ID   | Item                                                      | V   | C   | Eff | V/E | Evidence (short)                                                                                                  | Executor |
| ---- | --------------------------------------------------------- | --- | --- | --- | --- | ----------------------------------------------------------------------------------------------------------------- | -------- |
| E1   | Reserve one Daily Fixer slot per day for a Now 🤖 card    | 5   | 5   | S   | 5.0 | 0 of 3 Now S items started in 17 days; "Waited: queue budget" in every #93 log 10-17 → 10-29                      | 🧑‍⚖️       |
| E4   | Honest "no dates" cards and page plus WhatsApp ask (#101) | 4   | 5   | S   | 4.0 | `experience-card.tsx:233-256` shows Instant book on 8 unsellable listings; 322 views → 2 bookings                 | 🤖       |
| E14  | Audit as its own CI job plus Dependabot (#19)             | 3   | 5   | S   | 3.0 | 39 of 39 CI failures at the audit step; no `dependabot.yml`                                                       | 🤖       |
| E5   | Quiet daily report and self-closing alerts                | 3   | 5   | S   | 3.0 | 31 of 49 daily reports unacknowledged; `report.ts:164-174` inserts before sending                                 | 🤖       |
| E6   | Ages on the admin work queue                              | 3   | 4   | S   | 3.0 | `work-queue.tsx` shows counts only; oldest pending application 2026-05-27                                         | 🤖       |
| E7   | Listing views for hosts                                   | 3   | 4   | S   | 3.0 | 322 views in 28 days; `getMyListingStats` (`queries.ts:162`) returns none                                         | 🤖       |
| E9   | Refused-form and Arabic-digit helper                      | 3   | 4   | S   | 3.0 | 7 open issues (#239 #194 #212 #185 #215 #260 #198)                                                                | 🤖       |
| E17  | Money CHECK constraints plus nightly ledger check         | 3   | 4   | S   | 3.0 | No money constraints or triggers; data clean today                                                                | 💻 🗄    |
| E2   | Test/void bookings and the SAR 4,810 question             | 5   | 4   | M   | 2.5 | 26 of 26 owed bookings from 1 guest; no admin test flag                                                           | 💻 🗄 🧑‍⚖️ |
| E10  | One booking-access and guest-identity resolver            | 5   | 4   | M   | 2.5 | P0 #264 class, 8 open issues; 7 direct cookie readers; 7 of 9 anonymous guest rows shared                         | 💻 🧑‍⚖️    |
| #102 | Arabic search haystack plus remove-one-filter             | 2   | 3   | S   | 2.0 | 73 of 87 searches empty; `search.ts:249-262` omits category and description                                       | 🤖       |
| E3   | Link legacy hosts; alert when a host is unreachable       | 4   | 5   | M   | 2.0 | Host with 4 of 8 live listings has no login or contact; `host-contact.ts:64-80`                                   | 💻 🧑‍⚖️    |
| E13  | One money read model plus one refund-rail switch          | 4   | 4   | M   | 2.0 | 14 open issues; unit price written twice (`booking-email-receipt.ts:110`, `invoice/page.tsx:163`)                 | 💻       |
| E11  | Shared cron batch cursor plus "truncated" notice          | 3   | 4   | M   | 1.5 | 9 open issues (#229 #228 #132 #160 #153 #251 #114 #44 #218)                                                       | 💻       |
| D6   | Riyadh time helper with a pattern ban                     | 3   | 4   | M   | 1.5 | 10 open issues incl. P2 #273                                                                                      | 💻       |
| #104 | Status machine plus shared `isSellable`                   | 3   | 4   | M   | 1.5 | 14 open issues; reschedule skipped the live check (#169)                                                          | 💻       |
| E16  | Step-up TOTP plus access log for PII and money actions    | 3   | 3   | M   | 1.5 | 12 h MFA cookie (`admin-mfa.ts:31`); CSV export and decrypts unlogged                                             | 💻 🗄    |
| E15  | Traffic hygiene, then funnel events (#16)                 | 3   | 3   | M   | 1.5 | 19–21% of home views fall between 01:00 and 05:59 Riyadh in both locales; 96% have no referrer                    | 💻 🗄    |
| E12  | Truthful notification delivery outcome                    | 2   | 3   | M   | 1.0 | 10 open issues (#80 #272 #219 #197 #148 #227 …)                                                                   | Later    |
| E19  | Phone-only checkout (email optional)                      | 3   | 2   | M   | 1.5 | `features/bookings/schemas.ts:67-87` requires email, BRIEF §8 says optional; reverses a 2026-07-09 owner decision | Later 🧑‍⚖️ |
| E22  | PDPL data inventory in code                               | 3   | 3   | M   | 1.5 | No purpose/retention map; `notification_deliveries.recipient` never pruned                                        | Later    |
| E24  | Refunds as their own table and state machine              | 3   | 3   | L   | 0.8 | Refund state spread across about 10 booking columns                                                               | Later    |
| E25  | Accept or decline booking requests from WhatsApp          | 2   | 3   | M   | 1.0 | Host template has only a link button                                                                              | Later 🔑 |
| E26  | Team seats for company hosts                              | 1   | 3   | L   | 0.3 | `hosts.user_id` unique; 2 of 3 approved applicants are companies                                                  | Later    |

Dropped or linked instead: the payout calendar and "next transfer date" (folded into #14 after E2); the photo shoot (founder action, Decision 5); the partnerships WhatsApp button on `/hosting` (needs a routing decision, Later); expiring host credentials (waits on legal audit A3 and #18).

## Themes

1. **Make the pipeline build improvements** (E1, E14, E9): the plan has the right cards, and nothing builds them. One Fixer slot a day turns every 🤖 card into a shipped change within days.
2. **Honest catalogue, captured demand** (E4, #102, E15): 322 listing views a month meet an empty calendar. Tell the truth and collect the WhatsApp ask.
3. **Host money and reachability truth** (E2, E3, E7): settle whether the "debt" is real before paying it, and make sure hosts can be reached before reopening dates.
4. **Admin signal over noise** (E5, E6, E11, E16): the founder is the whole ops team, so every unneeded alert costs real time.
5. **Retire bug classes, not bugs** (E10, E13, E11, D6, #104, E17): about 55 of the 111 open bugs fall into these six classes.

**Balance:** Now has 2 host items (E3, E7), 1 guest item (E4), 2 admin items (E5, E6), 1 pipeline item (E14) and 1 founder decision with code (E2). Guest-side conversion work is thin on purpose: there is nothing to convert while dates stay closed by owner decision.

## Now / Next / Later roadmap

### Now (weeks 1–2, alongside PM Top 3: #9 + #101, #14, #254)

| #   | Item                                           | Theme | Size | Executor | Depends on                                  | Flags   | Issue |
| --- | ---------------------------------------------- | ----- | ---- | -------- | ------------------------------------------- | ------- | ----- |
| 1   | E1 Daily Fixer improvement slot                | 1     | —    | 🧑‍⚖️       | Founder edits the Fixer prompt              | 🧑‍⚖️      | #20   |
| 2   | E4 Honest no-dates cards + WhatsApp ask        | 2     | S    | 🤖       | —                                           | —       | #101  |
| 3   | E5 Quiet report + self-closing alerts          | 4     | S    | 🤖       | —                                           | —       | #276  |
| 4   | E6 Ages on the admin work queue                | 4     | S    | 🤖       | —                                           | —       | #277  |
| 5   | E7 Listing views for hosts                     | 3     | S    | 🤖       | —                                           | —       | #278  |
| 6   | E14 Audit job + Dependabot                     | 1     | S    | 🤖       | `/approve` (workflow file = HIGH)           | —       | #19   |
| 7   | E2 Test/void bookings + the SAR 4,810 question | 3     | M    | 💻       | Founder decision before any transfer on #14 | 🗄🧑‍⚖️    | #279  |
| 8   | E3 Link legacy hosts + unreachable alert       | 3     | M    | 💻       | Founder collects the host's phone           | 🧑‍⚖️ (🗄) | #280  |

**Capacity:** five 🤖 S items cover a week of Fixer slots if Decision 1 is taken. E2 starts with a 15-minute founder look at the 26 rows; if they are real, E2's code is optional and #14 goes ahead. E3 is one Claude Code session once the founder has the host's phone.

### Next (weeks 3–6)

| #   | Item                                     | Theme | Size | Executor | Depends on                  | Flags            |
| --- | ---------------------------------------- | ----- | ---- | -------- | --------------------------- | ---------------- |
| X1  | E10 Booking-access resolver              | 5     | M    | 💻       | PRs #257 and #268 merged    | 🧑‍⚖️ (L follow-up) |
| X2  | E13 Money read model + refund rail       | 5     | M    | 💻       | —                           | —                |
| X3  | E9 Refused-form + Arabic-digit helper    | 1     | S    | 🤖       | Free Fixer slot             | —                |
| X4  | #102 Arabic search + remove-one-filter   | 2     | S    | 🤖       | —                           | —                |
| X5  | E11 Cron batch cursor + truncated notice | 4     | M    | 💻       | —                           | —                |
| X6  | #104 Status machine + `isSellable`       | 5     | M    | 💻       | #9 ships `isSellable` first | —                |
| X7  | D6 Riyadh time helper + pattern ban      | 5     | M    | 💻       | —                           | —                |
| X8  | E16 Step-up TOTP + access log            | 4     | M    | 💻       | #254 runbook                | 🗄               |
| X9  | E17 Money constraints + ledger check     | 5     | S    | 💻       | —                           | 🗄               |
| X10 | E15 Traffic hygiene → #16 funnel events  | 2     | M    | 💻       | E2 (test flag)              | 🗄               |

### Later (parked, with the trigger that would promote each)

- **E12 Delivery-outcome type:** promote on the next notification-status bug after E11 ships.
- **E19 Phone-only checkout:** promote when dates reopen and the founder agrees to revisit the 2026-07-09 decision.
- **E22 PDPL data inventory:** promote when counsel is engaged on #254, or at the first data-subject request.
- **E24 Refunds table:** promote after E13, or at 5 refunds in a month (9 refunded bookings ever).
- **E25 WhatsApp accept/decline:** promote at 5 or more requests a month on request-to-book listings.
- **E26 Team seats:** promote when a company host asks for a second login.
- **Partnerships WhatsApp on `/hosting`:** promote when the founder decides who answers host leads.
- **Expiring host credentials:** promote after legal audit A3 is answered and #18 ships.
- **Carried from 10-15 (unchanged triggers):** D2 opens-on date (#9 shipped), #17, #18, D16, D7, D10, D9, D19 (absorbed by E13/E24), D8 (after E15), D13 share card (once photos exist), D14, D15, D17, D18, D20, D21 (replaced by E10's L follow-up), D22, D23, D24.

## Build cards

### Now

#### E4 — Honest "no dates yet" on cards and the listing page, with a WhatsApp ask (🤖 S, re-scoped #101)

> Issue: #101

- **Goal:** No surface advertises "Instant book" or "Request to book" on a listing that has no bookable weekday. The listing page tells the truth and offers one clear next step: ask for a date on WhatsApp.
- **Why now:**
  - All 8 live listings have `availability_weekdays = '{}'` (production, 2026-11-01). This is an owner decision, and this card does not reopen dates.
  - 322 listing views in 28 days led to 2 booking rows, both on or before 10-06. 200 of those views (62%) were Arabic.
  - Every card still shows the booking-mode chip. `features/experiences/components/experience-card.tsx:233-256` renders `t('instant')` / `t('requestMode')` from `bookingMode` alone and never checks `availabilityWeekdays`, even though the field is on the card type (`features/experiences/types.ts:31`).
  - The listing page note says "No open dates in the next 8 weeks — new dates are added regularly, so check back soon." (`messages/en.json:3198`, Arabic twin at the same key). That is not true today.
  - The only contact path is a quiet link under the host card (`app/[locale]/(site)/experiences/[slug]/page.tsx:814-831`). On mobile the booking panel renders after the whole content column, and with no dates the sticky mobile button never appears.
- **Scope, in:**
  1. Card: when `availabilityWeekdays.length === 0`, replace the mode chip with a neutral chip "Dates coming soon" / «المواعيد قريبًا» (`CalendarClock` icon, `bg-sarat-black/8 text-sarat-black-800`).
  2. Listing page: when the booking form's `noDates` is true, put a "No open dates yet" block directly under the title on mobile (`lg:hidden`) and keep the existing panel on desktop. The block has a primary WhatsApp button built with `whatsappLink(supportWhatsappE164(), t('askDatePrefill', { title }))` (`lib/whatsapp.ts:17`, `lib/env.ts:295`). It renders nothing when `supportWhatsappE164()` is null.
  3. Copy: replace `noDates` (key at `messages/en.json:3198` and its `ar.json` twin) with copy that promises nothing. Suggested: en "No dates are open for this experience yet. Message us on WhatsApp and we'll tell you when it opens." / ar «لا توجد مواعيد متاحة لهذه التجربة حاليًا. راسلنا على واتساب ونخبرك أول ما تفتح.» Add keys `datesSoon`, `askDateCta` («اسأل عن موعد»), `askDatePrefill` («السلام عليكم، أرغب بموعد لتجربة {title}»).
- **Scope, out:** the sellable count and the `no_sellable_listings` alert (both stay with #9, which needs an `ADMIN_ALERT_KINDS` change); storing phone numbers or consent (#11); any change to dates.
- **Approach:** the no-dates rule already exists as `noDates` in `features/bookings/components/booking-request-form.tsx:733`. Derive the same boolean in `page.tsx` from `exp.availabilityWeekdays.length === 0` (keep it in one exported helper, `features/experiences/lib/no-dates.ts`, and use it in both places). The card is a server component, so no `"use client"`. Logical properties only.
- **Acceptance criteria:**
  - [ ] Unit test for `hasNoBookableWeekday()`: `[]` → true, `[5]` → false.
  - [ ] Render test: a card with `availabilityWeekdays: []` and `bookingMode: 'instant'` shows "Dates coming soon" and not "Instant book"; with `[5]` it shows "Instant book".
  - [ ] The listing page with no weekdays shows the WhatsApp button above the fold on a 390 px viewport, in `ar` (RTL) and `en`. The `href` starts with `https://wa.me/` and carries the listing title in the prefill.
  - [ ] With `SUPPORT_WHATSAPP` unset, no empty button renders.
  - [ ] `messages/en.json` and `ar.json` keep exact key parity. The structural test in `lib/client-messages.ts` passes.
  - [ ] `pnpm typecheck`, `pnpm lint` and `pnpm test` are green.
- **Arabic/RTL and Saudi:** WhatsApp is the expected next step in KSA (87% of our WhatsApp messages in the last 90 days were read). The prefill is neutral Gulf Arabic. Showing an availability promise that does not exist is a consumer-protection risk.
- **Metric:** WhatsApp conversations started per week (`select count(*) from conversations where created_at > now()-interval '7 days'`; 1 in the last 28 days). Target: at least 3 a week while dates are closed.
- **Size / executor / dependencies:** S · 🤖 Daily Fixer · no migration, no dependency, no account. If #9 lands first, reuse its `isSellable()` instead of the weekday check.
- **Risks:** the support line gets more messages. That is the point, and volume is near zero today.

#### E5 — Admin alert hygiene: a quiet daily report, and alerts that close themselves (🤖 S)

> Issue: #276

- **Goal:** `/admin/alerts` and the admin inbox show only what needs the founder. Zero-activity days send nothing, and a config or cron alert closes itself once the condition has cleared.
- **Why now:**
  - `admin_alerts` (production, 2026-11-01): `support_daily_report` has 49 rows, 31 of them never acknowledged. `config_missing` has 355 rows; all have now been acknowledged by hand.
  - Support is nearly idle: 3 tickets ever (0 open), 6 WhatsApp conversations ever (1 in 28 days). Most daily reports therefore report nothing, but each one is still emailed and stored unacknowledged.
  - `maybeSendDailyReport` (`features/support-agent/report.ts:137-178`) has no zero-activity branch. It inserts the alert row **before** `sendEmail` (`:164-174`), so a failed send is never retried for that day.
  - Nothing ever sets `acknowledgedAt` except the two manual actions in `features/admin/alerts/actions.ts:43,74`. A `config_missing` alert raised by `features/maintenance/passes/config.ts:36` stays open after the env var is fixed, and so does a `cron_stale` raised by `app/api/cron/watchdog/route.ts:75`.
  - For alerts without a booking or ticket, the alert email links to `${SITE_URL}/en/admin` (`lib/admin-alerts.ts:156`), where the alert is not shown.
- **Scope, in:**
  1. `report.ts`: when every count in `collectDailyStats()` is 0, insert the row with `acknowledgedAt: now` and skip the email. Otherwise send the email first and insert the row only after the send resolves.
  2. Auto-resolve: when the config pass runs and finds nothing missing, set `acknowledgedAt = now()` on open `config_missing` rows (`kind = 'config_missing' and acknowledged_at is null`). Do the same in the watchdog for open `cron_stale` rows once every watched job is fresh. Put a small `resolveOpenAlerts(kind)` helper in `lib/admin-alerts.ts`.
  3. Change the fallback link at `lib/admin-alerts.ts:156` (and the WhatsApp twin near `:208`) from `/en/admin` to `/en/admin/alerts`.
- **Scope, out:** new alert kinds, grouping on `/admin/alerts`, schema changes, cron run history.
- **Acceptance criteria:**
  - [ ] Unit test: all-zero stats → one row inserted with `acknowledgedAt` set, and `sendEmail` not called.
  - [ ] Unit test: non-zero stats and `sendEmail` throws → no row inserted, so the next hourly run in the report hour retries.
  - [ ] Unit test: a config pass with nothing missing calls `resolveOpenAlerts('config_missing')`; a pass with something missing does not.
  - [ ] Unit test: the watchdog resolves `cron_stale` only when no job is stale.
  - [ ] The fallback link test expects `/en/admin/alerts`.
  - [ ] `pnpm typecheck`, `pnpm lint` and `pnpm test` are green.
- **Arabic/RTL and Saudi:** admin-only, English. The report hour stays Riyadh time.
- **Metric:** unacknowledged `admin_alerts` older than 24 h: `select count(*) from admin_alerts where acknowledged_at is null and created_at < now()-interval '1 day'` (31 today). Target: 0 within a week of merge, except real items.
- **Size / executor / dependencies:** S · 🤖 Daily Fixer · no migration, no dependency, no account. Touches the same files as open bugs #153 and #241; keep the diff to the lines named here.
- **Risks:** an auto-resolve that fires too early hides a live problem. Resolve only on a positive "all clear" from the same pass, never on a skipped or failed run.

#### E6 — Ages on the admin "Needs your attention" queue (🤖 S)

> Issue: #277

- **Goal:** Each row of the admin dashboard work queue shows how long its oldest item has waited, so a five-month-old item no longer looks the same as one from today.
- **Why now:**
  - `features/admin/dashboard/components/work-queue.tsx` (57 lines) renders a count per row and nothing else (the `count: number` field at `:10`).
  - The oldest pending host application dates from 2026-05-27, and there are 2 pending applications in total. The oldest completed, paid booking not yet paid out to its host was paid on 2026-06-02 (26 such bookings).
  - Both have sat on the dashboard as plain counts for months. Last week's PM report lists both as founder actions.
- **Scope, in:**
  - Add `oldestAt: Date | null` to each queue item where the source has a timestamp. Pending applications use `host_applications.created_at`. Payouts owed use the oldest `paid_at` among `status='completed' and payment_status='paid' and host_paid_at is null`. For listings in review, use the newest `submitted` moderation event; if that is awkward, leave this row as null.
  - Render "oldest 158 days" / «الأقدم منذ ١٥٨ يومًا» with the existing locale number formatter, and tint the row with the existing warning token when the age is over 7 days.
- **Scope, out:** new queue rows, alerts, schema changes.
- **Approach:** extend the query that builds the queue in `features/admin/dashboard/queries.ts` with one `min(...)` per row inside the existing round trip, and render it in `work-queue.tsx`. Add the copy to `messages/{en,ar}.json`.
- **Acceptance criteria:**
  - [ ] `queries.render.test.ts` (or a sibling test) shows that an item with `oldestAt` 10 days ago renders "oldest 10 days" in en and the Arabic-Indic form in ar.
  - [ ] An item with `oldestAt: null` renders exactly as it does today.
  - [ ] No extra database round trip: assert the query count in the test, or keep it in the existing `Promise.all`.
  - [ ] `pnpm typecheck`, `pnpm lint` and `pnpm test` are green.
- **Arabic/RTL and Saudi:** Arabic plural forms for days (يوم / يومان / أيام / يومًا) via ICU `plural` in the message. Logical properties only.
- **Metric:** the age of the oldest pending application and of the oldest owed payout, as read from the dashboard (today about 158 and 152 days). The improvement shows when these fall.
- **Size / executor / dependencies:** S · 🤖 Daily Fixer · no migration, no dependency, no account.
- **Risks:** none material.

#### E7 — Show hosts how many people viewed each listing (🤖 S)

> Issue: #278

- **Goal:** On `/host/experiences` each listing shows its 30-day view count. On the host dashboard, a live listing that has views but no open dates gets a one-line nudge to add dates.
- **Why now:**
  - Listings drew 322 views in 28 days (`analytics_events`, `type='experience_view'`), across all 8 live listings. The newest host's listings drew the most.
  - Hosts see none of this. `getMyListingStats()` (`features/host-experiences/queries.ts:162`) returns bookings and rating only. The page that uses it, `app/[locale]/host/(dashboard)/experiences/page.tsx:53`, shows no demand signal.
  - The 8 listings are closed by owner decision. When dates reopen, the hosts are the ones who open them, and "31 people looked at this last month" is the most direct reason to do it.
- **Scope, in:**
  - Add `views30d: number` to `HostListingStats`: `count(*)` from `analytics_events` where `type = 'experience_view'`, `experience_id` is in the host's listings, and `created_at > now() - interval '30 days'`, grouped by `experience_id`. The index `analytics_events_experience_idx` already exists (`db/schema.ts:1697`).
  - Render "{n} views in 30 days" / «{n} مشاهدة خلال ٣٠ يومًا» next to the existing stats on `/host/experiences`.
  - On `/host` (`app/[locale]/host/(dashboard)/page.tsx`, checklist area around `:118-157`), when a `live` listing has `availabilityWeekdays.length === 0` and `views30d > 0`, show "{n} people viewed {title} this month, but it has no open dates. Add dates" linking to that listing's schedule editor.
- **Scope, out:** charts, per-day series, conversion rates, any change to how analytics are captured.
- **Acceptance criteria:**
  - [ ] Query test: views are counted only for the calling host's listings and only within 30 days.
  - [ ] Render test: `views30d = 0` shows "0 views" with no nudge; a live listing with no weekdays and 12 views shows the nudge with the correct link.
  - [ ] Arabic uses ICU plural forms and Arabic-Indic digits through the existing formatter.
  - [ ] `pnpm typecheck`, `pnpm lint` and `pnpm test` are green.
- **Arabic/RTL and Saudi:** most hosts read Arabic first, so write the Arabic copy first. Logical properties only.
- **Metric:** live listings with at least one weekday: `select count(*) from experiences where status='live' and cardinality(availability_weekdays)>0` (0 today). This card alone will not move it while dates are closed by decision, but it gives hosts the reason to act when the founder reopens.
- **Size / executor / dependencies:** S · 🤖 Daily Fixer · no migration, no dependency, no account.
- **Risks:** `analytics_events` may include automated traffic (see E15). Label the number "views", not "visitors".

#### E14 — Run `pnpm audit` as its own CI job, and add Dependabot (🤖 S, refreshes #19)

> Issue: #19

- **Goal:** A new advisory upstream no longer turns every open fix PR red. Advisories arrive as a scheduled signal and as grouped update PRs.
- **Why now:**
  - CI, 2026-10-09 → 11-01: 276 runs. 38 of 168 pull-request runs failed (23%), against 1 of 108 push runs.
  - **All 39 failed runs failed at the same step**, "Run pnpm audit --prod --audit-level=high" (tallied from the Actions jobs API). Tests and build were green on every one of them.
  - The Next.js and Sentry advisories behind them sat open from 10-22 to 10-29. During that week every fix PR was blocked by an advisory it did not cause.
  - There is no `.github/dependabot.yml`. `pnpm outdated` shows 32 packages behind, 11 of them a major version behind.
  - The Daily Fixer has listed #19 as "needs repo settings". It does not: Dependabot version updates need only the config file, and the audit split is a workflow edit.
- **Scope, in:**
  1. `.github/workflows/ci.yml`: move the audit command out of the `checks` job into a new `audit` job. Trigger it on `pull_request`, on `push` to `main` and on `schedule: - cron: '0 1 * * *'`. On `pull_request`, set `continue-on-error: true` and print a `::warning::` annotation. On `push` and `schedule`, failing is allowed.
  2. Add `timeout-minutes` to every job (checks 15, e2e 20, audit 5) and a `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }` block for `pull_request`.
  3. `.github/dependabot.yml`: `npm` weekly, Sunday 03:00 Asia/Riyadh, with one group for `minor` and `patch` and majors ignored (`update-types: ["version-update:semver-major"]`), `open-pull-requests-limit: 3`; plus `github-actions` monthly.
  4. CLAUDE.md "Shared checkout" deploy rule: name the `audit` job as one that must be green on the deploy SHA (on push, not on the PR).
- **Scope, out:** major upgrades (TypeScript 7, ESLint 10, Vitest 5, Sentry 11); enabling Dependabot security alerts in repo settings (optional, founder).
- **Acceptance criteria:**
  - [ ] `ci.yml` passes `actionlint` style review: valid YAML, with job names `checks`, `e2e`, `e2e-db` and `audit`. Any existing required-check names are unchanged.
  - [ ] On a PR, an audit failure shows as a warning and does not fail the run.
  - [ ] `dependabot.yml` validates (GitHub shows it under Insights → Dependency graph → Dependabot after merge).
  - [ ] The CLAUDE.md deploy rule names the audit job.
- **Arabic/RTL and Saudi:** n/a.
- **Metric:** share of red PR runs caused only by the audit step over the next 30 PR runs (39 of 39 failures in the last 23 days). Target: 0.
- **Size / executor / dependencies:** S · 🤖 Daily Fixer · no migration, no new package (Dependabot is built into GitHub), no account. The merge gate rates workflow edits HIGH, so the founder's `/approve` is needed.
- **Risks:** Dependabot PR volume. Grouping and the limit of 3 keep it to at most one grouped PR a week. The merge gate's `bugfix/`/`pm/` branch filter will not pick up `dependabot/*` branches, which is intended: the founder merges those.

#### E2 — Settle what the "SAR 4,810 owed to hosts" really is, and give admin a test/void flag (💻 M · 🧑‍⚖️ · 🗄)

> Issue: #279

- **Goal:** The founder knows whether the 26 owed bookings are real host earnings or pre-launch test traffic. Test bookings can be marked as such, so they leave payouts, host earnings and every metric without SQL on production.
- **Why now:**
  - Production, 2026-11-01: there are 26 bookings with `status='completed'`, `payment_status='paid'` and `host_paid_at is null`, totalling SAR 4,810 gross. **All 26 come from one guest account**, spread over 5 experiences, with `paid_at` between 2026-06-02 and 2026-09-21.
  - Across all bookings ever: 125 bookings from 13 distinct guests, and only 2 of those guests ever paid.
  - Three plans and four PM reports have carried "pay the hosts SAR 4,810" (#14) as a top founder action. If these are test payments, the first payout is a mistake, and every dashboard figure built on them (owed, GMV, host earnings, repeat-guest rate) is wrong.
  - Admin has no action to mark a booking as test or void. The only options today are paying it out or editing production by hand.
- **Scope, in:**
  1. **Founder decision first (no code):** look at the 26 rows in `/admin/payouts` and HyperPay, and decide whether they are test or real. If real, #14 proceeds unchanged. If test, continue.
  2. Migration: `bookings.is_test boolean not null default false` plus `test_marked_at` and `test_marked_by`. Run `pnpm db:generate`.
  3. Admin action `markBookingTest(reference, reason)` on `/admin/bookings/[reference]`, with TOTP-guarded server action, audit row, zod schema and a `{ success: false, message }` union.
  4. Exclude `is_test` rows from the canonical payout SQL (`features/bookings/lib/payout-sql.ts`), from the host earnings queries (`features/host-earnings`), from admin dashboard metrics (`features/admin/dashboard/metrics-queries.ts`) and from the PM/ops queries documented in `docs/ops`.
  5. A one-line note on `/admin/payouts`: "N test bookings excluded".
- **Scope, out:** refunds, deleting rows, guest-facing changes.
- **Acceptance criteria:**
  - [ ] A payout-sql test shows that a completed, paid, `is_test` booking is not owed.
  - [ ] Host earnings and admin metrics tests exclude test rows.
  - [ ] The action refuses a non-admin, a booking in `pending` or `processing`, and an already-paid-out booking (`host_paid_at` not null).
  - [ ] `db/schema-snapshot.test.ts` passes after `pnpm db:generate`, and `pnpm db:preflight` lists the migration.
- **Arabic/RTL and Saudi:** admin-only. The host earnings page must not show a negative or confusing line. Test bookings simply disappear from it.
- **Metric:** owed-to-hosts in `/admin/payouts` after marking, against SAR 4,810 gross today.
- **Size / executor / dependencies:** M · 💻 Claude Code session · 🗄 migration · 🧑‍⚖️ decision in step 1. It decides how #14 (PM Top 3 #2) proceeds, so take the decision before any transfer.
- **Risks:** marking a real booking as test would hide a host's earnings. Mitigations: an audit row, a required reason, and an "unmark" action.

#### E3 — Make every host with a live listing reachable: link a login to legacy hosts, and alert when a host can't be notified (💻 M · 🧑‍⚖️)

> Issue: #280

- **Goal:** Every host with a `live` listing has a login and at least one notification channel. When one doesn't, admin sees it on the host page and gets one alert, instead of booking notices silently going nowhere.
- **Why now:**
  - Production, 2026-11-01: one verified host owns **4 of the 8 live listings** and has `user_id`, `contact_phone` and `contact_email` all null, with no linked `host_applications` row to fall back on.
  - `lib/notifications/host-contact.ts:64-80` therefore resolves no email and no phone. Every booking request, approval reminder and payout notice for those 4 listings is skipped without an alert.
  - That host cannot sign in. `app/[locale]/host/(dashboard)/layout.tsx:45` sends anyone without a linked host row to `/host/apply`. So they cannot enter the IBAN that #14 needs, and cannot open dates when the owner decides to reopen.
  - The only code path that links a login to a host is application approval (`features/host-applications/admin-actions.ts:223-267`).
- **Scope, in:**
  1. `/admin/hosts/[id]`: badges for "No login" and "No notification channel". Add an admin action "Link account by phone": the admin enters the host's phone, and when that phone signs in by OTP the existing `auth_user_id` is bound to `hosts.user_id`. Use an invite row only if the user does not exist yet. TOTP-guarded, with an audit row.
  2. Admin can set `contact_phone` and `contact_email` on the host (encrypted like the existing columns).
  3. Maintenance pass: one `host_unreachable` alert per host (fingerprint = host id, quiet window 7 days) when a host owns a `live` listing and `hostNotificationContact` resolves neither channel. The new alert kind may need an `ADMIN_ALERT_KINDS` enum value (🗄). If so, ship steps 1–2 first.
  4. Warn, without blocking, in the admin listing editor when publishing or relisting for an unreachable host.
- **Scope, out:** team seats for company hosts, self-serve host claim without an admin.
- **Acceptance criteria:**
  - [ ] An admin links a phone; signing in with that phone opens `/host`, not `/host/apply`.
  - [ ] The link action refuses a phone already bound to a different host or guest-admin account (`already_linked`).
  - [ ] Pass test: a host with a live listing and no channels raises exactly one alert per 7 days, and none once a channel exists.
  - [ ] `pnpm scan` is green.
- **Arabic/RTL and Saudi:** the host invite SMS/WhatsApp is Arabic-first. Many Aseer hosts are phone-only, so the phone is enough and email stays optional.
- **Metric:** live listings whose host is reachable. Count live listings where the host has `user_id` and a `contact_phone` or `contact_email`: 4 of 8 today. Target: 8 of 8.
- **Size / executor / dependencies:** M · 💻 Claude Code session · 🧑‍⚖️ who collects the host's phone (founder relationship) · possibly 🗄 for the alert kind. Do it before #14's transfer (that host holds 12 of the 26 owed bookings) and before dates reopen (#9).
- **Risks:** binding the wrong phone gives a stranger host access. Require TOTP and the audit row, and show the last 3 digits for confirmation.

### Next

#### E10 — One booking-access and guest-identity resolver (💻 M · 🧑‍⚖️)

- **Goal:** One function decides who may see or act on a booking. It is the only place that reads the last-booking cookie, and an account-owned booking never accepts the cookie as proof.
- **Why now:** this is the open P0 class. Guest-identity issues still open: #264 (P0), #180, #181, #210, #130 (P2) and #258, #253, #252 (P3). `bookingViewerCanAccess` (`features/bookings/lib/access.ts:24-41`) returns true on a matching cookie even when the booking belongs to an account. Besides `access.ts` and the cookie module itself, 7 non-test files parse the cookie directly: `features/bookings/lib/request/supersede.ts`, `request/throttle.ts`, `features/bookings/queries.ts`, `features/account/queries.ts`, `features/account/guest-prefill.ts`, `features/account/profile/guest-identity.ts` and `features/account/cookie.ts`. In production, 9 of the 15 guest rows are anonymous, and 7 of those 9 carry more than one booking: the shared-row pattern behind #264.
- **Scope, in:** `features/bookings/lib/access.ts` exports `resolveBookingViewer(reference)` → `{ kind: 'account' | 'link-token' | 'cookie' | 'none' }`, with the rule that `cookie` is valid only when `bookings.guest_id` belongs to a guest with `auth_user_id is null`. Route every cookie reader through it, and add a structural test that fails if any file other than `access.ts` and `last-booking-cookie.ts` imports `LAST_BOOKING_COOKIE` or `parseLastBookingCookie`. Sign-out clears the cookie.
- **Scope, out:** snapshotting billing details onto bookings and OTP at booking time. Those are the L follow-up and need the decision below.
- **Approach:** start after the open HIGH PRs #257 and #268 merge, because they touch the same files. Then take each reader one commit at a time.
- **Acceptance criteria:** [ ] structural import test; [ ] resolver unit tests for the 4 kinds, including an account-owned booking plus a matching cookie → `none` when signed out; [ ] the existing tests for #180/#258/#253 pass unchanged; [ ] `pnpm scan` green.
- **Arabic/RTL and Saudi:** shared family phones are common, so a cookie must never outlive sign-out.
- **Metric:** open issues in this class (8 today, listed above). Target: 0 open, and no new ones in 30 days.
- **Size / executor / deps:** M · 💻 · 🧑‍⚖️ (should a signed-out booking verify its phone by OTP before it attaches to an existing anonymous guest row? Needed for the L follow-up only) · after #257 and #268.
- **Risks:** locking a signed-out guest out of their own booking. Keep the signed link-token path as the fallback.

#### E13 — One booking money read model and one refund-rail switch (💻 M)

- **Goal:** Every surface that shows a booking's money (receipt email, invoice page, invoice PDF, confirmation page, host earnings, admin) reads one computed model. Every refund path asks one function whether refunds go by bank transfer.
- **Why now:** 14 open issues trace to copied money math or a refund switch that was bypassed: #236, #116, #170, #171, #168, #193, #226, #175, #184 (display/ledger) and #166, #167, #172, #183 (refund rail). The unit-price formula is written twice (`features/bookings/lib/booking-email-receipt.ts:110` and `app/[locale]/(site)/book/confirmed/[ref]/invoice/page.tsx:163`), which is why #236 is wrong in both places.
- **Scope, in:** `features/bookings/lib/money.ts` with `bookingMoney(row)` → `{ unitPrice, subtotal, promo, credit, vat, total, refunded, forfeited, hostNet }` built from `features/bookings/lib/payout-sql.ts` constants. `refundRail()` reads the `refunds_via_bank_transfer` setting once. Point the receipt, invoice, confirmation and host-earnings callers at it, and add a test that bans `.unitPrice =` math outside `money.ts`.
- **Scope, out:** a refunds table (Later, E24); a VAT switch.
- **Acceptance criteria:** [ ] table-driven tests for promo, credit, promo plus credit, partial refund and forfeited; [ ] #236 and #116 cases pass; [ ] guest cancel form and support-agent tools read `refundRail()`; [ ] `pnpm scan` green.
- **Arabic/RTL and Saudi:** the money format stays `formatSar` with Arabic-Indic digits in `ar`. ZATCA invoice fields come from the same model, which is needed before VAT is switched on.
- **Metric:** open issues in the class (14). Target: at most 2 in 30 days.
- **Size / executor / deps:** M · 💻 · none. High-risk paths, so the founder's `/approve` is needed.
- **Risks:** a rounding change on historic invoices. Snapshot-test 10 representative rows first.

#### E11 — A shared batch cursor for cron passes and a "list truncated" signal (💻 M)

- **Goal:** Every hourly pass walks its backlog with a stable order and cursor, and reports when a batch came back full. Every capped admin list says so.
- **Why now:** 9 open issues come from hand-rolled `limit N` loops: #229 (post-trip email re-selects the same 100), #228 and #132 (wallet expiry), #160, #153, #251, #114, #44, #218 (ticket list stops at 200 with no notice). `features/maintenance/passes/lifecycle.ts:120-144` has no `order by` and no "already sent" filter.
- **Scope, in:** `features/maintenance/lib/batch.ts` with `walkBatches({ query, orderBy, cursor, limit, budgetMs })` returning `{ processed, full, cursor }`. Move lifecycle (post-trip), wallet expiry and support-report passes onto it. The pass runner logs `full: true` through the logger. Add a `TruncatedNotice` for the admin guests, reviews and tickets lists.
- **Scope, out:** a `cron_runs` history table (would need a migration; Later unless a pass fails silently again).
- **Acceptance criteria:** [ ] batch helper tests (stable order, no row processed twice, `full` set at the limit); [ ] regression tests for #229 and #228; [ ] the ticket list shows "Showing 200 of N"; [ ] `pnpm scan` green.
- **Arabic/RTL and Saudi:** admin copy in en and ar.
- **Metric:** open issues in the class (9). Target: 0.
- **Size / executor / deps:** M · 💻 · none.
- **Risks:** a pass that newly processes old rows (catch-up burst). Cap the first run with `budgetMs`.

#### E9 — One helper for refused forms and Arabic-Indic digits (🤖 S, promote to Now when a Now 🤖 slot frees)

- **Goal:** A refused server action always echoes the typed values, and every numeric input (TOTP, phone, IBAN, dates) accepts Arabic-Indic and Persian digits through one normaliser.
- **Why now:** 7 open issues: #239, #194, #212, #185, #215 (values lost on refusal), #260 (admin TOTP rejects ١٢٣٤٥٦) and #198 (admin guest phone stored as typed). The same fix was applied file by file 6 times in the last 30 days. Digit normalisation exists in several local copies; the admin TOTP path (`features/auth/lib/admin-mfa.ts`) and the admin guest editor miss it.
- **Scope, in:** `lib/forms.ts` exports `collectValues(formData, keys)` and `refuse(message, formData, fields?)` → the CLAUDE.md failure shape. `lib/digits.ts` exports `toAsciiDigits(s)`, `normalisePhoneSa(s)` (05… / 9665… / +9665… → E.164). Use them in the actions behind the 7 issues, and close those issues from the PR.
- **Scope, out:** rewriting forms that already echo correctly.
- **Acceptance criteria:** [ ] unit tests for `toAsciiDigits('١٢٣٤٥٦') === '123456'` and Persian ۱۲۳; [ ] `normalisePhoneSa` table test; [ ] a regression test per closed issue; [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` green.
- **Arabic/RTL and Saudi:** Arabic keyboards on iOS and Android type Arabic-Indic digits by default.
- **Metric:** open issues in the class (7). Target: 0.
- **Size / executor / deps:** S · 🤖 · none.
- **Risks:** touching 7 action files in one PR. Keep each change mechanical.

#### #102 (re-scoped) — Arabic search that finds activities, plus "remove one filter" (🤖 S)

- **Goal:** Free-text search matches what Arabic speakers type (activity, audience, category), not only titles. An empty result offers the single-filter removals that would return listings.
- **Why now:** 87 searches in 28 days, 73 of them (84%) with zero results. The `category=nature&originals=1` stream behind the original card stopped on 10-14. `matchesQuery` (`features/experiences/lib/search.ts:249-262`) searches only titles, place and host, so «قهوة» or «خيل» miss unless the word is in a title.
- **Scope, in:** add the en and ar category labels and the first 200 characters of `description_en` / `description_ar` (folded) to the haystack. Keep the "remove one filter" suggestions from the original #102 card. When all listings have no weekdays, a day filter explains "No dates are open yet" instead of offering suggestions.
- **Acceptance criteria:** [ ] `search.test.ts` case: `q='قهوة'` matches a listing whose Arabic description mentions قهوة; [ ] the category label matches in both locales; [ ] the original #102 criteria hold.
- **Metric:** share of searches with zero results (84% over 28 days). Measure once at least one listing is sellable; target below 30%.
- **Size / executor / deps:** S · 🤖 · none.

#### #104 + `sellable(listing, host)` — status machine with one sellability rule (💻 M)

- Unchanged from the 10-15 card (#104), plus one shared `isSellable(listing, host, now)` (live, host not suspended, at least one bookable date in 14 days) used by catalog, reschedule, admin editor and alerts. The rule is checked by hand in about 15 files today, and reschedule skips it (#169, PR #269 open). Do it after #9 has shipped its `isSellable` so there is one function, not two. Metric: open issues in the listing/application state class (#250, #249, #240, #152, #158, #169 and others). Executor 💻, M.

#### D6 — Riyadh time helper and `holdState()` with a pattern ban (💻 M)

- Unchanged goal from 10-15. New evidence: 10 open issues (#273 P2, #274, #159, #150, #201, #225, #224 and others). The repo still has several Saudi time-zone constants and hand-written `+03:00` parsers. Add a structural test that bans `'+03:00'`, `Asia/Riyadh` literals and `toISOString().slice(0, 10)` outside `lib/riyadh-time.ts`. Executor 💻, M, no migration.

#### E16 — Step-up TOTP and an access log for money-out and bulk-PII admin actions (💻 M · 🗄)

- **Goal:** Exporting the people CSV, revealing an IBAN or national ID, and marking a payout require a TOTP code entered in the last 5 minutes, and each leaves an `admin_access_log` row.
- **Why now:** the admin MFA cookie lasts 12 h (`features/auth/lib/admin-mfa.ts:31`). The people export (`app/api/admin/export/users/route.ts`) and the decrypt paths (`features/admin/users/queries.ts:470-472`, `features/admin/hosts/queries.ts:205-207`, `features/admin/payouts/queries.ts:111`) leave no record. The #254 breach runbook (PM Top 3 #3) cannot say what was accessed without one. PDPL requires 72 h breach notice.
- **Acceptance criteria:** [ ] each of the 4 actions refuses without a fresh TOTP; [ ] each writes one log row (who, what, row count, when; no PII values); [ ] `/admin/activity` lists the rows.
- **Size / executor / deps:** M · 💻 · 🗄 (new table). Follows #254.

#### E17 — Money invariants in the database plus a nightly check (💻 S · 🗄)

- **Goal:** Postgres rejects impossible money rows, and a nightly pass alerts on ledger drift.
- **Why now:** `bookings` has no CHECK constraints on money columns, and the schema has no triggers. The trust reviewer's read-only aggregate on 2026-11-01 found the data clean today (refunded plus forfeited equals total on all 8 paid refunds, wallet net 0, no negative balances), so the constraints can be validated now without a backfill.
- **Scope, in:** `CHECK (total_amount >= 0)`, `CHECK (coalesce(refunded,0) + coalesce(forfeited,0) <= total_amount)` (use the real column names from `db/schema.ts`), wallet lot `remaining >= 0`; a maintenance pass comparing wallet balances with the ledger sum that raises `ledger_drift`.
- **Size / executor / deps:** S · 💻 (migration, so not 🤖) · 🗄. Run `pnpm db:preflight` before deploy.

#### E15 + #16 — Clean traffic, then the funnel events (💻 M · 🗄)

- **Goal:** Before anyone reads a ratio, `analytics_events` excludes automated traffic and internal test bookings.
- **Why now:** 1,354 clean page views in 28 days, 980 of them on `/`. Home views are spread almost evenly across the Riyadh clock in **both** locales: 19% (en) and 21% (ar) fall between 01:00 and 05:59, about what an even spread would give, with 96% having no referrer. That pattern suggests a large automated share that the user-agent check (`features/analytics/capture.ts:57-58`) does not catch.
- **Scope, in:** step 1 records `accept-language` presence and `sec-fetch-mode` on page views for 7 days (🗄 two nullable columns), and compares them with the hour pattern. Step 2 drops non-browser requests. Step 3 is #16's remaining events (`booking_started`, `pay_view`), with `is_test` from E2 excluded.
- **Metric:** share of home page views between 01:00 and 05:59 Riyadh (19–21% today). A human-only stream should be well under 10%.
- **Size / executor / deps:** M · 💻 · 🗄 · E2 for the test flag.

## Decisions needed from the founder

1. **Give improvements a daily slot (E1).** Add one line to the Daily Fixer prompt: "Each run, after any P0/P1, build at most one `improvement` + `S` issue listed under Now in the latest plan before P2/P3 bugs." Without it, the 🤖 column of this plan will not move, as it did not move for the last plan.
2. **Are the 26 owed bookings test traffic (E2)?** They come from 1 guest account across 5 experiences (SAR 4,810 gross). Check HyperPay before any transfer on #14.
3. **Reach the host with no login (E3).** They own 4 of 8 live listings and 12 of the 26 owed bookings. Who collects their phone number, and when?
4. **Approve the 5 waiting HIGH PRs** (#256, #257, #268, #269, #270). They have been ready since 10-31, and #268 fixes the open P0 #264.
5. **Photos.** 7 of 8 live listings have no gallery. Book a half-day shoot in Abha, starting with the women-only listings (they drew 170 of 322 views, per the guest reviewer).
6. **Close #103** as superseded by the merge gate's risk tiers? Or keep the written policy as a repo file?
7. **Carried, unanswered:** the WhatsApp consent wording for "notify me" (#11), the Arabic content SID for `booking_awaiting_payment` (#15, still failing on 10-06), and the OTP-at-booking question (E10's L follow-up).

## Method and limitations

- **Sources:** five parallel read-only reviewers (guest, host, ops, engineering, trust), with reports kept in the run's scratch space. I re-checked every ranked item myself against code (file and line above) or a single-statement production SELECT. Production was never written to.
- **Corrected a reviewer lead:** the guest reviewer read the English home-page traffic as automated and the Arabic as human. Re-querying shows the same flat 24-hour pattern in both locales (19% vs 21% between 01:00 and 05:59). E15 therefore treats the whole stream as suspect.
- **Not verified by me:** the per-folder coverage figures (engineering reviewer, from the HTML report); the class counts for E11, E12 and E13 (issue lists from the engineering reviewer, matched against titles but not each root cause); the trust reviewer's money-integrity aggregates behind E17; the women-only view split (guest reviewer).
- **Not available:** Web Analytics is not enabled, so all traffic comes from `analytics_events`. HyperPay is not readable from here, so E2's test-or-real question needs the founder.
- **Historic ratios** include pre-launch test traffic: 125 bookings came from 13 guests, and only 2 of those guests ever paid. Prefer the 28-day window, and treat even that with care until E2 and E15 ship.
- **No bug filed this run.** The reviewers' defect leads were either already tracked or folded into a card (E3 unreachable-host alert, E4 card chip and copy, E5 alert links and send order).
