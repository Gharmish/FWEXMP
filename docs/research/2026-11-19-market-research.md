# Market research — 2026-11-19

> Seventh report in this series. It builds on [2026-10-12](./2026-10-12-market-research.md), [2026-10-15](./2026-10-15-market-research.md), [2026-10-22](./2026-10-22-market-research.md), [2026-10-29](./2026-10-29-market-research.md), [2026-11-05](./2026-11-05-market-research.md) and [2026-11-12](./2026-11-12-market-research.md), all on `main`. It adds **no new IDs**. Three earlier items come back as **Revisited** because there is new evidence: H1, G9 and N5. The ID series continues from G11, H9, N12 and Q23.
> Research ran through web-search excerpts only, because full pages could not be opened from this environment. Every source therefore carries ★. Check the original before quoting a figure externally.
> This is a short week. The news is about money, not product. Tripadvisor's Q3 results show Viator's growth stalling and both its CEO and CFO leaving. Experience gifting reached a record. Ramadan 1448 is now 81 days away. The most useful thing Gharmish can ship from this is a **copy-only card**: say the 15% commission and the payout timing on `/hosting` (H1 Revisited).

## الملخص التنفيذي

- **المنافسون يرفعون كلفتهم على المضيفين، وغارميش لا تُعلن ميزتها:** «جت يور قايد» رفعت عمولة بعض المشغّلين حتى 30% وأضافت رسماً ضريبياً منذ 1 أكتوبر، ومضيفو «Airbnb» يشتكون من تعليق التحويلات بلا سبب معلن. غارميش تأخذ 15% فقط، لكن صفحة «استضف معنا» تقول «حصة عادلة يُتّفق عليها» دون رقم ودون موعد للتحويل. نقترح كتابة الرقم وموعد التحويل صراحةً في الصفحة. هذا تعديل نصوص فقط، بعد موافقة المالك على الصياغة (H1، مراجَعة).
- **«فياتور» تتعثّر:** نتائج الربع الثالث تُظهر إيرادات التجارب -3% وهامشاً أدنى، ورحيل الرئيس التنفيذي والمدير المالي. الرئيس التنفيذي قال إن دمج فريقي التجارب «لم يُثبت جدواه». النمو جاء من نقاط البيع لدى الشركاء (+منتصف العشرات بالمئة)، لا من المنصّة نفسها. القنوات الشريكة، مثل «اكتشف عسير» وبرامج المواسم، أهم من أي إعلان مدفوع.
- **رمضان 1448 يبدأ نحو 8 فبراير 2027:** المصدران متطابقان. يجب أن تبدأ جلسة بناء «جدول رمضان» (G9) في أول ديسمبر حتى تُعرض أوقات الإفطار والسحور قبل منتصف يناير.
- **الإهداء بالتجارب في أعلى مستوياته:** نصف المتسوّقين في استطلاع «ديلويت» يخطّطون لإهداء تجربة. نؤجّل «أهدِ تجربة» (N5) إلى ما قبل عيد الفطر، لأن لا تجارب قابلة للحجز الآن.
- **مواعيد ثابتة:** موجة الفوترة الإلكترونية 25 تنتهي في 1 فبراير 2027 (بعد 74 يوماً، N11). ونافذة الشتاء في «اكتشف عسير» تُغلق في 31 ديسمبر (بعد 42 يوماً، N6/N10).

## Executive summary

- **Competitors are squeezing hosts, and Gharmish hides its advantage.** GetYourGuide raised some operators' commission to as much as 30% [1], and has added a digital-services-tax surcharge on supplier invoices since 1 Oct [2]. Airbnb hosts report unexplained payout holds in 2026 [3][4]. Gharmish charges 15% (`commission_bps` 1500), yet `/hosting` says only "a fair revenue share, agreed with you" (`messages/en.json:1771`). **H1 Revisited:** a copy-only S card that states the rate and when payouts are sent.
- **Viator stalled in Q3 (results 5 Nov).** Experiences revenue fell 3% and margin dropped to 13.4% from 17.8%. The CEO said merging the Tripadvisor and Viator experience teams "hasn't proved out", and both the CEO and the CFO are leaving [5][6][7]. Bookings through third-party points of sale grew in the mid-teens while Tripadvisor's own platform fell [5][8]. This backs the partner-channel route (N6, N10) over paid acquisition.
- **Ramadan 1448 is about 8 Feb 2027, now confirmed by two sources [9][10].** **G9 Revisited:** the owner should start the Claude Code session for the Ramadan schedule in the first week of December, so Ramadan times are bookable by mid-January.
- **Experience gifting hit a record.** 50% of US holiday shoppers plan to give an experience, up from 47% in 2025 [11][12]. **N5 Revisited:** the evidence is stronger, but gifting needs sellable dates. Re-check it for Eid al-Fitr (about 9 Mar 2027).
- **Unchanged deadlines:** ZATCA Wave 25 integration is due 1 Feb 2027 [13][14] (N11, 74 days away). Discover Aseer's winter window closes on 31 Dec (N6/N10, 42 days away).

## Current state (re-verified 2026-11-19)

The inventories in the earlier reports still hold. Since the 2026-11-12 report, `main` received only `fix` commits and the PM, plan and SEO docs (`git log --since=2026-11-11`, no `feat`). Facts checked for this report:

- **`/hosting` shows no rate and no payout timing.** The payout section renders `payout.revenueShare`, `payout.payouts` and `payout.liability` (`app/[locale]/(site)/hosting/page.tsx:231-238`). The copy says "a fair revenue share, agreed with you as part of your partnership" and "You're paid when a booking is completed" (`messages/en.json:1771-1772`; Arabic at `messages/ar.json:1771`). H1 from the 2026-10-12 report was never built.
- **One start time per listing.** `startTime` is a single `HH:MM` and weekdays are a single recurring set (`db/schema.ts:564,573`). There is no seasonal or date-ranged schedule, so G9 is still unbuilt.
- **Structured data is already date-honest.** The listing JSON-LD sets `SoldOut` when no date is available (`app/[locale]/(site)/experiences/[slug]/page.tsx:611-617`). AI and search crawlers are not told a closed listing is in stock. `/llms.txt` still is (plan F13).
- **Locale default:** `defaultLocale: 'en'` with `Accept-Language` detection only (`lib/i18n.ts:14-16`). The planner's D8 (Arabic for Saudi IP addresses) is still unbuilt. The PM measured the Arabic share of page views at 17% (11-13).
- **Reviews already accept photos** (`db/schema.ts:1079`, `photos text[]`), so "photo reviews" is not a gap.
- **Pipeline:** 0 `pm-priority` or plan cards started in the PM's window. Q23, N10, N11 and N12 have no issue (`GET /issues?since=2026-11-11`). Plan Now: F1–F5, E4 (#101), E6, E7, E2.

## What changed in the market (since 2026-11-12, or not covered before)

### Global competitors

- **Tripadvisor / Viator, Q3 2026 (5 Nov):**
  - Group revenue $436.4M (−11%). A $369.5M goodwill impairment produced a $316.9M loss [5][6].
  - Experiences: revenue $284.8M (−3%), about 6.8M bookings (+2%; Viator +4%), gross booking value flat at about $1.3B. Adjusted EBITDA $38.2M, a 13.4% margin down from 17.8% [5][8].
  - Third-party points of sale grew in the mid-teens while the Tripadvisor platform fell in the low teens [8].
  - CEO Matt Goldberg leaves on 16 Feb 2027 and CFO Michael Noonan on 31 Dec 2026. Goldberg said the combined experiences team "hasn't proved out" [7][15].
  - Q4 guidance: group revenue down by a low-teens percentage, and the Experiences decline speeds up modestly [8].
- **Airbnb, Q3 2026 (5 Nov):**
  - Revenue about $4.9B (+19%). Nights and Seats Booked, which include experience and service seats, rose 16% to 155M. Experiences are not reported on their own [16][17].
  - Airbnb's own AI trip-planning agent reaches guests in H1 2027 [16].
  - No launch of the Viator catalogue on Airbnb was found. Coverage still says "by year-end" [18].
- **Klook:** it withdrew its US IPO (about $400M) on 16 Oct, citing market conditions [19][20]. Nothing new on K.ai since 3 Nov.
- **GetYourGuide, Headout:** no product news in October or November.

### Saudi Arabia and the GCC

- **Demand mix:** Jan–May 2026 had 8.3M inbound visitors (−13%) against 28.9M domestic visitors (+16%) spending SAR 34.7B [21][22]. The domestic, Arabic-speaking guest is still the right target.
- **Riyadh Season 2026** opened on 21 Oct for 10 weeks [23][24]. Covered in the 2026-10-22 report. No attendance figure yet.
- **AlUla Arts Festival:** 15 Jan–6 Feb 2027 [25]. It is outside Aseer, so no action.
- **Regulation:** the September–October update of four tourism regulations (guides can now work across regions) [26][27] is already covered under G1, H3 and N8. No new booking-platform rule was found.
- **ZATCA Wave 25:** VAT-subject revenue above SAR 187,500 in any year from 2022 to 2025, with integration due by 1 Feb 2027 [13][14]. This is unchanged and is N11.
- **PDPL:** SDAIA's committees have issued 48 decisions, with fines up to SAR 5M [28]. A consultation on amendments to the implementing regulations reportedly closed on 5 Nov. That rests on one vendor source and is not used.
- **Ramadan 1448:** expected to start Mon 8 Feb 2027, with Eid al-Fitr about 9 Mar, subject to moon sighting [9][10].

### Trends

- **Gifting:** Deloitte's 2026 holiday survey (n=4,000, 26 Aug–10 Sep) found 50% plan to give experiences, up from 47% in 2025 and 39% in 2024. 79% of them will pair the experience with a physical item [11]. NRF also reports a record level of experience gifts [12]. Both are US data.
- **AI booking, with the human in charge:** 43% of US adults are comfortable with AI booking under their supervision, but only 12% with fully autonomous booking. Finding local activities is the task they trust AI with most (64%) [29]. 55% of travellers who used AI got at least one wrong recommendation, such as a closed venue or a sold-out tour [30]. That is the case for keeping `/llms.txt` date-honest (plan F13).
- **Short video:** 47–48% of Gen Z use TikTok for travel inspiration, and 59% use Instagram [31][32]. N2 is unchanged.
- **Private and small groups:** half of tour takers booked at least one private tour (Arival, 2024 data) [33]. Travellers book more activities per trip while spending stays flat [34]. G3 is unchanged.

### Pain points (new evidence)

- **Hosts and operators:**
  - GetYourGuide raised commission for some operators (20% to 30% in one reported case) [1], then added a DST surcharge from 1 Oct [2].
  - Airbnb hosts describe payout holds with no stated trigger. The sources are a vendor blog and a host forum thread [3][4].
  - An operator says no-show guests left 1-star ratings and GetYourGuide support did not answer. This is a single unverified complaint [35].
- **Guests:**
  - Viator is rated 2.1 from about 1,250 reviews on reviews.io, with complaints about operators not showing up [36]. Corroborated by BBB complaint volume [37].
  - Klook is rated well overall (4.5), but refund complaints describe months of waiting and being offered 30% KlookCash instead of cash [38]. This supports plan F15 (platform-fault cancellations refund money, not credit). It also means G8 (instant credit refund) must always be the guest's choice, never the default.

## Recommendations

### Guest experience

**G9 Revisited. Ramadan schedule per listing: start the build in the first week of December**

- **What changed:** two sources now agree on 8 Feb 2027 for the start and about 9 Mar for Eid al-Fitr [9][10]. The original case for G9 (2026-10-22 report) said Ramadan travellers book more than a month ahead, so Ramadan times must be live by about 8 Jan.
- **What (unchanged):** a date-ranged alternate `startTime`, and optionally weekdays, for each listing. The host form pre-fills the Ramadan range with after-iftar and after-Taraweeh slots. The listing page shows "Ramadan timing" for dates inside the range.
- **Codebase (re-verified):** `db/schema.ts:564,573` (`availabilityWeekdays` and `startTime`; add `seasonalStartTime`, `seasonFrom` and `seasonTo`, then run `pnpm db:generate`), `features/availability/queries.ts`, `features/host-experiences/actions.ts` and the form, `features/bookings/lib/booking-ics.ts`, reminder scheduling in `lib/notifications/`, `messages/{en,ar}.json`.
- **Impact / effort:** Med-High / M. It is worth something only if dates reopen, but the build has to finish before then. Building it does not reopen dates.
- **Who executes:** a Claude Code session the owner starts. The schema change makes it HIGH-risk, so it needs the owner's `/approve`. Plan it so that PR is ready by about 20 Dec.

**N5 Revisited. Gift an experience: re-check for Eid al-Fitr, not now**

- **What changed:** Deloitte puts experience gifting at 50% of US holiday shoppers, a third year of growth [11][12]. The data is US-only, and no Saudi figure was found.
- **Decision for the PM:** keep it parked. Gifting Gharmish Credit to someone who has no date to book is a bad first impression. Re-check in mid-January for Eid al-Fitr (about 9 Mar), once dates have reopened.
- **Watch:** Deloitte's 79% "pair with a physical item" suggests a printable bilingual card (PDF or OG image) is the minimum. The existing OG card renderer in `lib/og/` is the place to start.

### Host experience

**H1 Revisited. Publish the rate and the payout promise on `/hosting`** (copy only, S, Daily Fixer card)

- **What:** replace the vague "fair revenue share" line with the actual standard commission and a payout timing commitment. Add one line on what Gharmish never deducts.
- **Why now:**
  - GetYourGuide raised commission for some operators to 30% [1] and added a DST surcharge on supplier invoices from 1 Oct [2].
  - Airbnb hosts complain that payout holds are unexplained [3][4].
  - Viator is cutting costs under margin pressure [5][8], so more fee pressure on operators is likely.
  - Gharmish has had 0 host applications for 6 weeks (PM 11-13). Its 15% is a clear advantage, and the page does not mention it.
- **Who:** host (decides before applying), admin (fewer "what's your cut?" calls).
- **Impact / effort:** Med / S. It is two message keys in two languages. The only real work is the owner's wording decision.
- **Saudi fit:** small family-run hosts want to know the number up front. Stating it in plain Arabic builds trust before the KYC step asks for an IBAN and ID.
- **Owner decisions first** (the PM asks once, in the issue):
  1. Is 15% the public standard rate? `commission_bps` is per listing, and the current copy suggests it is negotiated.
  2. What payout timing can be promised? The current copy says only "when a booking is completed". Suggested wording: "within 7 working days of completion".
- **Card for the PM to paste** (`pm-priority` + `S`):
  - **Title:** Hosting page: state the 15% commission and the payout timing.
  - **Change:** in `messages/en.json` and `messages/ar.json`, rewrite `hosting.payout.revenueShare` (line 1771) to say: hosts set their own price, Gharmish keeps a standard 15% per completed booking, and there are no listing, sign-up or monthly fees. Rewrite `hosting.payout.payouts` (line 1772) to add the timing the owner chose ("within N working days of the experience"), keeping the IBAN and ledger sentence. Use calm Modern Standard Arabic with the 15% in Western digits, matching the existing `ar.json` style for money.
  - **Do not touch:** `payout.liability` (the owner's no-insurance decision), any `commission_bps` logic, or the admin settings.
  - **Render:** `app/[locale]/(site)/hosting/page.tsx:236-237` needs no change unless the copy adds an interpolated value. If the rate is interpolated, read it from the platform default commission and never hard-code it in two places.
  - **Acceptance:** `/en/hosting` and `/ar/hosting` show the rate and the timing. `pnpm typecheck`, `pnpm lint` and `pnpm test` pass. The message-key parity test stays green.
  - **Tier:** NORMAL (copy only).
- **Who executes:** the Daily Fixer, once the PM files the card with the owner's two answers in it.

### New features and trends to catch

- **Partner distribution over a home-grown push.** Viator's growth now comes from third-party points of sale while its own platform shrinks [8]. For Gharmish this strengthens N6 and N10 (state and regional channels) and N12 (ministry portal). These are owner tasks, already written.
- **Watch, no action:** Airbnb's AI trip agent (H1 2027) [16]; the Airbnb–Viator catalogue [18]; Klook's IPO pause [19]. N3 stays on watch. Date-honest `/llms.txt` (plan F13) is the right AI-facing step for now [29][30].

### Quick wins (< 1 week)

- **H1 Revisited:** the copy card above (Daily Fixer, after two owner answers).
- **N11:** one email to the accountant about ZATCA Wave 25 (owner, 74 days left).
- **N6 + N10:** one email to Discover Aseer and the Saudi Winter programme (owner, 42 days left in Aseer's window).

## Top 5 for next sprint (impact ÷ effort)

1. **H1 Revisited – State the 15% commission and payout timing on `/hosting`** (Med / S, Daily Fixer after two owner answers). Competitors are raising operator fees and hosts complain about opaque payouts. Gharmish's lower rate is invisible, and host applications have been 0 for 6 weeks.
2. **N11 – Confirm the ZATCA Wave 25 scope with the accountant** (carried; High if in scope / S, owner). The deadline is 1 Feb 2027, 74 days away, and no Fatoora integration exists.
3. **N6 + N10 – One email to Discover Aseer and the Saudi Winter programme** (carried; Med / S, owner). Aseer's winter window closes on 31 Dec. Viator's Q3 shows partner channels are where experience bookings still grow.
4. **G9 Revisited – Start the Ramadan schedule build in the first week of December** (Med-High / M, Claude Code session). Ramadan starts about 8 Feb 2027. Times must be live by about 8 Jan for guests who book a month ahead.
5. **N12 – Register on the MT Developer Portal and TourismX** (carried; Med / S, owner). This is still the route to a licence-lookup API and to the N8 platform-licence answer.

Still open from earlier reports, unchanged in priority: Q23 (zero-result WhatsApp ask; less urgent while the PM counts 0 searches a week), H9 (bilingual listing drafter), Q22 (SDAIA clause in the #254 runbook), G11 (data download and deletion), H8 and Q21 (host-sourced link), G8 (instant credit refund, only as an opt-in choice [38]), N8 (licence question).

## Sources

★ = claim verified from a search excerpt only (full pages could not be opened from this environment).

1. ★ Arival, "GetYourGuide commission increasing for some operators", 2025 — https://arival.travel/article/getyourguide-commission-increasing-for-some-operators
2. ★ Destination.com, "GetYourGuide to pass digital services tax costs to tour operators", Aug 2026 — https://www.destination.com/news/getyourguide-to-pass-digital-services-tax-costs-to-tour-operators
3. ★ Rakidzich, "Airbnb payout hold / suspension: what triggers it (2026)" (vendor blog) — https://www.rakidzich.com/articles/airbnb-payout-hold-suspension-what-triggers-it-2026
4. ★ Airbnb Community, "Airbnb refusing to send payouts for no reason" (host forum) — https://community.withairbnb.com/t5/Help-with-your-business/AIRBNB-REFUSING-TO-SEND-PAYOUTS-FOR-NO-REASON/m-p/1825327/highlight/true
5. ★ Quartr, "TripAdvisor (TRIP) Q3 2026 earnings summary", 5 Nov 2026 — https://quartr.com/events/tripadvisor-inc-trip-q3-2026_3Y1ZAtiX
6. ★ Securities.io, "Tripadvisor goodwill charge drives $316.9 million Q3 loss" — https://www.securities.io/tripadvisor-goodwill-charge-drives-316-9-million-q3-loss/
7. ★ Finviz, "Tripadvisor misses badly as Viator growth stalls… both CEO and CFO head for the exit" — https://finviz.com/news/417307/tripadvisor-misses-badly-as-viator-growth-stalls-margin-targets-collapse-and-both-ceo-and-cfo-head-for-the-exit
8. ★ MarketBeat, "Transcript: Tripadvisor Q3 earnings call highlights", 6 Nov 2026 — https://www.marketbeat.com/instant-alerts/transcript-tripadvisor-q3-earnings-call-highlights-2026-11-06/
9. ★ Wego, "Ramadan 2027" — https://blog.wego.com/ramadan-2027/
10. ★ Saudi Life Guide, "Ramadan 2027 Saudi Arabia dates and Eid holidays" — https://saudilifeguide.com/ramadan-2027-saudi-arabia-dates-eid-holidays/
11. ★ Adweek, "Half of shoppers plan to buy gifts like meals or event tickets, Deloitte finds", 2026 — https://www.adweek.com/commerce/half-of-shoppers-plan-to-buy-gifts-like-meals-or-event-tickets-deloitte-finds/
12. ★ NRF, "2026 holiday shopping trends: what consumers are planning", 28 Oct 2026 — https://nrf.com/blog/2026-holiday-shopping-trends-what-consumers-are-planning
13. ★ ZATCA, "Wave 25 e-invoicing", 24 Jul 2026 — https://zatca.gov.sa/en/MediaCenter/News/Pages/Wave25-E-invoicing.aspx
14. ★ KPMG, "Saudi Arabia: e-invoicing mandatory for taxpayers with revenue above SAR 187,500", Jul 2026 — https://kpmg.com/us/en/taxnewsflash/news/2026/07/saudi-arabia-e-invoicing-mandatory-for-taxpayers-with-revenue-above-sar-187500.html
15. ★ Skift, "Tripadvisor CEO Matt Goldberg and board agreed to his exit", 5 Nov 2026 — https://www.skift.com/2026/11/05/tripadvisor-ceo-matt-goldberg-and-board-agreed-to-his-exit/
16. ★ MarketBeat, "Transcript: Airbnb Q3 earnings call highlights", 5 Nov 2026 — https://www.marketbeat.com/instant-alerts/transcript-airbnb-q3-earnings-call-highlights-2026-11-05/
17. ★ Travel Extra, Airbnb Q3 2026 results — https://www.travelextra.ie/?p=158293
18. ★ Hospitality ON, "Tripadvisor hands part of its experiences catalog to Airbnb" — https://hospitality-on.com/en/events/tripadvisor-hands-part-its-experiences-catalog-airbnb
19. ★ Skift, "Klook withdraws U.S. IPO citing market conditions", 19 Oct 2026 — https://skift.com/2026/10/19/klook-withdraws-u-s-ipo-citing-market-conditions/
20. ★ Renaissance Capital, "Klook Technology withdraws estimated $400 million IPO" — https://www.renaissancecapital.com/IPO-Center/News/122274/pan-asian-travel-booking-platform-klook-technology-withdraws-estimated-400
21. ★ Consultancy-me, "Saudi Arabia sees dip in international tourism but domestic travel offsets slowdown" — https://www.consultancy-me.com/news/13794/saudi-arabia-sees-dip-in-international-tourism-but-domestic-travel-offsets-slowdown
22. ★ Cavendish Maxwell, "Saudi Arabia hospitality and tourism snapshot, Jan–May 2026" — https://cavendishmaxwell.com/insights/market-reports/hospitality/saudi-arabia-hospitality-and-tourism-snapshot-jan-2026-may-2026
23. ★ Gulf News, "Riyadh Season 2026 to begin on October 21 with 10 weeks of entertainment" — https://gulfnews.com/world/gulf/saudi/riyadh-season-2026-to-begin-on-october-21-with-10-weeks-of-entertainment-1.500689955
24. ★ Saudi Gazette, "Riyadh Season 2026 to kick off on October 21" — https://saudigazette.com.sa/article/664911/saudi-arabia/riyadh-season-2026-to-kick-off-on-october-21
25. ★ Experience AlUla, "AlUla Arts Festival" (15 Jan–6 Feb 2027) — https://www.experiencealula.com/en/alula-moments/alula-arts-festival
26. ★ Saudi Gazette, "Saudi Arabia updates four tourism regulations covering travel, guides and hospitality" — https://saudigazette.com.sa/article/664494/saudi-arabia/saudi-arabia-updates-four-tourism-regulations-covering-travel-guides-and-hospitality
27. ★ Arab News, "Saudi tourism ministry updates four regulations" — https://www.arabnews.pk/saudi-tourism-ministry-updates-four-regulations-3001004
28. ★ IAPP, "Saudi Arabia's data protection authority steps up enforcement" — https://iapp.org/news/a/saudi-arabia-s-data-protection-authority-steps-up-enforcement
29. ★ HUMAN Security, "AI use for travel planning survey", May 2026 — https://www.humansecurity.com/learn/blog/ai-use-for-travel-planning-survey/
30. ★ Greetwell, "AI travel survey 2026", Aug 2026 — https://www.greetwell.com/us/guides/ai-travel-survey-2026
31. ★ Euronews, "'I saw it on TikTok': 48% of Gen Z travellers turn to the platform for travel inspiration", 21 Aug 2026 — https://www.euronews.com/travel/2026/08/21/i-saw-it-on-tiktok-48-of-gen-z-travellers-turn-to-the-platform-for-travel-inspiration
32. ★ KAYAK, "What the Future" report 2026 — https://kayak.com/c/wtf-report-2026
33. ★ Travolution, "Travellers prioritise intimacy and convenience, Arival report reveals" — https://www.travolution.com/news/travel-sectors/travellers-prioritise-intimacy-and-convenience-arrival-report-reveals/
34. ★ Zawya, "Travellers pack more experiences into trips despite flat spending: report" — https://www.zawya.com/en/business/travellers-pack-more-experiences-into-trips-despite-flat-spending-report-412407
35. ★ ComplaintsBoard, GetYourGuide operator complaint (no-show ratings; single, unverified) — https://www.complaintsboard.com/getyourguide-review-manipulation-missing-5-stars-no-show-ratings-and-complete-silence-from-support-c2009122
36. ★ Reviews.io, Viator company reviews — https://www.reviews.io/company-reviews/store/viator/PW
37. ★ BBB, Viator, Inc. complaints profile — https://prod.bbb.org/us/ma/needham/profile/tour-operators/viator-inc-0021-541464/complaints?page=3
38. ★ Trustpilot, Klook reviews (refund complaints) — https://nz.trustpilot.com/review/www.klook.com?page=5
