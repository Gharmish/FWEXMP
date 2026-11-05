# Market research — 2026-11-05

> Fifth report in this series. It builds on [2026-10-12](./2026-10-12-market-research.md), [2026-10-15](./2026-10-15-market-research.md), [2026-10-22](./2026-10-22-market-research.md) and [2026-10-29](./2026-10-29-market-research.md), all on `main`. It repeats none of their recommendations (G1–G11, H1–H8, N1–N9, Q1–Q21). New IDs start at N10 and Q22.
> Research ran through web-search excerpts only, because full pages could not be opened from this environment. Every source therefore carries ★. Check the original before quoting a figure externally.
> A quiet week: no competitor shipped a feature worth copying, and the market evidence for the existing Top 5 items (G8, G9, G10, G11, H8) has not changed. This report is deliberately short. Two of its five items are owner tasks with no code.

## الملخص التنفيذي

- **منصة «اكتشف عسير» الرسمية:** تعرض هيئة تطوير منطقة عسير أكثر من 100 تجربة من مشغّلين محليين، فيها زر «احجز الآن» وتصفية حسب طريقة الحجز (إلكتروني، هاتف، في الموقع). وتقرير SEO الأخير يذكر أنها صارت تظهر في نتائج بحث «تجارب أبها». نوصي المالك بطلب إدراج تجارب مضيفي غارميش فيها مع رابط الحجز الإلكتروني.
- **73 من 87 عملية بحث بلا نتائج (84%)، و81 منها بالعربية:** تقول دراسة Google Cloud إن 8 من كل 10 متسوقين يغادرون الموقع بعد بحث فاشل. نقترح زر واتساب في صفحة «لا نتائج» يحمل نص البحث نفسه، ليتحول البحث الفاشل إلى محادثة وطلب معروف.
- **سدايا تقترح مهلة 20 يوم عمل للرد على طلباتها:** انتهت الاستشارة العامة اليوم (5 نوفمبر). نوصي بإضافة هذه المهلة إلى إجراء الإبلاغ عن التسرّب (#254) قبل كتابته.
- **الفوترة الإلكترونية (المرحلة الثانية)، الموجة 25:** تشمل من تجاوزت إيراداته الخاضعة 187,500 ريال في 2025، والموعد 1 فبراير 2027. المطلوب أن يتأكد المالك مع المحاسب هل تشمل الموجة غارميش، لأن الربط مع «فاتورة» غير مبني بعد.
- **رمضان 1448 ما زال الموعد الأهم:** يبدأ في نحو 8 فبراير 2027. توصية جدول رمضان (G9) يجب أن يبدأ تنفيذها في ديسمبر.

## Executive summary

- **Get listed on Discover Aseer, the official regional portal (N10, owner task).** The Aseer Development Authority's site lists 100+ experiences from local operators, with "Book Now" buttons and a booking-method filter (online, phone, on site) [1][2]. The 2026-11-04 SEO report found it newly ranking for "Abha experiences" and "Aseer tours". Ask for Gharmish hosts' listings to appear there with an online booking link.
- **84% of searches return nothing; turn them into WhatsApp conversations (Q23, Fixer S).** 73 of 87 searches in 28 days had zero results, and 81 were in Arabic (dev plan 2026-11-01). About 8 in 10 shoppers say they leave after an unsuccessful search [3]. Add a WhatsApp button to the `/experiences` empty state, prefilled with the guest's query. It complements, and does not replace, the planned Arabic search fix (#102).
- **SDAIA proposes a 20-business-day deadline to answer its requests (Q22).** The public consultation on the PDPL implementing-regulation amendments ran 6 Oct to 5 Nov 2026 [4][5]. Write this deadline into the breach runbook (#254) while it is being drafted.
- **ZATCA Phase 2 e-invoicing, Wave 25 (N11, owner task).** It covers taxpayers with 2025 taxable turnover above SAR 187,500, and they must integrate with Fatoora by 1 Feb 2027 [6][7]. Gharmish produces Phase 1 QR invoices but has no Fatoora integration, so the owner must confirm with the accountant whether the entity is in scope.
- **Competitors are quiet.** GetYourGuide's April AI release (review summaries, operator inbox, personalised search) and its September Creator Reviews beta are the latest product news [8][9][10]. Airbnb's last Experiences release was May 2026 [11]. Klook's IPO withdrawal (16 Oct) was covered last week.

## Current state (re-verified 2026-11-05)

The inventories in the earlier reports still hold. Since the 2026-10-29 report, `main` received only bug fixes, docs and the 2026-11-01 plan (no `feat` commits; `git log --since=2026-10-28`). Facts verified for this report:

- **Search:**
  - Free-text search matches titles, place and host only (`features/experiences/lib/search.ts:249-262`, per the plan's #102 card).
  - Each search is logged with its query and result count (`features/analytics/capture.ts:219-232`), and the admin dashboard groups queries (`features/admin/dashboard/metrics-queries.ts:583`).
  - The zero-result state on `/experiences` is an `EmptyState` with a single "reset" link (`app/[locale]/(site)/experiences/(catalog)/page.tsx:273-292`). It has no contact route.
  - A WhatsApp deep-link helper exists (`lib/whatsapp.ts:17`) and the support number is read by `supportWhatsappE164()` (`lib/env.ts:295`).
- **Tax:**
  - ZATCA Phase 1 QR on invoices exists (`features/bookings/lib/zatca-qr.ts`, `app/[locale]/(site)/book/confirmed/[ref]/invoice/page.tsx`).
  - An admin VAT page tracks the SAR 375,000 mandatory and SAR 187,500 voluntary registration thresholds (`features/admin/vat/thresholds.ts:8-9`, `app/[locale]/admin/vat/page.tsx`).
  - **Missing:** Phase 2 (Fatoora clearance or reporting, CSID onboarding). `grep -rniE 'csid|clearance' features lib` finds only unrelated "phase 2" comments in the support agent.
- **Privacy:** no breach runbook yet (`docs/security/` holds only `security-audit-2026-08-02.md`). Issue #254 (runbook plus booking-scoped agent reads) is open.
- **Ramadan:** no seasonal schedule in code (`grep -rli ramadan features db app` returns 0). G9 is unbuilt.
- **Discovery channels:** no mention of Discover Aseer in `docs/` before the 2026-11-04 SEO report.
- **Funnel and supply (from the 2026-11-01 plan, not re-queried):** 322 listing views, 2 booking starts and 0 paid in 28 days. All 8 live listings have no bookable dates (owner decision; not re-proposed here).

## What changed in the market (since 2026-10-29, or not covered before)

### Global competitors

- **GetYourGuide:**
  - Its Spring 2026 release (22 Apr) added AI review summaries at the top of reviews, personalised search, and an inbox for travellers to message operators before or after booking [8][9].
  - Its ChatGPT app (75,000+ activities) appears in an app tracker from 21 Apr 2026 [12].
  - The Creator Reviews beta (Sep 2026) was covered on 10-22. No new launch was found since.
- **Airbnb:** the latest Experiences news is the May 2026 summer release (relaunch with Services, and a planned "Connections & Travel Map") [11]. Nothing newer was found.
- **Airbnb fees:** one marketing blog says Experiences carry a 20% commission, against Gharmish's 15% [13]. It is single-sourced and was not verified on Airbnb's help pages, so it is not used as evidence for H1.
- **Viator, Klook, Headout:** no new product news found [14].

### Saudi Arabia and the GCC

- **Discover Aseer (Aseer Development Authority):**
  - Lists 100+ bookable experiences [1].
  - Some operator listings (Husaak, Hihome, Tmashi, 365 Adventures) show "Book Now". Others show a phone number, and the catalogue filters by booking method [2].
  - Its outdoor guide tells visitors to contact tour operators through the platform [2].
  - It also carries winter-specific experiences (for example a Habala winter experience and a winter Deera night at Aqabat Dila) [2][15].
- **Demand:**
  - Domestic trips reached 28.9M in Q1 2026 (+16%), with SAR 34.7B spending (+8%) [16][17].
  - Riyadh Season 2026 opened on 21 Oct for about 10 weeks [18].
  - No official 2026–27 Aseer winter programme was found (searched again this week) [15].
- **PDPL:** SDAIA's draft amendments to the implementing regulation were open for comment from 6 Oct to 5 Nov 2026 [4][5]. The headline change is a 20-business-day period to answer SDAIA requests about PDPL compliance [5]. No new fine announcements were found. One secondary source says violation committees began hearing cases around June 2026 [19].
- **ZATCA e-invoicing:**
  - Wave 25 criteria (set 24 Jul 2026): taxable turnover above SAR 187,500 in calendar 2025, with Fatoora integration due by 1 Feb 2027 [6][7].
  - It is the first wave to use 2025 revenue [6].
  - Wave 24's deadline (30 Jun 2026) has passed [7].
- **Ramadan 1448:** expected to start about 8 Feb 2027, with Eid al-Fitr about 9–11 Mar [20][21]. The prior Ramadan–Eid holiday saw about 10M domestic tourists (+14%) [22]. This is the same evidence behind G9, so G9 is not revisited, but its December start date stands.

### Trends

- **Site search:** in a Google Cloud survey across 14 countries, about 80% say an unsuccessful search makes them more likely to leave and buy elsewhere [3]. A vendor study says 60% keep shopping if alternatives are offered on a zero-result page [23]. Both are survey data, not measured behaviour.
- **Arabic search:** common search stacks lack hamza, ya and taa-marbuta normalisation [24]. People also search in colloquial spellings rather than MSA [25]. No Saudi conversion data was found. This supports the planned #102 fix, which this report does not duplicate.
- **WhatsApp commerce:** Meta is testing a "Business AI" in WhatsApp and announced in-chat UPI payments for India (May 2026) [26]. No official Saudi riyal in-chat payment launch was found. Only a regional agency blog forecasts one [27]. No recommendation.

### Pain points (new evidence)

- **No-shows:** guidance for operators recommends a pre-trip reconfirmation link and a clear no-show window [28][29]. Both sources are vendor content with no independent 2026 data. Gharmish already sends two-stage WhatsApp reminders, so no recommendation while dates are closed.
- **Host payouts:** the only payout-hold evidence found concerns Airbnb stays hosts, where identity checks held funds for weeks [30][31]. It is not Experiences-specific. It supports the plan's payout item (#14) and adds nothing new.

## Recommendations

### Guest experience

**Q23. WhatsApp "tell us what you're looking for" on zero-result searches** (quick win, written as a complete card for the PM)

- **What:**
  - On `/experiences`, when `results.length === 0` and the catalogue is not empty, add a second action next to "reset": a WhatsApp button.
  - Its prefill carries the query. Arabic: «السلام عليكم، أبحث عن تجربة: {q}». English: "Hi, I'm looking for an experience: {q}".
  - When `criteria.q` is empty (filters only), the prefill is «السلام عليكم، أبحث عن تجربة مناسبة لي».
  - It renders nothing when `supportWhatsappE164()` returns null.
- **Why now:**
  - 73 of 87 searches in 28 days returned nothing, and 81 of them were in Arabic (dev plan 2026-11-01).
  - About 8 in 10 shoppers say they leave after an unsuccessful search [3], and offering an alternative keeps a majority engaged [23].
  - #102 will reduce zero results but not remove them. With 8 listings, many searches will legitimately find nothing.
  - Each conversation also tells the owner what to recruit hosts for.
- **Who:** guest (a next step instead of a dead end), admin (demand signal in the WhatsApp inbox).
- **Impact / effort:** Med / S. Same pattern as the plan's E4 WhatsApp ask, on one more screen.
- **Saudi fit:** WhatsApp is the expected channel (87% of Gharmish WhatsApp messages in 90 days were read, per the plan). The prefill is short, polite Gulf-neutral Arabic.
- **Codebase:**
  - `app/[locale]/(site)/experiences/(catalog)/page.tsx:276-292` (the `action` prop of `EmptyState`; server component, no `"use client"`)
  - `lib/whatsapp.ts:17` (`whatsappLink`), `lib/env.ts:295` (`supportWhatsappE164`)
  - `messages/en.json` and `messages/ar.json`: new keys next to the catalogue `empty.*` keys, for example `empty.askCta` («اسألنا على واتساب») and `empty.askPrefill` / `empty.askPrefillNoQuery`
- **Acceptance criteria:**
  - A render test: a zero-result page with `q='خيل'` shows a link whose `href` starts with `https://wa.me/` and contains the URL-encoded query.
  - With the support number unset, no button renders.
  - The query is truncated to 100 characters in the prefill.
  - `en`/`ar` key parity holds. `pnpm typecheck`, `pnpm lint` and `pnpm test` pass.
  - Logical properties only. Checked at 390 px in RTL.
- **Metric:** WhatsApp conversations started per week (1 in the last 28 days). Read alongside the zero-result share already logged.
- **Who executes:** Daily Fixer, once filed as `pm-priority` + `S` (or `improvement` + `S`). If E4 lands first, reuse its copy style and button.

### Host experience

No new host recommendation this week. No new competitor host tool or host pain point was found that the plan (#14 payouts, E7 listing views, E3 legacy hosts) or earlier reports (H1–H8) do not already cover.

### New features and trends to catch

**N10. Get Gharmish experiences listed on Discover Aseer** (owner task, no code)

- **What:**
  1. Contact the Aseer Development Authority's Discover Aseer team and ask to list each Gharmish host's experience, with Gharmish as the online booking method.
  2. Each listing should link to the Gharmish listing URL (`/ar/experiences/<slug>`), with a UTM tag (for example `utm_source=discoveraseer`). Booking capture already records UTMs.
  3. Ask whether a marketplace can be listed as the booking channel for verified hosts, or whether each host must apply as a licensed operator. The answer also informs N8 (platform licence).
- **Why now:**
  - It is the official regional catalogue: 100+ bookable experiences, a map and operator "Book Now" buttons [1][2].
  - It now ranks for "Abha experiences" and "Aseer tours" (SEO report 2026-11-04).
  - It carries winter-specific experiences, so the season is active there now [2].
- **Who:** host (free distribution), admin and owner (attributable traffic).
- **Impact / effort:** Med-High / S (owner time). It is the strongest local channel found so far, but it may require host licences.
- **Saudi fit:** a government-backed, Arabic-first channel aimed at domestic visitors. It complements N6 (flynas, Saudi Winter, STA Seasonal Offers).
- **Codebase:** none. UTM capture already exists (`features/analytics/utm-capture.tsx`). Do it once listings have dates. Until then, ask and prepare; do not send traffic to listings with no dates.

**N11. Confirm Gharmish's ZATCA Phase 2 wave before 1 Feb 2027** (owner and accountant task)

- **What:**
  1. Ask the accountant whether the Gharmish legal entity had 2025 taxable turnover above SAR 187,500 (Wave 25), and whether ZATCA has notified it.
  2. If yes, Fatoora integration (CSID onboarding, then simplified-invoice reporting within 24 hours) is an L build for a Claude Code session, and it must start now.
  3. If no, record that the entity is not in Wave 25 and set a reminder for the next wave, which will likely use 2026 turnover.
- **Why now:** the Wave 25 deadline is 1 Feb 2027 [6][7]. Gharmish invoices carry only the Phase 1 QR (`features/bookings/lib/zatca-qr.ts`), and no Fatoora code exists.
- **Who:** admin and owner.
- **Impact / effort:** High if in scope, otherwise none / S to check. A missed integration is a tax-compliance breach, not a product gap.
- **Saudi fit:** a direct Saudi tax obligation.
- **Codebase (only if in scope):** `features/bookings/lib/zatca-qr.ts`, the invoice page `app/[locale]/(site)/book/confirmed/[ref]/invoice/page.tsx`, `features/admin/vat/`, `features/payments/settle.ts`.

**N3 (watch, unchanged).** GetYourGuide's ChatGPT app now lists 75,000+ activities [12]. With 8 listings and no dates, Gharmish stays on "watch".

### Quick wins (< 1 week)

- **Q22. Add the SDAIA request deadline to the breach runbook (#254).** When #254 writes `docs/security/breach-runbook.md`, add a section titled "Requests from SDAIA". It should cover:
  - who receives SDAIA correspondence (the data-protection contact the PM asked the founder to name);
  - a 20-business-day response target, matching the draft amendment [5];
  - where answers are filed.

  It takes about 30 minutes inside the same PR, with no code. If the final regulation differs, update the number.

- **Q23.** The zero-result WhatsApp ask (card above).
- **N10.** The Discover Aseer request (owner, about one hour plus follow-up).
- **N11.** The ZATCA wave check (owner and accountant, one email).

## Top 5 for next sprint (impact ÷ effort)

1. **Q23 – WhatsApp ask on zero-result searches** (Med / S, Daily Fixer). 84% of searches currently dead-end.
2. **N10 – List Gharmish experiences on Discover Aseer** (Med-High / S, owner). The official Aseer catalogue now ranks for the core queries.
3. **N11 – Confirm the ZATCA Phase 2 wave with the accountant** (High if in scope / S, owner). The deadline is 1 Feb 2027 and no Fatoora integration exists.
4. **Q22 – SDAIA 20-business-day request clause in the #254 runbook** (Med / S). It can go into the same PR as the runbook.
5. **G9 – Ramadan schedule per listing (carried from 2026-10-22, no new evidence)** (Med-High / M, Claude Code session). Ramadan starts about 8 Feb 2027, so work must start in December.

Still open from earlier reports and unchanged in priority: G11 (data download and deletion), H8 and Q21 (host-sourced link), G8 (instant credit refund), N8 (MoT licence question).

## Sources

★ = claim verified from a search excerpt only (full pages could not be opened from this environment).

1. ★ Discover Aseer, experiences catalogue (Aseer Development Authority) — https://discoveraseer.com/en/experiences
2. ★ Discover Aseer, outdoor activities guide and experience pages (booking method filter, operator "Book Now", winter experiences) — https://discoveraseer.com/assets/outdoor-activities-guide-english.pdf ; https://discoveraseer.com/en/experiences/experience-habala-winter
3. ★ Google Cloud, "New research on search abandonment in retail" (14-country survey) — https://cloud.google.com/blog/topics/retail/new-research-on-search-abandonment-in-retail
4. ★ Clyde & Co, "The SDAIA publishes draft amendments to the Implementing Regulations of the PDPL", Oct 2026 — https://www.clydeco.com/en/insights/2026/10/sdaia-publishes-draft-amendments-to-the-pdpl
5. ★ Al Tamimi & Co, "SDAIA opens public consultation on proposed amendments to the PDPL Implementing Regulation", 9 Oct 2026 — https://www.tamimi.com/news/sdaia-opens-public-consultation-on-proposed-amendments-to-the-pdpl-implementing-regulation/
6. ★ EY Tax News, "Saudi Arabia announces 25th wave of Phase 2 e-invoicing integration", 10 Aug 2026 — https://taxnews.ey.com/news/2026-1705-saudi-arabia-announces-25th-wave-of-phase-2-e-invoicing-integration
7. ★ Wafeq, "Which ZATCA wave am I in? Deadlines and what to do" — https://www.wafeq.com/en-sa/tax-and-reporting/which-zatca-wave-am-i-in-deadlines-and-what-to-do
8. ★ GetYourGuide via GlobeNewswire, "GetYourGuide Launches AI-Powered Features…", 22 Apr 2026 — https://www.globenewswire.com/news-release/2026/04/22/3279001/0/en/GetYourGuide-Launches-AI-Powered-Features-to-Help-Travelers-Book-Tours-and-Activities-with-Confidence.html
9. ★ Skift, "GetYourGuide's AI Updates Target the Gap Between Planning and Booking", 22 Apr 2026 — https://skift.com/2026/04/22/getyourguide-ai-updates/
10. ★ Skift, "GetYourGuide Taps Creators to Write Reviews for Tour Operators", 15 Sep 2026 — https://skift.com/2026/09/15/getyourguide-creator-reviews-new-listings/
11. ★ Smoobu, "Airbnb 2026 Summer Release: What Hosts Need To Know" — https://www.smoobu.com/en/?p=72084
12. ★ Drio app tracker, GetYourGuide ChatGPT app (first seen 21 Apr 2026) — https://www.getdrio.com/app-tracker/getyourguide
13. ★ Boostly, "How much does Airbnb charge hosts" (marketing blog, single source for the 20% Experiences figure) — https://boostly.co.uk/how-much-does-airbnb-charge-hosts/
14. ★ Wikipedia, Klook (IPO withdrawal 16 Oct 2026; no newer competitor news found) — https://en.wikipedia.org/wiki/Klook_(company)
15. ★ TripBase, Asir Mountains festivals (winter festival typically Dec–Jan; next edition 2027) — https://www.tripbase.com/destinations/asir-mountains-saudi/festivals/
16. ★ Arab News, "Saudi domestic tourism rises 16% in Q1: Ministry" — https://www.arabnews.com/node/2639192
17. ★ Scene Now, "Saudi Domestic Tourism Reaches 28.9 Million Trips in Q1 2026" — https://www.scenenow.com/News/Saudi-Domestic-Tourism-Reaches-28-9-Million-Trips-in-Q1-2026
18. ★ Gulf News, "Riyadh Season 2026 to begin on October 21 with 10 weeks of entertainment" — https://gulfnews.com/world/gulf/saudi/riyadh-season-2026-to-begin-on-october-21-with-10-weeks-of-entertainment-1.500689955
19. ★ Beeble, "Saudi Arabia's data protection turning point" (secondary; committees hearing cases from June 2026) — https://beeble.com/en/blog/saudi-arabia-s-data-protection-turning-point-sdaia-shifts-from-awareness-to-enforcement
20. ★ The National, "Ramadan 2027: UAE dates and Eid Al Fitr holiday", 6 Oct 2026 — https://www.thenationalnews.com/news/uae/2026/10/06/ramadan-2027-uae-dates-eid-al-fitr-holiday/
21. ★ Wego, "When is Ramadan 2027?" — https://blog.wego.com/ramadan-2027/
22. ★ Zawya, "Saudi Ramadan and Eid boost domestic tourism to 10mln visitors" — https://www.zawya.com/en/business/travel-and-tourism/saudi-ramadan-and-eid-boost-domestic-tourism-to-10mln-visitors-wqspv4rb
23. ★ Hello Retail, "Ecommerce site search statistics" (cites Nosto research; vendor), Feb 2026 — https://helloretail.com/en/blog/2026-02-24-ecommerce-search-statistics/
24. ★ Discourse Meta, "Arabic search normalization: missing support for hamza variants, ya/kaf forms…" — https://meta.discourse.org/t/arabic-search-normalization-missing-support-for-hamza-variants-ya-kaf-forms-and-orthographic-equivalence/384253/7
25. ★ RankRush KSA, "Arabic SEO and Saudi search 2026" (consultancy) — https://rankrushksa.com/blog/seo/arabic-seo-saudi-search-2026/
26. ★ Business Today, "WhatsApp launches AI-powered customer support for small businesses in India; UPI payments coming soon", 7 May 2026 — https://www.businesstoday.in/technology/story/whatsapp-launches-ai-powered-customer-support-for-small-businesses-in-india-upi-payments-coming-soon-530313-2026-05-07
27. ★ GMCSCO, "2026 WhatsApp Business API trends: what KSA enterprises need to know" (agency forecast) — https://gmcsco.com/2026-whatsapp-business-api-trends-what-ksa-enterprises-need-to-know/
28. ★ Rezdy, "How to minimize no-shows" (vendor) — https://rezdy.com/blog/how-to-minimize-no-shows/
29. ★ Checkfront, "Tour operator cancellation policy for the World Cup" (vendor) — https://www.checkfront.com/blog/tour-operator-cancellation-policy-world-cup/
30. ★ Skift, "Airbnb Stokes Hosts' Ire Over Paused Payments" (older coverage; stays hosts) — https://skift.com/?p=568752
31. ★ Airbnb Community, "$20k payout hold" thread (self-reported) — https://community.withairbnb.com/t5/Help-with-your-business/20k-Payout-hold/m-p/2298024
