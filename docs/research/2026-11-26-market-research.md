# Market research — 2026-11-26

> Eighth report in this series. It builds on the seven earlier reports in `docs/research/` (2026-10-12 to 2026-11-19), all on `main`. New IDs: **N13** and **N14**. **Q22** comes back as **Revisited** because of new evidence. The ID series continues from G11, H9, N14 and Q23.
> Research ran through web-search excerpts only, because full pages could not be opened from this environment. Every source therefore carries ★. Check the original before quoting a figure externally.
> The main news this week is regulatory. SDAIA's draft amendments to the PDPL implementing regulation would **drop the harm threshold for breach notification** and **add a general duty to store personal data inside the Kingdom**. Gharmish stores everything in Frankfurt. The consultation closed on 5 Nov, so the final text could arrive at any time.

## الملخص التنفيذي

- **مسودة تعديلات نظام حماية البيانات الشخصية:** نشرت «سدايا» مسودة تُلزم بإبلاغها عن أي تسرّب للبيانات خلال 72 ساعة، حتى لو لم يُتوقّع منه ضرر، وتشترط حفظ البيانات الشخصية داخل المملكة. أُغلقت الاستشارة العامة في 5 نوفمبر. نقترح فصل «دليل الاستجابة للتسرّب» عن البطاقة #254 وكتابته وثيقةً مستقلة، تُبنى على قاعدة «أبلغ دائماً خلال 72 ساعة» (Q22، مراجَعة).
- **بيانات غارميش مخزّنة في فرانكفورت:** قاعدة البيانات في Supabase بمنطقة `eu-central-1`، والاستضافة في Vercel بمنطقة `fra1`. إذا اعتُمد شرط التوطين بصيغته الحالية فستحتاج المنصّة إلى خطة نقل. المطلوب الآن سؤال واحد من المالك لمستشار قانوني، وليس أي عمل برمجي (N13).
- **الطلب المحلي على الأنشطة يتضاعف:** أعلنت «المسافر» ارتفاع حجوزات الأنشطة 464%، والحجوزات المركّبة (طيران أو إقامة مع نشاط) 368% في أول سبعة أشهر من 2026. نقترح أن يتواصل المالك مع سوق أنشطة «المسافر» كقناة توزيع جاهزة لموعد إعادة فتح التواريخ (N14).
- **السياحة الكلية مستقرة:** 61.2 مليون سائح في النصف الأول من 2026 (+1%)، لكن الإنفاق أقل من النصف الأول من 2025. الضيف المحلي الحريص على القيمة ما زال الهدف الصحيح.
- **مواعيد ثابتة:** نافذة الشتاء في «اكتشف عسير» تُغلق بعد 35 يوماً، والفوترة الإلكترونية (الموجة 25) بعد 67 يوماً، ورمضان بعد نحو 74 يوماً. جلسة بناء «جدول رمضان» (G9) يجب أن تبدأ الأسبوع القادم.

## Executive summary

- **The PDPL may soon require any breach to be reported.** SDAIA's draft amendments (consultation 6 Oct–5 Nov) would remove the "likely harm" condition for notifying SDAIA within 72 hours [1][2][3]. Gharmish still has no breach runbook: it is bundled into #254 with HIGH-tier support-agent code, so neither part has moved in four weeks. **Q22 Revisited:** split the runbook into its own docs-only S card.
- **A data-localisation duty is in the same draft.** A draft Article 23(2) would require controllers to keep personal data inside the Kingdom [2][4][5]. Gharmish runs on Supabase `eu-central-1` and Vercel `fra1` (`BRIEF.md:290-292`, `vercel.json`). **N13 (new):** the owner asks counsel one question now and watches for the final text. No build until the text is final.
- **Saudi activity demand is moving online through big OTAs.** Almosafer reports activity bookings up 464% and connected trips (a flight or stay plus an activity) up 368% for Jan–Jul 2026, driven by domestic tours [6][7]. Webook is also moving from tickets into attractions and community features [8]. **N14 (new):** apply as a supplier to Almosafer's activities marketplace, so the channel is ready when dates reopen.
- **Host-fee pressure continues (supports H1, #402).** Operators complain that Viator's enhanced visibility programme trades higher commission for ranking [9]. Gharmish has no paid ranking. That is one more line for the `/hosting` copy in #402, which still waits on the owner's two answers.
- **Ramadan schedule (G9):** Ramadan starts about 8 Feb 2027, 74 days away. The build session should start in the week of 30 Nov so a PR is ready by about 20 Dec. Nothing for G9 is on `main` yet (no `seasonal*` columns in `db/schema.ts`).

## Current state (re-verified 2026-11-26)

The inventories in earlier reports still hold. Changes on `main` since 2026-11-19:

- **#426 `feat(experiences)` (24 Nov) delivered most of #101's guest side.** Cards now show "Dates soon" (`messages/en.json:3073`) when a listing has no weekdays. Below `lg`, the listing page docks a dates-soon bar with the price and the WhatsApp support link. The card and listing first screen are now photo-led. **For the PM:** narrow #101 to what is left (the top-level `noDates` copy and the desktop panel) or close it.
- 2 `fix` PRs (#416 CRLF review length, #430 Arabic company-host JSON-LD) and the PM and SEO docs.
- **Owner queue unchanged.** P0 fixes #268 and #399 and Next.js #338 are still open and unmerged (`GET /pulls/{n}`, 26 Nov). #402 (H1) and #254 (PDPL runbook) are open.

Facts checked for this report:

- **Data residency:** Supabase `eu-central-1` (`BRIEF.md:292`, `docs/GO-LIVE.md:11`), Vercel `regions: ["fra1"]` (`vercel.json:2`). The privacy page says data is "hosted with international cloud providers, including in the European Union" (`privacyPage.storage.body`, `messages/en.json:4430`).
- **No breach runbook exists.** `docs/ops/` holds only a relist backup and `docs/security/` only the 2026-08-02 audit. #254 asks for `docs/ops/breach-response.md` together with code in `features/support-agent/` and `features/conversations/`.
- **No-show disputes are a competitor problem, not ours.** Hosts cannot mark a guest as a no-show; the only no-show path is the guest-reported `host_no_show` ticket category at high priority (`features/support/tickets.ts:21,38`; `db/schema.ts:2130`). Nothing to build.
- **Last-minute ready:** `bookingCutoffHours` defaults to 2 (`db/schema.ts:582`), so short-notice bookings work once dates reopen.
- **G9 unbuilt:** one `startTime` per listing, no seasonal schedule (`grep -n seasonal db/schema.ts` returns nothing).

## What changed in the market (since 2026-11-19, or not covered before)

### Global competitors

- **Airbnb:** no Experiences launch in November. The autumn update was about services, such as baby-gear rental with BabyQuip [10]. The Viator catalogue on Airbnb, announced on 11 Aug for "later this year", has no launch coverage yet [11][12].
- **GetYourGuide:** no product news. Secondary sources cite about 27% growth in H1 2026; GetYourGuide says it sees no sign that ranking changes hurt suppliers overall [9].
- **Viator:** operators question ranking changes and the enhanced visibility programme (more exposure for higher commission) [9]. Viator is rated 2.2 from about 1,110 reviews on reviews.io against 4.5 on Trustpilot, so ratings depend on the site [13].
- **Klook:** K.ai for merchants (3 Nov) was already covered. No change.
- **Headout:** TikTok GO booking is US-only, with no MENA launch announced [14][15]. N2 is unchanged.

### Saudi Arabia and the GCC

- **H1 2026 tourism:** 61.2M tourists (+1%) and SAR 151.9B spending, announced at WTM London (3–5 Nov) [16][17]. That is below H1 2025's SAR 161.4B [18]. The Q1 split (inbound −13%, domestic +16%) was covered on 11-19.
- **Almosafer (Seera), Jan–Jul 2026:** domestic is 46% of bookings (+13%), activity bookings +464%, connected bookings +368%, protection-product uptake +154%. The CEO credits domestic tours, entertainment and Umrah-linked experiences on Almosafer's activities marketplace [6][7]. These figures are self-reported.
- **Webook:** after the SmartMove acquisition (June), it is extending from ticketing into flights, hotels, dining, attractions and community features (Oct) [8][19]. It is now a likely competitor for Saudi experiences, not just events.
- **Tour-guide rules:** licensed guides can contract directly with tourists and work in more than one region under one licence [20]. Already covered under G1, H3 and N8.
- **PDPL draft amendments** (SDAIA, consultation 6 Oct–5 Nov 2026) [1][2][3][4][5][21]:
  - Breach notice to SDAIA within 72 hours with no harm threshold. Notice to the people affected still depends on likely harm (Gowling's reading) [3].
  - A general duty to store personal data in the Kingdom (draft Art. 23(2)). Transfers abroad would still be possible under the law [2][4][5].
  - New registration with SDAIA for some controllers, revised DPO rules, tighter marketing rules and new privacy-policy content requirements [21].
  - Law firms read some clauses differently. It is still a draft.

### Trends

- **Last-minute booking:** 38% of tour and activity bookings happen the same day or up to two days before (Phocuswright, cited by TrekkSoft) [22]. Two in five online bookings are on mobile (Arival operator survey) [23]. Gharmish's 2-hour default cutoff and the new mobile-first listing screen (#426) fit this.
- **Bundles:** Almosafer's +368% connected trips [6] say Saudi guests buy an activity with the stay. A big OTA's activities shelf is where that happens.
- **AI booking:** no November news. ChatGPT travel apps still hand off to the provider's site to finish booking [24]. N3 stays on watch.

### Pain points (new evidence)

- **Hosts:** paying more commission for ranking (Viator enhanced visibility) [9].
- **Guests:** prepaid tours not delivered and then marked as a guest no-show; guests did not know who the operator was until the dispute [25][26]. Gharmish already names the host on every listing and lets only the guest report a no-show.

## Recommendations

### Guest experience

No new guest-side items this week. #426 shipped most of #101. G9 (below, under the Top 5) is the time-critical guest item.

### Host experience

**H1 (carried, #402): add one line about ranking**

- **New evidence:** operators complain about paying higher commission for visibility on Viator [9].
- **Add to the #402 copy, if the owner agrees:** "No fees for better placement: every listing is ranked the same way." / «لا رسوم مقابل الظهور: كل التجارب تُعرض بالمعايير نفسها.» Only add it if it is true of the catalogue ordering; ask the owner in the same issue comment as the two existing questions.
- **Who executes:** the Daily Fixer, once the owner answers in #402.

### New features and trends to catch

**Q22 Revisited. Ship the breach runbook on its own, written for the stricter rule** (docs only, S, Daily Fixer card)

- **What changed:** SDAIA's draft removes the harm threshold for notifying SDAIA within 72 hours [1][2][3]. The runbook has waited four weeks inside #254, bundled with HIGH-tier code in `features/support-agent/` and `features/conversations/`, so the docs part never ships.
- **What:** a standalone `docs/ops/breach-response.md`, written so it already meets the draft: notify SDAIA within 72 hours for **every** confirmed breach, and notify guests when there is risk to them.
- **Who it helps:** admin (legal exposure), guests (fast, Arabic-first notice).
- **Impact / effort:** Med-High / S. Docs only, NORMAL tier, so it does not join the owner's HIGH queue.
- **Saudi fit:** Arabic-first guest notice; families booking for relatives with shared phone numbers are the common case (#392).
- **Card for the PM to paste** (`pm-priority` + `S`; split from #254, and remove item (b) from #254):
  - **Title:** Breach-response runbook (PDPL 72-hour notice), docs only.
  - **Change:** create `docs/ops/breach-response.md` with these sections:
    1. Owner and deputy: placeholders, filled by the owner.
    2. What counts as a breach: unauthorised access, disclosure, loss or change of personal data, including through a P0 bug like #264 or #392 being exploited.
    3. First hour: contain (rotate Supabase service key, revoke Twilio and HyperPay keys if involved, disable the affected route), preserve evidence (Supabase logs, Vercel runtime logs, Twilio message logs, Sentry events).
    4. 72-hour clock: notify SDAIA through the National Data Governance Portal for every confirmed breach, whatever the expected harm. Note that this follows the October 2026 draft amendments and is the stricter reading.
    5. Guest notice: when there is a risk to the guest, send templates in Arabic first and then English, by email and WhatsApp. Keep each under 600 characters and say what happened, what data, what we did, and what the guest should do.
    6. Record and review: incident log entry and a post-incident review within 7 days.
  - **Link it** from CLAUDE.md under "Errors" with one bullet. If CLAUDE.md is HIGH tier, leave the link to the owner and say so in the PR.
  - **Do not touch:** any code, `features/support-agent/` or `features/conversations/` (they stay in #254 as the code half).
  - **Acceptance:** the file exists with all six sections and both guest templates; `pnpm exec prettier --check docs/ops/breach-response.md` passes.
  - **Tier:** NORMAL (docs only).
- **Who executes:** the Daily Fixer, once the PM files the card.

**N13 (new). PDPL data localisation: one question to counsel now, no build yet**

- **What:** the owner asks a Saudi data-protection lawyer one question. If draft Art. 23(2) passes as written, does a small marketplace that stores guest and host data in Frankfurt (Supabase `eu-central-1`, Vercel `fra1`) have to move it, and by when? Then watch for the final text.
- **Why now:** the consultation closed on 5 Nov [21]. Three law firms describe a general in-Kingdom storage duty [2][4][5]. Hogan Lovells expects the localisation clause to draw the most concern [5]. Gharmish holds IBANs, national IDs (KYC) and phone numbers, which is exactly the data this targets.
- **Who it helps:** admin (legal risk); guests and hosts (trust).
- **Impact / effort:** High if it passes / S now (one email). A migration would be L, so the planner should know early.
- **Saudi fit:** a "your data stays in Saudi Arabia" line would also be a trust signal for families and for KYC.
- **Codebase if it passes (no change now):** `vercel.json:2` (`regions`), the Supabase project region (a new project, not a setting), `messages/{en,ar}.json` `privacyPage.storage.body` (line 4430), `BRIEF.md` §Infrastructure.
- **Who executes:** owner (operations). If the answer is "yes, it applies", the planner gets an M/L migration item.

**N14 (new). Apply as a supplier to Almosafer's activities marketplace**

- **What:** the owner contacts Almosafer (Seera) to list Gharmish's Aseer experiences on its activities marketplace, timed to go live when dates reopen.
- **Why now:**
  - Almosafer's activity bookings rose 464% and connected trips 368% in Jan–Jul 2026, driven by domestic tours [6][7].
  - Viator's growth now comes from third-party points of sale while its own platform shrinks (11-19 report, [8] there).
  - Webook is moving into attractions too [8][19]. Being on the biggest Saudi OTA early matters.
- **Who it helps:** hosts (demand), admin (low-cost acquisition).
- **Impact / effort:** Med / S for the owner (one email and a call). Integration effort is unknown until Almosafer answers. If they need an API or a feed, it becomes a planner item.
- **Saudi fit:** Arabic-first, domestic, family travellers already book there. Note that a reseller takes its own margin on top of Gharmish's 15%. The owner should check that the host's price does not change.
- **Codebase:** none now. A feed would most likely build on the listing data behind `app/llms.txt/route.ts` and the listing JSON-LD (`app/[locale]/(site)/experiences/[slug]/page.tsx`).
- **Who executes:** owner (operations). Not before #268 and #399 merge, because a partner channel brings bookings and those P0 fixes must be live first.

### Quick wins (< 1 week)

- **Q22 Revisited:** the docs-only runbook card above (Daily Fixer).
- **N13:** one email to counsel (owner).
- **#101:** the PM narrows or closes it after #426 (PM, 5 minutes).
- **H1 / #402:** one owner comment with three answers (rate, payout timing, ranking line).

## Top 5 for next sprint (impact ÷ effort)

1. **Q22 Revisited – Standalone breach runbook, `docs/ops/breach-response.md`** (Med-High / S, Daily Fixer, docs only). SDAIA's draft drops the harm threshold for the 72-hour notice. Splitting it from #254 lets it ship without the owner's HIGH queue.
2. **H1 (#402) – State 15%, payout timing and "no paid ranking" on `/hosting`** (Med / S, owner answers, then Daily Fixer). Operators now complain about pay-for-visibility as well as commission rises. Host applications have been 0 for 7 weeks.
3. **N13 – Ask counsel about the PDPL localisation draft** (High if it passes / S, owner). All Gharmish data is in Frankfurt. A move would be L-sized, so an early answer protects the plan.
4. **G9 – Start the Ramadan schedule session in the week of 30 Nov** (Med-High / M, Claude Code session). Ramadan is about 74 days away. Times must be bookable by about 8 Jan.
5. **N14 – Contact Almosafer's activities marketplace** (Med / S, owner). Saudi activity bookings are growing fastest on the big OTA. Go live only after #268 and #399 merge.

Still open from earlier reports, with deadlines: **N6 + N10** (Discover Aseer's winter window closes 31 Dec, 35 days), **N11** (ZATCA Wave 25 due 1 Feb 2027, 67 days), N12, Q23, H9, G11, H8, Q21, G8, N8, N5 (re-check for Eid al-Fitr in mid-January).

## Sources

★ = claim verified from a search excerpt only (full pages could not be opened from this environment).

1. ★ Clyde & Co, "The SDAIA publishes draft amendments to the Implementing Regulations of the PDPL", Oct 2026 — https://www.clydeco.com/en/insights/2026/10/sdaia-publishes-draft-amendments-to-the-pdpl
2. ★ Reed Smith, "SDAIA consults on extensive amendments to the Saudi PDPL implementing regulation" — https://www.reedsmith.com/our-insights/blogs/viewpoints/102o5at/sdaia-consults-on-extensive-amendments-to-the-saudi-pdpl-implementing-regulation/
3. ★ Gowling WLG, "Saudi Arabia's proposed PDPL amendments", 2026 — https://gowlingwlg.com/en/insights-resources/articles/2026/saudi-arabias-proposed-pdpl-amendments
4. ★ Akin Gump, "Saudi Data and AI Authority proposes amendments to implementing regulations of the PDPL – 10 key proposed changes" — https://www.akingump.com/en/insights/alerts/saudi-data-and-ai-authority-proposes-amendments-to-implementing-regulations-of-the-pdpl-10-key-proposed-changes
5. ★ Hogan Lovells, "Saudi Arabia proposes groundbreaking amendments to Personal Data Protection Law" — https://www.hlc.com/en/publications/saudi-arabia-proposes-groundbreaking-amendments-to-personal-data-protection-law
6. ★ Zawya (Almosafer press release), "2026 travel trends: Saudi travellers prove resilient as flexibility, convenience and AI reshape how they book" — https://www.zawya.com/en/press-release/research-studies/2026-travel-trends-saudi-travellers-prove-resilient-as-flexibility-convenience-and-ai-reshape-how-they-book-481587
7. ★ Enterprise AM, "Saudi travel proves resilient as Almosafer wagers on the connected trip, CEO says", 18 Aug 2026 — https://enterpriseam.com/ksa/2026/08/18/saudi-travel-proves-resilient-as-almosafer-wagers-on-the-connected-trip-ceo-says/
8. ★ Enterprise AM, "Webook eyes Europe as it expands from tickets into flights, hotels and visas", 19 Oct 2026 — https://enterpriseam.com/ksa/2026/10/19/webook-eyes-europe-as-it-expands-from-tickets-into-flights-hotels-and-visas/
9. ★ PhocusWire, "Tour operators question OTA rankings as AI changes travel discovery" — https://www.phocuswire.com/news/technology/tour-operators-question-ota-rankings-ai-changes-travel-discovery
10. ★ Airbnb Newsroom, "Airbnb 2026 autumn update" — https://news.airbnb.com/en-uk/airbnb-2026-autumn-update
11. ★ Tripadvisor Group, "Tripadvisor Group and Airbnb announce experiences partnership", 11 Aug 2026 — https://tripadvisor.mediaroom.com/2026-08-11-Tripadvisor-Group-and-Airbnb-Announce-Experiences-Partnership
12. ★ Hospitality Net, "Tripadvisor Group and Airbnb announce experiences partnership" — https://www.hospitalitynet.org/news/4133917/tripadvisor-group-and-airbnb-announce-experiences-partnership
13. ★ Reviews.io, Viator company reviews — https://www.reviews.io/company-reviews/store/viator
14. ★ TikTok Newsroom, "Introducing TikTok GO", 12 May 2026 — https://newsroom.tiktok.com/introducing-tiktok-go
15. ★ Euro Weekly News, "TikTok's latest move could completely reshape online travel bookings", 15 May 2026 — https://euroweeklynews.com/2026/05/15/tiktoks-latest-move-could-completely-reshape-online-travel-bookings/
16. ★ Arab News, "Saudi Arabia welcomes 61.2m tourists in first half of 2026" — https://www.arabnews.pk/saudi-arabia/saudi-arabia-welcomes-612m-tourists-in-first-half-of-2026-3006072
17. ★ Webull / news wire, Saudi Land pavilion at WTM London 2026 — https://www.webull.com/news/15862336130540544
18. ★ Saudi Gazette, "Saudi Arabia welcomes 60.9 million tourists in H1 2025, spending reaches SR161 billion" — https://saudigazette.com.sa/article/656177/SAUDI-ARABIA/Saudi-Arabia-welcomes-609-million-tourists-in-H1-2025-spending-reaches-SR161-billion
19. ★ Arab News, "Saudi tech platform webook.com enters Europe with SmartMove acquisition" — https://www.arabnews.com/node/2646650/business-economy
20. ★ Sabq, "Tourism Ministry: updated tour guide regulation allows direct contracting and a license covering more than one region" — https://sabq.org/en/article/tourism-ministry-updated-tour-guide-regulation-allows-direct-contracting-and-a
21. ★ Digital Policy Alert, "SDAIA closes consultation on proposed amendments to the implementing regulation of the PDPL", 5 Nov 2026 — https://digitalpolicyalert.org/event/45044-saudi-data-and-artificial-intelligence-authority-closes-consultation-on-proposed-amendments-to-the-implementing-regulation-of-the-personal-data-protection-law-including-data-protection-regulations
22. ★ TrekkSoft (citing Phocuswright), "Last-minute booking trends for tours and activities" (vendor) — https://www.trekksoft.com/en/blog/last-minute-booking-trends-for-tours-and-activities-infographic
23. ★ Arival, "Mobile now two in five online bookings for operators" — https://arival.travel/?p=133881
24. ★ Travel Weekly, "Online agencies build travel-planning apps in ChatGPT" — https://www.travelweekly.com/Travel-News/Travel-Technology/OTAs-build-travel-planning-apps-in-ChatGPT
25. ★ BBB, Viator, Inc. complaints (no-show dispute; single account) — https://prod.bbb.org/us/ma/needham/profile/tour-operators/viator-inc-0021-541464/complaints
26. ★ The Traveler, "Before booking on Viator: common mistakes to avoid" (secondary) — https://www.thetraveler.org/before-booking-on-viator-common-mistakes-to-avoid/
