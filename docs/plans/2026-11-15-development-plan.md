# Gharmish development plan — 2026-11-15

> Six-week horizon: 2026-11-15 → 2026-12-27. Written by the Development Planner routine, which runs on the 1st and 15th.
> It sits above the Nightly Bug Hunter (#7), the weekly PM routine (Top 3 on 11-13: #320, #101, #279) and the market research (2026-11-12). Defects go to the bug routine; this plan covers improvements only.
> Every number comes from a read-only production query (`gharmish-experiences`), a command run on HEAD `8dd1a53`, or the GitHub API. All scores are estimates.

## الملخص بالعربية

1. للمرة الثانية لم يُنجز أي بند من الخطة السابقة (١ نوفمبر). السبب واضح ومحدد: قاعدة «المُصلح اليومي» تمنعه من فتح أي طلب دمج غير عاجل ما دام في طابور المالك ٨ طلبات أو أكثر، والطابور فيه ١٣ طلباً عالي الخطورة تنتظر `/approve` منذ ٣١ أكتوبر. النتيجة: «لا شيء لأفعله» في ثلاثة أيام متتالية (١٢–١٤ نوفمبر).
2. اقتراح هذه الخطة: بنود التحسين الصغيرة في هذه الخطة اختيرت عمداً بحيث لا تلمس المسارات عالية الخطورة، فبوابة الدمج تدمجها وحدها دون انتظار المالك ولا تزيد طابوره. لذلك نطلب سطراً واحداً في تعليمات المُصلح: «بنود التحسين الصغيرة ذات الخطورة العادية لا تخضع لحد الطابور».
3. «الآن» (أسبوعان): صفحة صادقة حين لا توجد مواعيد (#101)، قياس الصفحات غير المرئية اليوم (صفحات الفئات، وصفحة طلب الاستضافة التي لم تُسجَّل لها زيارة واحدة قط)، تحويل المضيف المعتمَد إلى أول تجربة مع زر حجز المصوّر، رفع حدود تغطية الاختبارات، روابط مشاركة المضيف بالعربية وقابلة للقياس، وعمر بنود قائمة الإدارة وعدد مشاهدات المضيف.
4. «التالي»: إغلاق فئات أخطاء كاملة (القراءات التي تُخفي الفشل، وحدود المدخلات، والحصص الذرّية)، وتنبيه الإدارة حين يُرسل الضيف بيانات حسابه لاسترداد مبلغه، وبطاقة السلامة يوم التجربة، وتقليل الاحتفاظ بالبيانات الشخصية وفق نظام حماية البيانات.
5. قرارات المؤسس، بالترتيب: سطر المُصلح أعلاه (دقيقتان)، جلسة موافقة واحدة تبدأ بإصلاح ثغرة P0 ‏(#268)، ثم حكم «حقيقي أم اختبار» على مستحقات المضيفين (#279).

## Carry-over from the previous plan (2026-11-01)

**0 of 18 Now and Next items shipped, for the second plan running.** The 30-day commit mix is 54 `fix`, 14 `docs`, 6 `test`, 1 `chore`, 0 `feat`.

**Why the Daily Fixer built none of the 🤖 items:** the cards were specific, labelled `improvement` + `S`, and needed no decision. The Fixer's budget rule blocked them: "the owner's queue is ≥ 8, so at most one new PR, and only for a P0, a P1, a `reverted` issue, a red `main` or a dead cron/payment path" (#93, every log 11-05 → 11-11). It posted "Nothing to do" on 11-12, 11-13 and 11-14. Decision 1 of the last plan (an improvement slot regardless of queue size) and #320 step 2 are both unanswered. **The queue holds only HIGH PRs; NORMAL PRs merge on their own** (6 merged by the gate in the week to 11-13 with no owner action, #262). This plan's Decision 1 is narrower than last time's for that reason.

| Item (11-01 id)                                         | Status                       | Evidence                                                                                                                                |
| ------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Now 1 · E1 Daily Fixer improvement slot                 | ⛔ No decision               | #320 and #20 unanswered; 0 owner comments on any PR or issue since 10-31                                                                |
| Now 2 · E4 Honest no-dates + WhatsApp (#101)            | ⛔ Not started (budget rule) | No branch or PR. PM re-verified the file references on `d7146d2` (11-13). Carried to Now                                                |
| Now 3 · E5 Quiet report + self-closing alerts (#276)    | ⛔ Not started (budget rule) | `support_daily_report` unacknowledged rose 36 → 43 → 45. Touches `features/support-agent` (HIGH), so moved to Next                      |
| Now 4 · E6 Ages on admin work queue (#277)              | ⛔ Not started (budget rule) | Carried to Now                                                                                                                          |
| Now 5 · E7 Listing views for hosts (#278)               | ⛔ Not started (budget rule) | 360 listing views in 28 days, still invisible to hosts. Carried to Now                                                                  |
| Now 6 · E14 Audit job + Dependabot (#19)                | ⛔ Not started               | `pnpm audit` still a step inside `checks` (`.github/workflows/ci.yml:26`), no `dependabot.yml`. HIGH (workflow). Next, bundled with F18 |
| Now 7 · E2 SAR 4,810 test-or-real (#279)                | ⛔ No verdict                | Figures unchanged to the riyal (PM 11-13). Carried as a founder decision                                                                |
| Now 8 · E3 Link legacy host (#280)                      | ⛔ Not started               | Founder has not collected the host's phone. Next                                                                                        |
| Next · E10, E13, E9, #102, E11, #104, D6, E16, E17, E15 | ⛔ None started              | No branch or PR for any. Bug classes behind them grew (see "Where we are"). #102 demoted to Later (F7)                                  |

## Where we are

### Engineering mix and pipeline

| Measure                    | Value                                                                                                                                                  | Source                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| Non-merge commits, 30 days | 75: `fix` 54 · `docs` 14 · `test` 6 · `chore` 1 · `feat` 0                                                                                             | `git log --since='30 days ago' --no-merges` |
| PRs merged since 11-01     | 13: 6 code (#275 #310 #311 #319 #342 #356), 7 docs. All NORMAL-risk                                                                                    | GitHub pulls API                            |
| Open PRs                   | 13, all waiting for `/approve` (the oldest since 10-30/31), incl. P0 fix #268, P1 fixes #256 #305 #344 and the Next.js security bump #338              | pulls API, #262 11-13 08:15                 |
| Bugs since 11-01           | 61 opened, 4 closed                                                                                                                                    | issues API (engineering reviewer)           |
| Open bugs                  | 173: P0 1 · P1 4 · P2 28 · P3 141 (+1 P2 filed by this run, #367)                                                                                      | issues API                                  |
| CI, 10-09 → 11-13          | 300 runs. PR failures 38/185, **0 since 11-01**. Push 0 failed, 17 cancelled. Median 5.0 min (PR), 5.6 min (push); push p90 9.7 min                    | Actions API                                 |
| Typecheck / lint / tests   | ✅ / 0 errors, 1 known warning / 229 files, 2,537 tests                                                                                                | #7 11-15; `pnpm test:coverage` on `8dd1a53` |
| Coverage                   | 44.14% stmts, 34.5% branches, 34.13% funcs, 45.01% lines. **CI floors still 20/15/15/20** (`vitest.config.ts:55`). `app/` 8.5%, component folders 0.9% | `pnpm test:coverage`                        |
| Audit / outdated           | 0 high or critical; 2 moderate via `@sentry/nextjs`. 36 packages behind, 11 by a major. `next` 16.4.3 (fix in #338)                                    | `pnpm audit --prod`, `pnpm outdated`        |

**Health trend (#7, 11-11 → 11-15):** build, types, lint and audit green every night; tests 2,535 → 2,537. No new P0. `main` has not moved since 11-13. Every night's new findings sat in HIGH paths, so the hunter filed issues instead of fix PRs. New P2s this fortnight: #322, #323, #328, #345, #362, #363.

### Funnel (last 28 days, 2026-10-18 → 11-15)

| Step                                   | Count                                | Note                                                                                                                       |
| -------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Page views                             | 1,452 (Arabic 340 = 23%; mobile 538) | Only 5 routes are tracked at all. 303 of 1,819 events (17%) sit in 18 burst minutes: a daily sweep of every sitemap URL    |
| Searches                               | 7 (1 zero-result)                    | 6 are category-button filters; the 1 zero-result row is the literal `{search_term_string}` from dead `SearchAction` markup |
| Listing views (`experience_view`)      | 360 (Arabic 146 = 41%)               | The 2 women-only listings take 108 (30%)                                                                                   |
| Booking starts (`bookings.created_at`) | 0                                    | Last 2026-10-06                                                                                                            |
| Paid (`paid_at`)                       | 0                                    | Last 2026-10-02                                                                                                            |

The step that loses everyone is still the booking panel with no dates (owner decision since 10-12). Checkout work stays parked; the guest items below are about honesty (#101) and measuring the traffic we do get.

### Supply (2026-11-15)

| Measure                                  | Value                                                                              |
| ---------------------------------------- | ---------------------------------------------------------------------------------- |
| Hosts                                    | 4 verified · 1 pending · 1 suspended                                               |
| Listings                                 | 8 live (0 sellable) · 1 draft                                                      |
| Verified hosts with no listing           | 1 (verified 09-25)                                                                 |
| Drafts untouched for 60+ days            | 1, blocked only by the hero photo (`features/listings/lib/readiness.ts:96`)        |
| `/hosting` views, 30 days → applications | 81 → 0. `/host/apply` page views ever: **0** (not tracked)                         |
| Category landing page views ever         | **0** (not tracked; 14 sitemap URLs)                                               |
| Owed to hosts                            | 26 bookings, SAR 4,810 gross, from 1 guest account; 0 of 2 owed hosts have an IBAN |
| `payouts` rows ever                      | 0                                                                                  |
| Bank-transfer refunds                    | Average 328 h from cancel to refund (max 985); card refunds 0 h (ops reviewer)     |

## Improvement register

Value 1–5 (revenue, supply, trust, founder time). Confidence 1–5. Effort S = 1, M = 2, L = 4. Sorted by value ÷ effort. **Estimates, not measurements.** "Tier" is the expected merge-gate risk from the paths touched; the gate's own definition decides.

| ID   | Item                                                                               | V   | C   | Eff | V/E | Tier   | Evidence (short)                                                                                                                                                     | Executor        |
| ---- | ---------------------------------------------------------------------------------- | --- | --- | --- | --- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| F1   | Fixer: NORMAL-tier S improvements exempt from the queue cap                        | 5   | 5   | S   | 5.0 | —      | None of the Now 🤖 cards from the last two plans built; "Nothing to do" 11-12/13/14 (#93); NORMAL PRs merge without the owner (#262)                                 | 🧑‍⚖️              |
| E4   | Honest no-dates cards and page + WhatsApp ask (#101)                               | 4   | 5   | S   | 4.0 | NORMAL | `experience-card.tsx:243,255`; 360 views → 0 starts                                                                                                                  | 🤖              |
| F2   | Track the invisible pages: categories, static, host apply                          | 4   | 5   | S   | 4.0 | NORMAL | Category branch returns before tracking (`experiences/[slug]/page.tsx:200-202`); 7 static pages have 0 `trackPageView`; `/host/apply` 0 views ever                   | 🤖              |
| F3   | Approved host → first listing; photographer button                                 | 4   | 4   | S   | 4.0 | NORMAL | Apply "approved" screen links only `/experiences` and `/me` (`host/apply/page.tsx:119,124`); `heroHint` promises a photographer with no action (`en.json:2072`)      | 🤖              |
| F14  | One-click "ask host for bank details" + IBAN chase                                 | 4   | 4   | S   | 4.0 | NORMAL | `/admin/payouts` shows "No IBAN" with no action (`admin/payouts/page.tsx:142-145`); 0 of 2 owed hosts have an IBAN                                                   | 💻 after E2     |
| F4   | Ratchet coverage floors + per-folder money floors                                  | 3   | 5   | S   | 3.0 | NORMAL | `vitest.config.ts:55` floors 20/15/15/20 vs measured 44/34/34/45                                                                                                     | 🤖              |
| F5   | Host share links: Arabic by default, campaign-tagged                               | 3   | 4   | S   | 3.0 | NORMAL | `host-share-card.tsx:39,49,56` shares the bare URL; guest share adds UTM (`share-button.tsx:72`); 97% of page views have no referrer                                 | 🤖              |
| E6   | Ages on the admin work queue (#277)                                                | 3   | 4   | S   | 3.0 | NORMAL | Counts only; oldest pending application 2026-05-27                                                                                                                   | 🤖              |
| E7   | Listing views for hosts (#278)                                                     | 3   | 4   | S   | 3.0 | NORMAL | `getMyListingStats` (`host-experiences/queries.ts:162`) returns no views                                                                                             | 🤖              |
| F6   | Refund "bank details received" alert + split refund queue                          | 3   | 5   | S   | 3.0 | HIGH   | `saveRefundBankDetails` (`bookings/lib/refund-bank-core.ts:18`) raises no alert; `refund_due` fires only from admin actions                                          | 🤖 (`/approve`) |
| F8   | Fail-soft read guard (structural test) + #306                                      | 3   | 4   | S   | 3.0 | mixed  | 79 `catch` blocks return empty/default; `lib/platform-settings.ts:141` causes P2 #306; ~12 open issues                                                               | 💻              |
| F9   | One home for input limits: `lib/limits.ts`, `zCalendarDate`, `zUuidParam`          | 3   | 4   | S   | 3.0 | HIGH   | 9 copies of the date regex; 0 of 7 admin `[id]` pages validate the id; 8 open issues                                                                                 | 🤖 (`/approve`) |
| F10  | PDPL minimisation pass (IP after 7 d, refund bank after 30 d)                      | 3   | 4   | S   | 3.0 | NORMAL | `bookings.created_ip` read only by a 1 h throttle (`request/throttle.ts:162`); 106 rows hold an IP since 06-12                                                       | 💻              |
| F11  | Day-of safety card (911/997/998, host WhatsApp, report link)                       | 3   | 3   | S   | 3.0 | HIGH   | Emergency numbers only in the agent prompt (`support-agent/prompt.ts:35`); 0 hits in `messages/en.json`                                                              | 🤖 (`/approve`) |
| F7   | Remove dead `SearchAction`; ignore templated `q`; demote #102                      | 2   | 5   | S   | 2.0 | NORMAL | `(site)/page.tsx:181-188`; the only zero-result search is `{search_term_string}`; 0 typed searches since 11-02                                                       | 🤖              |
| F12  | Category social cards (women-only first)                                           | 2   | 3   | S   | 2.0 | NORMAL | Category pages use the generic card (`experiences/[slug]/page.tsx:131,137`)                                                                                          | 🤖              |
| F13  | Bilingual, date-honest `/llms.txt`                                                 | 2   | 4   | S   | 2.0 | NORMAL | English only; says instant-book "confirm at payment" (`app/llms.txt/route.ts:54`) with 0 bookable dates; chatgpt.com tag 12 events ≈ Google 14                       | 🤖 after #101   |
| F18  | CI: audit job + Dependabot (#19) + build once + cache + hourly `/api/health` check | 2   | 4   | S   | 2.0 | HIGH   | 3 `next build`s per run (`playwright.config.ts:26`); nothing polls `app/api/health/route.ts`                                                                         | 🤖 (`/approve`) |
| F15  | Platform-fault cancellations refund money, not credit                              | 4   | 4   | M   | 2.0 | HIGH   | `emergencyCancelBooking` always pays credit (`admin/bookings/actions.ts:394-412`) vs policy "refunded 100%" (`en.json:4279`); both cases so far were re-paid by hand | 💻 🧑‍⚖️           |
| E13  | Money read model + refund rail (carried)                                           | 4   | 4   | M   | 2.0 | HIGH   | ~13 open issues (was 14)                                                                                                                                             | 💻              |
| E10  | Booking-access and guest-identity resolver (carried)                               | 5   | 4   | M   | 2.5 | HIGH   | ~15 open issues (was 8), incl. P0 #264, P1 #234, P1 #341                                                                                                             | 💻              |
| F16  | Testable confirmation view (`deriveConfirmationView`)                              | 3   | 4   | M   | 1.5 | HIGH   | `book/confirmed/[ref]/page.tsx` 1,161 lines at 0%; 9 open display bugs                                                                                               | 💻              |
| F17  | One atomic quota primitive (`lib/quota.ts`)                                        | 3   | 4   | M   | 1.5 | HIGH   | 5 separate count-then-insert throttles; 6 open issues (#146 #288 #289 #318 #83 #153)                                                                                 | 💻              |
| #104 | Status machine + `isSellable` (carried)                                            | 3   | 4   | M   | 1.5 | HIGH   | ~14 open issues                                                                                                                                                      | 💻              |
| E11  | Cron batch cursor + truncation notice (carried)                                    | 3   | 4   | M   | 1.5 | mixed  | 9 open issues, now incl. UI caps #355 #332                                                                                                                           | 💻              |
| E5   | Quiet daily report + self-closing alerts (#276)                                    | 3   | 5   | S   | 3.0 | HIGH   | 45 unacknowledged `support_daily_report` rows; touches `features/support-agent`                                                                                      | 🤖 (`/approve`) |

Dropped or linked instead: the chargeback/reversal gap is a defect, filed as **P2 #367**. #102 (Arabic search) is demoted to Later by F7's evidence. The `/hosting` payout-promise copy and the women-only category order need a founder word (Decisions 5–6). The ZATCA wave question is a founder call to the accountant (Decision 7). Already tracked elsewhere: Sentry scrub #362, IBAN-change notice #363, PM #254 (PDPL runbook), PM #11 (notify me), PM #10 (host pipeline).

## Themes

1. **Ship without the owner's queue** (F1, F4, and every NORMAL-tier 🤖 card): the plan's job this cycle is to give the pipeline work it can merge on its own.
2. **See the traffic we already get** (F2, F5, F7, F13): 0 views recorded on 14 category URLs and on `/host/apply`; host shares and ChatGPT visits unattributed.
3. **Honest catalogue, captured demand** (E4/#101, F12): 360 listing views a month meet an empty calendar.
4. **Host activation and money** (F3, E7, F14, E2, E3): one verified host with no listing, one draft stuck on a photo, 0 IBANs on file.
5. **Retire bug classes** (F8, F9, F17, F16, E10, E13, #104, E11): 86 open-issue mentions across these eight classes (some issues sit in two), out of 173 open bugs.

**Balance:** Now has 3 host items (F3, F5, E7), 2 guest items (#101, F2 which also serves hosts), 1 admin item (E6) and 1 pipeline item (F4). Checkout work is absent on purpose: there is nothing to convert while dates stay closed by owner decision.

## Now / Next / Later roadmap

### Now (weeks 1–2, alongside PM Top 3: #320, #101, #279)

| #   | Item                                            | Theme | Size | Executor | Depends on                     | Flags | Issue |
| --- | ----------------------------------------------- | ----- | ---- | -------- | ------------------------------ | ----- | ----- |
| 1   | F1 NORMAL-tier improvements exempt from the cap | 1     | —    | 🧑‍⚖️       | Founder edits the Fixer prompt | 🧑‍⚖️    | #20   |
| 2   | E4 Honest no-dates + WhatsApp ask               | 3     | S    | 🤖       | F1                             | —     | #101  |
| 3   | F2 Track the invisible pages                    | 2     | S    | 🤖       | F1                             | —     | new   |
| 4   | F3 Approved host → first listing + photographer | 4     | S    | 🤖       | F1                             | —     | new   |
| 5   | F4 Coverage floor ratchet                       | 1     | S    | 🤖       | F1                             | —     | new   |
| 6   | F5 Host share links: Arabic + tagged            | 2     | S    | 🤖       | F1                             | —     | new   |
| 7   | E6 Ages on the admin work queue                 | 4     | S    | 🤖       | F1                             | —     | #277  |
| 8   | E7 Listing views for hosts                      | 4     | S    | 🤖       | F1; F5 shares the host page    | —     | #278  |
| 9   | E2 Test-or-real verdict on SAR 4,810            | 4     | —    | 🧑‍⚖️       | 15 minutes in `/admin/payouts` | 🧑‍⚖️    | #279  |

**Capacity:** seven 🤖 S cards fill seven Fixer days. All seven are expected NORMAL tier, so they add nothing to the owner's queue. If F1 is not taken they will not start, exactly as in the last two cycles; nothing else in this plan changes that.

### Next (weeks 3–6)

| #   | Item                                                  | Theme | Size | Executor | Depends on                   | Flags   |
| --- | ----------------------------------------------------- | ----- | ---- | -------- | ---------------------------- | ------- |
| X1  | F8 Fail-soft read guard + #306                        | 5     | S    | 💻       | —                            | —       |
| X2  | F14 Ask-host-for-IBAN + chase email                   | 4     | S    | 💻       | E2 verdict                   | 🧑‍⚖️      |
| X3  | F6 Refund details-received alert + split queue        | 4     | S    | 🤖       | `/approve` (HIGH)            | —       |
| X4  | F9 `lib/limits.ts` + shared validators                | 5     | S    | 🤖       | `/approve` (HIGH)            | —       |
| X5  | F10 PDPL minimisation pass + privacy line             | 5     | S    | 💻       | PM #254 runbook owner        | —       |
| X6  | F11 Day-of safety card                                | 3     | S    | 🤖       | `/approve` (HIGH)            | —       |
| X7  | F7 Dead `SearchAction` + templated `q`                | 2     | S    | 🤖       | —                            | —       |
| X8  | F12 Category social cards                             | 3     | S    | 🤖       | —                            | —       |
| X9  | F13 Bilingual, date-honest `/llms.txt`                | 2     | S    | 🤖       | #101 (shares `no-dates.ts`)  | —       |
| X10 | F18 CI audit job, Dependabot, build once, health ping | 1     | S    | 🤖       | `/approve` (workflow file)   | —       |
| X11 | E5 Quiet report + self-closing alerts (#276)          | 4     | S    | 🤖       | `/approve` (HIGH)            | —       |
| X12 | E10 Booking-access resolver                           | 5     | M    | 💻       | #257, #268, #344 merged      | —       |
| X13 | F16 Testable confirmation view                        | 5     | M    | 💻       | —                            | —       |
| X14 | F17 Atomic quota primitive                            | 5     | M    | 💻       | —                            | —       |
| X15 | F15 Platform-fault refunds in money                   | 4     | M    | 💻       | Decision 4                   | 🧑‍⚖️      |
| X16 | E3 Link legacy host + unreachable alert (#280)        | 4     | M    | 💻       | Founder has the host's phone | 🧑‍⚖️ (🗄) |

E13, #104, E11, D6 and E17 stay in Next from 11-01 with their cards unchanged; promote one of them into a Claude Code session whenever X12–X14 are done.

### Later (parked, with the trigger that would promote each)

- **#102 Arabic search + remove-one-filter:** promote when typed searches exceed 20 a week (0 since 11-02).
- **Admin "messages sent" panel per booking:** promote with E12, or on the first "I was never told" ticket after dates reopen.
- **`cron_runs` history table (🗄):** promote at the first missed-reminder question after dates reopen.
- **AI draft of the missing language at moderation (research H9):** promote at the first listing blocked by `needs_english`.
- **Monthly Arabic host digest email:** promote after E7 ships and 3 hosts have a login.
- **FK index schema test + indexes (🗄):** promote at 2,000 bookings or the first slow-query report.
- **`auditedWrite` helper:** promote with E16, or when #333 or #213 are next in the Fixer's queue.
- **Footer contact line + Terms force-majeure and user-content clauses:** promote when counsel is engaged (legal audit C1/C2).
- **Carried from 11-01, unchanged triggers:** E12 (trigger has fired: #292, #298 — first in line after E11), E19, E22, E24, E25, E26, partnerships WhatsApp, expiring credentials, and the 10-15 list.

## Build cards

### Now

#### F1 — NORMAL-tier improvements exempt from the Fixer's queue cap (🧑‍⚖️)

- **Goal:** let the Daily Fixer build one `improvement` + `S` card per day when the card is expected to merge without `/approve`.
- **Why now:** none of the Now 🤖 cards from the last two plans was built. The cap exists to protect the owner's queue, and a NORMAL PR never enters it (6 NORMAL merges by the gate in the week to 11-13, #262).
- **Scope in:** one line in the Daily Fixer routine prompt (outside this repo): "After any P0/P1, if no other PR is opened this run, build at most one `improvement` + `S` issue listed under Now in #20 whose card says _Tier: NORMAL_, regardless of the owner's queue size. If the PR turns out HIGH, leave it open and pick no further improvement until it merges."
- **Scope out:** HIGH-tier improvements, P2/P3 bugs (their budget rule is unchanged).
- **Metric:** at least 4 `improvement` PRs merged by 2026-11-29 (`gh api 'repos/Gharmish/FWEXMP/pulls?state=closed'`, label/title match).
- **Risk:** a card misjudges its tier. The safeguard is in the line itself.

#### E4 — Honest no-dates + WhatsApp ask (#101) (🤖, carried)

The card on #101 stands as written; the PM re-verified its file references on `d7146d2` (11-13) and nothing in those files has changed since. **Tier: NORMAL expected** (`features/experiences/components`, `app/[locale]/(site)/experiences/[slug]`, `messages`).

#### F2 — Track the pages we cannot see today (🤖)

- **Goal:** record a `page_view` for every public page and for the host application step.
- **Why now:** the 7 category landings (14 sitemap URLs) and `/host/apply` have **0 page views ever**, because they never call `trackPageView`. 81 `/hosting` views in 30 days produced 0 applications and nobody can say where people stop.
- **Scope in:** `app/[locale]/(site)/experiences/[slug]/page.tsx` (the category branch at :200-202, before `return <CategoryLanding …/>`, with `path: '/experiences/[category]'` or the category's URL slug); `app/[locale]/(site)/{hosts,how-it-works,trust-and-safety,cancellation-policy,help,about,wishlist}/page.tsx`; `app/[locale]/(site)/host/apply/page.tsx` (after the auth gate at :40, `path: '/host/apply'`) and `app/[locale]/(site)/host/apply/submitted/page.tsx` (`path: '/host/apply/submitted'`). Copy the existing call shape from `app/[locale]/(site)/hosting/page.tsx:75`.
- **Scope out:** new event types, schema changes, admin dashboard rows (a later card), bot filtering (E15).
- **Acceptance:** [ ] every listed page calls `trackPageView` once per render with a fixed path pattern (no slugs, ids or query strings for private pages); [ ] a unit or structural test lists the public `(site)` pages and fails if one lacks `trackPageView` (allowlist for pages deliberately untracked, with a reason); [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` green.
- **Arabic/RTL:** pass `locale` as the existing calls do, so the Arabic share of each page is measurable.
- **Metric:** `select path, locale, count(*) from analytics_events where type='page_view' and created_at > now()-interval '7 days' and (path like '/experiences/%' or path like '/host/apply%') group by 1,2;` returns rows within a week of merge.
- **Size / executor / deps:** S · 🤖 · none. **Tier: NORMAL expected.**
- **Risks:** tracking a path that contains a slug for an account-only page; keep account pages out.

#### F3 — Turn an approved host into a first listing (🤖)

- **Goal:** every verified host is one tap from starting a listing and from booking the photographer the site promises.
- **Why now:** 1 verified host has had no listing since 09-25. 1 draft has been idle for 60+ days, blocked only by the hero photo (`features/listings/lib/readiness.ts:96`). The approved screen's only buttons go to the catalogue and `/me` (`app/[locale]/(site)/host/apply/page.tsx:119,124`). The checklist hint says "or book our photographer" (`messages/en.json:2072`) with nothing to tap, and it shows only when no listing has a hero (`app/[locale]/host/(dashboard)/page.tsx:136`).
- **Scope in:** (1) On the approved state of `host/apply/page.tsx`, replace the two buttons with "Open your host dashboard" (`/host`) as primary and "Start your first experience" (`/host/experiences/new`) as secondary. (2) In the host dashboard checklist, show the hero hint whenever any draft lacks a hero, and add a "Request a photo shoot" WhatsApp link built with `whatsappLink(supportWhatsappE164(), text)` (`lib/whatsapp.ts:17`, `lib/env.ts:295`) whose prefilled text names the listing title in the host's locale. (3) New copy keys in `messages/en.json` and `messages/ar.json`, in a namespace the page already reads.
- **Scope out:** reminder emails to hosts with no listing (Later), any booking system for photographers.
- **Acceptance:** [ ] approved state shows the two new buttons and no catalogue button; [ ] a host with a draft lacking a hero sees the WhatsApp link; [ ] a host whose drafts all have heroes does not; [ ] if `supportWhatsappE164()` is unset the link is hidden, not broken; [ ] tests for the hint condition; [ ] typecheck, lint, test green.
- **Arabic/RTL:** Arabic copy first («افتح لوحة المضيف»، «ابدأ تجربتك الأولى»، «اطلب جلسة تصوير»); use logical properties; the WhatsApp text in Arabic for `ar` hosts.
- **Metric:** verified hosts with ≥1 listing (`select count(*) from hosts h where verification_status='verified' and exists (select 1 from experiences e where e.host_id=h.id)`), today 3 of 4; drafts with a hero.
- **Size / executor / deps:** S · 🤖 · none. **Tier: NORMAL expected** (`app/[locale]/(site)/host/apply`, `app/[locale]/host/(dashboard)`, `messages`).
- **Risks:** WhatsApp volume to the founder; it is one host today.

#### F4 — Ratchet the coverage floors (🤖)

- **Goal:** CI fails when a change removes a meaningful share of tests, especially in money code.
- **Why now:** floors are 20/15/15/20 (`vitest.config.ts:55`, set at the 2026-09-11 baseline of 21.8%); the suite measures 44.14/34.5/34.13/45.01. The gate auto-merges NORMAL PRs, and nothing would catch a fix that also deletes tests.
- **Scope in:** `vitest.config.ts` only. Global `thresholds` → `{ statements: 42, branches: 32, functions: 32, lines: 43 }`. Add per-glob thresholds about 2 points under today's values for `features/payments/lib/**`, `features/bookings/lib/**`, `features/wallet/**`, `app/api/webhooks/**` (read today's values from `pnpm test:coverage` before setting them). Update the comment with the new baseline date.
- **Scope out:** writing new tests; changing CI workflow files.
- **Acceptance:** [ ] `pnpm test:coverage` passes on `main` with the new floors; [ ] lowering any per-glob folder by deleting one test file there makes it fail (check locally, do not commit that); [ ] comment records the 2026-11 baseline.
- **Metric:** floors in `vitest.config.ts` vs the CI coverage summary.
- **Size / executor / deps:** S · 🤖 · none. **Tier: NORMAL expected** (no workflow file).
- **Risks:** a flaky threshold right at the edge; the 2-point margin avoids that.

#### F5 — Host share links: Arabic by default, campaign-tagged (🤖)

- **Goal:** hosts share links that open in Arabic and that we can attribute.
- **Why now:** `features/hosts/components/host-share-card.tsx:39,49,56` copies, shares and WhatsApps the bare URL, built from the dashboard's locale (`app/[locale]/host/(dashboard)/page.tsx:531`). The guest share button already tags links (`components/ui/share-button.tsx:72`). 97% of page views carry no referrer, so WhatsApp traffic reads as "direct".
- **Scope in:** build the URL as `${SITE_URL}/ar/hosts/${slug}?utm_source=host&utm_medium=share&utm_campaign=${slug}` in `page.tsx:531`; keep the copy-to-clipboard and native-share paths using the same URL; optional language toggle (ar/en) on the card defaulting to Arabic.
- **Scope out:** per-listing share cards (Later); reading UTM into analytics (the existing capture keeps `utm_source` as the campaign tag; verify, do not change the schema).
- **Acceptance:** [ ] all three share paths use the tagged Arabic URL; [ ] the displayed URL stays readable (strip the query for display only); [ ] a component or unit test asserts the URL; [ ] typecheck, lint, test green.
- **Arabic/RTL:** Arabic is the default because Aseer hosts share into Arabic WhatsApp groups.
- **Metric:** `select count(*) from analytics_events where created_at > now()-interval '14 days' and path like '/hosts/%' and locale='ar'` (Arabic share of host-page views, 67 of 169 in the last 28 days) plus events carrying the host tag.
- **Size / executor / deps:** S · 🤖 · none. **Tier: NORMAL expected.**
- **Risks:** an English-speaking host wants an English link; the toggle covers it.

#### E6 — Ages on the admin work queue (#277) and E7 — Listing views for hosts (#278) (🤖, carried)

Cards on #277 and #278 stand as written. **Tier: NORMAL expected** for both (`features/admin/dashboard`, `features/host-experiences`, host dashboard pages). E7 and F5 both touch the host dashboard page; build them on separate days.

#### E2 — Test-or-real verdict (#279) (🧑‍⚖️, carried)

The ask on #279 is unchanged: 15 minutes in `/admin/payouts` against the HyperPay settlement report, then post "real", "test" or "mixed" with counts only. F14 (IBAN chase) and #14 both wait on it.

### Next

#### F8 — Fail-soft read guard (💻, S guard + M sweep)

- **Goal:** a read failure on an admin or host surface throws to the error boundary instead of rendering "no data" or code defaults; public surfaces keep degrading on purpose, by an explicit allowlist.
- **Why:** 79 `catch` blocks return `[]`, `null`, `0`, `{}` or `DEFAULT_*` (14 without logging). `lib/platform-settings.ts:141` returns `DEFAULT_SETTINGS`, which is P2 #306 (admin saves defaults over real VAT and commission). Related open issues: #306, #299, #308, #217, #114, #272, #298, #301. PR #310 fixed one site by hand.
- **Approach:** `lib/fail-soft.test.ts`, modelled on the `CLIENT_NAMESPACES` structural test in `lib/client-messages.ts`: scan `features/**/queries.ts`, `features/**/*-queries.ts` and `lib/*.ts` for `catch` blocks that return an empty value; fail unless the site is in an allowlist with a reason. Seed the allowlist with today's public and SEO sites. Then switch `/admin/settings` to the strict settings read (fixes #306) and convert `features/host-applications/admin-queries.ts:79,93,145,172` (#299).
- **Acceptance:** guard test in CI; #306 and #299 closed by the PR; allowlist reviewed in the PR body.
- **Metric:** allowlist length shrinks each sweep; issues in the class closed.
- **Risks:** a converted public read starts throwing. Keep public surfaces on the allowlist.
- **Tier:** mixed (`lib/platform-settings.ts` and admin settings likely HIGH). Executor 💻.

#### F14 — Ask the host for bank details (💻, S, after E2)

- **Goal:** the founder can request a missing IBAN in one click, and the system re-asks every 14 days while money is owed.
- **Why:** 0 of 2 owed hosts have an IBAN; `/admin/payouts` shows a plain "No IBAN" (`app/[locale]/admin/payouts/page.tsx:142-145`); the only prompt is inside the host dashboard (`app/[locale]/host/(dashboard)/page.tsx:183-189`), unseen unless the host signs in.
- **Approach:** a TOTP-gated `requestHostIban` admin action (bilingual email, Arabic first, owed amount from the `features/bookings/lib/payout-sql.ts` predicate, audit row, 72 h dedupe); a maintenance pass with the same email every 14 days; work-queue label "N of M owed hosts missing bank details".
- **Dependency:** only switch it on after the E2 verdict says the money is real. Host with no login stays with E3.

#### F6 — Refund "bank details received" alert (🤖, S, HIGH)

- **Goal:** the founder is told the moment a guest's refund can be wired.
- **Why:** `saveRefundBankDetails` (`features/bookings/lib/refund-bank-core.ts:18`, called from `features/bookings/refund-bank-actions.ts:91` and `features/support-agent/tools.ts:695`) raises nothing; `refund_due` fires only from admin actions (`features/admin/bookings/actions.ts:201,290`). Bank refunds average 328 h from cancel to refund.
- **Approach:** after a successful save, `notifyAdmin('refund_due', { stage: 'details_received', … })` with a per-booking fingerprint; dashboard query adds `refundsReadyCount`; the work queue (`app/[locale]/admin/page.tsx:220-226`) shows "waiting on guest" and "ready to wire" rows.
- **Acceptance:** alert on save, no duplicate on a corrected re-save within the fingerprint window, two queue rows, tests for both.

#### F9 — One home for input limits (🤖, S, HIGH)

- **Goal:** each boundary limit and route-param check is defined once.
- **Why:** 9 copies of `/^\d{4}-\d{2}-\d{2}$/` (e.g. `features/bookings/schemas.ts:61,177`, `features/availability/actions.ts:17`, `features/host-bookings/queries.ts:72`), none rejecting 2026-02-30 (#351, #150); support replies capped at 4,096 vs Twilio 1,600 (`features/support/schemas.ts:5`, #296); 0 of 7 admin `[id]` pages validate the id (#295); #294, #353, #202, #339.
- **Approach:** `lib/limits.ts` constants; `zCalendarDate` (regex + `Date.UTC` round-trip) and `zUuidParam` next to `lib/uuid.ts`; replace the copies; `notFound()` on a bad id in admin detail pages. If D6 lands first, put `zCalendarDate` in its Riyadh helper.
- **Acceptance:** grep finds no copy of the date regex outside `lib/`; the 8 linked issues closed or re-checked.

#### F10 — PDPL minimisation pass (💻, S)

- **Goal:** personal data is cleared when its purpose ends.
- **Why:** `bookings.created_ip` is written on every booking (`features/bookings/lib/request/insert.ts:63`) and read only by a 1 h throttle (`features/bookings/lib/request/throttle.ts:162`); 106 rows hold an IP, the oldest from 06-12. One settled refund has kept its bank details for 86 days. The privacy page does not list IP addresses.
- **Approach:** `features/maintenance/passes/minimise.ts`: null `created_ip` after 7 days; null the three refund-bank columns 30 days after the refund is settled; one sentence about IPs in the privacy copy (both languages; bump the policy version per `lib/legal.ts`).
- **Dependency:** align with the owner of PM #254 (breach runbook). No migration.

#### F11 — Day-of safety card (🤖, S, HIGH)

- **Goal:** a guest on the day of the experience has the emergency numbers and the host's WhatsApp in one place.
- **Why:** 911 / 997 / 998 appear only in the agent prompt (`features/support-agent/prompt.ts:35`); 0 hits in `messages/en.json`. No host insurance (owner decision), so the first minutes of an incident carry the risk.
- **Approach:** `SafetyCard` component (en/ar) on `/book/confirmed/[ref]` for confirmed bookings, one block in the 24 h reminder email, one line on `/trust-and-safety`.

#### F7, F12, F13 (🤖, S, NORMAL)

- **F7:** remove the `potentialAction` `SearchAction` block in `app/[locale]/(site)/page.tsx:181-188` (Google retired the sitelinks search box) and treat a `q` containing `{` or `}` as empty in `features/experiences/lib/search.ts:151`. Metric: zero-result searches in `/admin/analytics` reflect real users.
- **F12:** a category `card.png` route reusing `lib/og/satori-arabic.ts` and the category colour map, wired into the category branch's metadata (`app/[locale]/(site)/experiences/[slug]/page.tsx:131,137`); extend `app/og-image-coverage.test.ts`. Women-only first.
- **F13:** make `app/llms.txt/route.ts` bilingual through `pickLocalized`, replace the "confirm at payment" line (:54) with the truth from #101's `no-dates.ts` helper, and add a Categories section. After #101.

#### F18 — CI bundle (🤖, S, HIGH: one workflow PR)

#19's card (audit as its own job + `.github/dependabot.yml`) plus: build once in `checks` and hand `.next/` to both e2e jobs (`playwright.config.ts:26` currently rebuilds); cache `~/.cache/ms-playwright` and `.next/cache`; a scheduled hourly job that runs `curl -fsS https://gharmish.com/api/health` so a failing app emails the owner through GitHub. One PR, one `/approve`.

#### E5 (#276), E10, F15, F16, F17, E3 (#280)

- **E5:** card on #276 stands; it is HIGH because it touches `features/support-agent/report.ts`. Unacknowledged reports are now 45.
- **E10:** 11-01 card stands; the class has grown to about 15 open issues (#130 #131 #180 #181 #210 #234 #252 #253 #258 #264 #317 #328 #331 #341 #365). Start after #257, #268 and #344 merge, because they change the same lines.
- **F15:** on the bank rail, `emergencyCancelBooking` (`features/admin/bookings/actions.ts:394-412`) stamps `refund_due_sar` and collects bank details through `saveRefundBankDetails`, with credit as an opt-in for the guest. Needs Decision 4. Touches the same rail as E13; build together.
- **F16:** extract `deriveConfirmationView(booking, settings, now)` from `app/[locale]/book/confirmed/[ref]/page.tsx` into `features/bookings/lib/confirmation-view.ts` with table tests (unpaid instant hold, approved request awaiting payment, processing, promo + credit, Arabic sign placement). Closes or tests #293, #316, #350, #366.
- **F17:** `lib/quota.ts` `consumeQuota(tx, { kind, key, max, windowMs })` with `pg_advisory_xact_lock(hashtext(kind || key))`, count and insert into `auth_throttle_events` in one transaction (the pattern in `features/wallet/ledger.ts:139`). Migrate the admin TOTP throttle first (#146), then the hold throttles (#289). No migration.
- **E3:** card on #280 stands; waits on the founder having the host's phone.

## Decisions needed from the founder

In priority order. Each is answerable in a sentence on the linked issue.

1. **F1 — one line in the Daily Fixer prompt** (#20, also #320 step 2). NORMAL-tier improvement cards then ship without you. Two minutes.
2. **One approval session** (#320): `/approve` #268 (P0) → #344 (P1) → #338 (Next.js security) → #256 (P1) → #305 (P1), then the rest. Thirty minutes, and it also unblocks E10.
3. **E2 verdict** (#279): real, test or mixed for the 26 owed bookings. Fifteen minutes. F14 and #14 wait on it.
4. **F15:** should a platform-fault cancellation (weather, safety, host no-show) on the bank rail pay back money by default, as the cancellation policy says, rather than Gharmish Credit?
5. **`/hosting` copy:** state the real payout timing so «تُصرف مستحقاتك عند اكتمال الحجز» can be made true (0 payouts so far).
6. **Women-only category order:** may the category row and home tiles show women-only and food first (display order only; women-only listings take 30% of listing views)?
7. **ZATCA wave question (research N11):** ask the accountant whether the CR has VAT registration or other 2025 taxable revenue. If not, N11 closes (2026 gross so far is SAR 5,505).

## Method and limitations

- **Sources:** read-only SELECTs on `gharmish-experiences` (one statement each, aggregates only); `pnpm test:coverage` on `8dd1a53`; GitHub REST for issues, PRs, Actions and the #7, #93, #262, #320 logs; the 11-13 PM report and 11-12 research. Five parallel read-only reviewers (guest, host, ops, engineering, trust) produced leads; every top-ten item above was re-checked in the code or with a fresh query by the planner.
- **Tier column:** inferred from the HIGH paths the merge gate has named in #262 (`features/payments`, `book/**` pages, `features/account`, `features/bookings/lib`, `features/auth`, `features/support-agent`, `features/admin/experience-moderation`, workflow files). The gate's own definition is not in the repository; it decides.
- **Traffic:** about 17% of events come from a daily sitemap sweep (likely an automated crawler, possibly one of our own routines). Listing-view counts include it; E15 owns the cleaning.
- **Not verified:** whether the existing analytics capture keeps `utm_campaign` (F5 says to check, not change); HyperPay's exact chargeback notification payload (bug #367 is written against the code paths, not a live sample); the shallow clone limits churn history to about 60 days.
- **Scores** are planner estimates for ordering, not measurements.
