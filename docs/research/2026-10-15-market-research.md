# Market research — 2026-10-15

> Second report in this series. It builds on [2026-10-12](./2026-10-12-market-research.md) and does not repeat that report's ideas. Two earlier recommendations come back marked **Revisited**, each because new evidence turned up.
> Research ran through web-search excerpts only, because full pages could not be opened from this environment. Every source carries ★ for that reason. Check the original before quoting a figure externally.

## الملخص التنفيذي

- **التجارب حيّة لكن بلا مواعيد:** أُعيد نشر التجارب الثماني في 12 أكتوبر دون أي يوم متاح، وتكتفي الصفحة بعبارة «تحقق لاحقًا». نوصي بزر «نبّهني عند فتح المواعيد» عبر واتساب، بعد موافقة صريحة من الضيف.
- **قناة توزيع حكومية جديدة:** أطلقت طيران ناس بالشراكة مع الهيئة السعودية للسياحة منصة «تجارب سعودية» في يوليو 2026، وفيها أكثر من 150 نشاطًا. وفي برنامج «شتاء السعودية» السابق أكثر من 1,200 منتج سياحي. نوصي بالتقدّم لإدراج تجارب غارميش في القناتين قبل الموسم الشتوي.
- **مهلة الامتثال تنتهي في مارس 2027 تقريبًا:** تمنح لائحة الإرشاد المحدَّثة المرخَّصين الحاليين 180 يومًا. نوصي بأن يُستكمل إظهار رقم الترخيص وشروط الدفع والإلغاء قبل الحجز ضمن هذه المهلة.
- **الطقس هو مصدر النزاع الأول:** النزاعات تنشأ حين تتغيّر الرحلة أو تُلغى. نوصي بأن يقترح المضيف موعدين بديلين بدل الإلغاء المباشر، وهذا يقلّل الاستردادات اليدوية.
- **أدوات المضيف صارت أساسية:** أعلنت GetYourGuide في سبتمبر أدوات أداء وجودة للمضيفين. نعيد طرح لوحة أداء لكل تجربة مع قائمة جودة مبسّطة.

## Executive summary

- **Live listings, no dates.** Since the 12 Oct relist, all 8 experiences are `live` with empty `availability_weekdays`. Guests see "check back soon" and nothing to act on. The fix is a WhatsApp "notify me when dates open" alert behind explicit consent. Most travellers now book ahead rather than on the day [1].
- **A state-backed distribution channel appeared.** flynas and the Saudi Tourism Authority launched "Saudi Experiences" in July 2026, with 150+ bookable activities across 15+ destinations [2][3]. Last winter's Saudi Winter programme carried 1,200+ partner products [4]. Gharmish should apply as an Aseer supplier before the 2026–27 winter programme.
- **There is now a compliance deadline.** The amended tour-guide regulation gives existing licence holders 180 days, to about March 2027 [5]. The Ministry of Tourism also put licensing on one unified platform [6][7]. This turns last report's G1 and H3 from good practice into a deadline (**Revisited**).
- **Weather and altered runs drive disputes.** Weather disruption is a main source of travel chargebacks [8], and complaints cluster where a trip ran differently from what was booked [9][10]. Gharmish's weather path today is cancel and full refund, and refunds are manual. A "weather move" flow keeps the booking and the revenue.
- **Operator tooling is now table stakes.** GetYourGuide's 15 Sep summit centred on AI-assisted operator tools [11][12]. Its Spring release already gave operators performance data and AI reply suggestions [13]. The per-listing performance card from last report should ship with a listing-quality checklist (**Revisited**).

## Current state (re-verified 2026-10-15)

The 2026-10-12 report's inventory still holds: no product feature merged between then and now (only bug fixes, SEO, ops docs and the Apple Pay domain file). Additional facts verified for this report:

- **Supply:** all 8 listings were relisted `live` on 2026-10-12 with `availability_weekdays = '{}'`. Every date then fails `isDateBookable` (`docs/ops/2026-10-12-relist-schedule-backup.md`, `features/bookings/lib/availability.ts`).
  - The booking widget shows `experiences.booking.noDates`: "No open dates in the next 8 weeks … check back soon" (`messages/en.json:3177`, `features/bookings/components/booking-request-form.tsx:358`).
  - No alert, waitlist or notify-me mechanism exists (`grep -i 'waitlist|notify_me|date_alert'` returns 0).
- **Demand signals (from `docs/plans/2026-10-09-development-plan.md`, last 28 days):**
  - 82 searches, of which 76% returned zero results.
  - 76 of the 82 searches were in Arabic; 28 mention women-only.
  - 378 experience views led to 8 bookings created.
  - Payouts made to hosts so far: 0.
- **Weather:**
  - Hosts can cancel with reason `weather` (`features/host-bookings/schemas.ts:15`).
  - Admins have an emergency cancel that refunds to Gharmish Credit (`features/admin/bookings/`).
  - Guests get a 100% refund on any weather cancellation (`/cancellation-policy`).
  - There is **no** host-proposed alternative date; rebooking is left to the guest.
- **Already present (do not propose):**
  - share button (`components/ui/share-button.tsx`, used on experience, host and confirmation pages);
  - "Report a problem" dispute form on the booking page (`features/disputes/components/report-problem-form.tsx`);
  - per-booking marketing consent and `guests.marketingConsentAt` (`db/schema.ts:476`, `:841`);
  - request-to-book with no charge until the host accepts (`messages/en.json`, `book.descriptionStored`);
  - WhatsApp "questions" deep link with prefill on the experience page.
- **Already planned elsewhere (not repeated here):**
  - host payouts last mile (N1);
  - zero-result search suggestions (X2);
  - refund-timing promise (X3);
  - "next available" date on cards, a seasonal bookable window and an Arabic `llms.txt` (all parked; see `docs/plans/2026-10-09-development-plan.md`).

## What changed in the market (since the 2026-10-12 report or not covered there)

### Global competitors
- **GetYourGuide**
  - Unlocked Summit (Berlin, 15 Sep 2026): new operator tools for listing performance, AI listing-quality checks and faster traveller messaging [11][12].
  - Spring 2026: a visual listing editor and a portal inbox with AI-suggested replies [13].
- **Viator**
  - Became Google Gemini's first "connected app" for experiences on 30 Jul 2026. Users discover and compare in Gemini, then book on Viator; reported US-only [14][15].
  - Google added GetYourGuide and Fever as connected apps on 12 Aug [16].
- **Civitatis:** its ChatGPT app shows live availability and a cart; payment stays on its own site (vendor post, 28 Sep) [17].
- **Airbnb**
  - Fall update (30 Sep 2026): natural-language and voice search across homes, experiences and services, plus "Connect", which links friends and family to share trips on a map. US first [18][19].
  - Experiences supply up about 80% year on year (Q2 letter) [20].
- **Tripadvisor/Viator:** in Q2, Viator bookings rose 10%. SEO headwinds cut about 5 points of growth and pushed spend into paid acquisition [21][22].
- **Headout:** "Now, Pay Later" means no upfront payment on cancellable experiences in 150+ cities, MENA included [23].
- **Klook:** signed a Mastercard alliance for year-end travel offers (Aug 2026) [24].

### Saudi Arabia and the GCC
- **Tour-guide regulation**
  - Amended in Umm Al-Qura on 11 Sep 2026; existing licensees get 180 days to comply [5].
  - The Travel & Tourism Services Regulation was also published [25].
  - One press report says online guiding offers must show prices, including fees, in Arabic and English [26]. This is single-source and not found in the official text, so treat it as unconfirmed.
- **Unified Tourism Services Platform** (launched at LEAP, 31 Aug–3 Sep 2026): licensing, compliance, investment and training in one place, with an AI assistant called "Tourism X" [6][7].
- **flynas "Saudi Experiences"** (with the STA): launched 7–8 Jul 2026 with 150+ activities and guided tours in 15+ destinations, 10 languages and real-time confirmation. Event tickets are planned [2][3].
- **Saudi Winter:** the 2025 programme launched in mid-September 2025 with 1,200+ products and 600+ offers, running into Q1 2026 [4]. No 2026–27 launch was found yet, which is a window to apply as a partner.
- **Riyadh Season 2026** opens 21 Oct and runs 10 weeks; the Six Kings Slam is on 21–24 Oct [27].
- **Aseer:** SEVEN opened an entertainment destination in Abha in August 2026 [28].

### Trends
- **AI planning:** 68% of Saudi travellers have used AI to plan a holiday; 76% of AI users use ChatGPT (Marriott Bonvoy, 2026 report) [29].
- **Agentic booking is still discovery then hand-off.** Google AI Mode's agentic bookings send users to partner sites [30], and Viator's Gemini app links out to Viator [14]. No travel-experience deployment of agent payments was found.
- **Payments:** e-payments were 85% of Saudi retail payments in 2025, up from 79%, driven by mada (SAMA) [31].
- **Book-ahead behaviour:** over 80% of US experience travellers now book at least a day ahead (Arival 2026) [1][32].
- **Groups:** 35% of Saudi respondents name agreeing a budget as a key group-trip obstacle (Skyscanner) [33].
- **Solo and women travel:** 56% of UAE respondents plan a solo trip within 12 months (Hilton 2027 Trends) [34].
- **Gifting:** no GCC data on experience gifts was found, so this report makes no gifting claim.

### Pain points (new evidence)
- **Weather → chargebacks:** problems on the day turn into card disputes, and a chargeback rate above about 0.9% puts card acceptance at risk [8].
- **Altered trips cause the dispute, not cancellation alone:**
  - TUI cruises switched to coach trips with no compensation [9].
  - Klook offered 30% in KlookCash when an operator changed the meeting point and route [10].
- **Slow refunds:**
  - A Klook refund took four months and 22 agents, ending in a chargeback [10].
  - A webook Travel refund was more than 70 days late (Trustpilot) [35].
- **Host payout holds:** Airbnb hosts reported weeks-long payout holds tied to identity checks [36].
- **Fake-review enforcement is live:**
  - The UK CMA opened its first DMCC fake-review cases on 27 Mar 2026; fines can reach 10% of turnover [37].
  - The US FTC sent warning letters in Dec 2025 [38].

## Recommendations

### Guest experience

**G6. "Notify me when dates open" on listings with no bookable dates**
- **What:** Replace the dead-end "check back soon" with one button. It captures a phone number (and month preference) behind an explicit consent tick. When a host opens dates, Gharmish sends a WhatsApp message with a deep link. Prefill the number for signed-in guests.
- **Why now:**
  - All 8 listings are live with zero dates (internal, verified).
  - Riyadh Season [27] and the winter programme [4] start the domestic leisure window.
  - Most travellers book ahead, not on the day [1][32].
  - 28 of 82 recent searches asked for women-only experiences that had no dates (internal).
- **Who:** guest and host (demand captured before supply opens), admin (a demand count per listing tells the owner which listings to reopen first).
- **Impact / effort:** High / S–M. One table (`date_alerts`), one form, one sender triggered when `availability_weekdays` changes from empty, and one new WhatsApp template.
- **Saudi fit:** WhatsApp is the default channel. The opt-in matches PDPL consent norms; reuse the existing marketing-consent posture rather than a pre-ticked box.
- **Codebase:**
  - `features/bookings/components/booking-request-form.tsx` (no-dates branch)
  - `app/[locale]/(site)/experiences/[slug]/page.tsx:492`
  - `features/availability/actions.ts` (trigger)
  - `db/schema.ts` (new table; then `pnpm db:generate`)
  - `lib/notifications/whatsapp/templates/guest.ts`
  - `messages/{en,ar}.json`

**G7. "Plan with your group" message with per-person maths**
- **What:** Next to the existing share button on the experience page, add a WhatsApp share with a bilingual prefilled message. It names the experience, two or three upcoming dates, the per-person price and the total for N people, and links to the listing, so the organiser can settle date and budget in the family group.
- **Why now:**
  - 35% of Saudi respondents name agreeing a budget as a key group-trip obstacle [33].
  - Airbnb's fall update made group trip-sharing ("Connect") a headline feature [18][19].
- **Who:** guest (the organiser).
- **Impact / effort:** Med / S. Copy and one component; the price and date data are already on the page.
- **Saudi fit:** family decisions happen in WhatsApp groups; Arabic-first message.
- **Codebase:**
  - `components/ui/share-button.tsx`
  - `features/experiences/components/guest-stepper.tsx` (party size)
  - `app/[locale]/(site)/experiences/[slug]/page.tsx`
  - `messages/{en,ar}.json`

**G1 + H3 (Revisited). Before-you-pay terms block and licence number: now with a deadline**
- **What changed:** last report proposed these as good practice. Now:
  - existing licensees have 180 days from 11 Sep 2026 (to about March 2027) to comply [5];
  - the Travel & Tourism Services Regulation is published [25];
  - licensing runs through one Ministry platform [6][7];
  - a press report says online guiding prices must show all fees in Arabic and English [26] (unconfirmed).
- **Add to the original scope:** show the VAT-inclusive total in both languages on the pay page regardless of locale toggle. Add a host-dashboard banner listing hosts whose `tourism_license` document is missing or expires before March 2027.
- **Impact / effort:** High / S (unchanged).
- **Codebase:** as in the 2026-10-12 report, plus `features/host-dashboard/` (banner) and `features/host-applications/` (expiry field).

### Host experience

**H5. "Weather move" instead of weather cancel**
- **What:** When a host picks reason `weather`, the flow asks for two alternative dates first. The guest gets a WhatsApp message with three choices: move to date A, move to date B, or full refund. The booking cancels only if the guest picks refund or doesn't answer within 24 hours. A move does not use up the guest's one free reschedule.
- **Why now:**
  - Weather disruption is a leading source of travel chargebacks [8].
  - Complaints cluster around trips that were altered or cancelled with a poor remedy [9][10].
  - Every Gharmish weather cancellation today means a manual refund (owner decision: refunds by hand).
  - Aseer winter brings fog and rain on mountain roads (`/cancellation-policy`, `weather.body2`).
- **Who:** host (keeps revenue), guest (keeps the plan), admin (fewer manual refunds).
- **Impact / effort:** Med-High / M. It reuses `reschedule-core.ts`; the new parts are a host-proposed slot pair and a one-tap guest answer link.
- **Saudi fit:** families plan around school holidays; moving a date beats a refund that arrives days later.
- **Codebase:**
  - `features/host-bookings/actions.ts` (`transitionBookingAsHost`)
  - `features/host-bookings/schemas.ts:15`
  - `features/bookings/lib/reschedule-core.ts`
  - `lib/booking-link-token.ts`
  - `lib/notifications/whatsapp/templates/guest.ts`
  - `db/schema.ts` (proposed dates on booking)

**H2 (Revisited). Per-listing performance card, plus a listing-quality checklist**
- **What changed:** GetYourGuide's 15 Sep summit centred on AI operator tools, with listing-quality checks and performance context [11][12], on top of its spring inbox and editor [13].
- **Add to the original scope:** a short checklist per listing:
  - has open weekdays (would have flagged all 8 listings this week);
  - photo count;
  - Arabic and English title/description present;
  - meeting-point note;
  - cancellation tier set.
  
  Rule-based first; no AI needed at Gharmish's scale.
- **Impact / effort:** Med / S–M.
- **Codebase:**
  - `features/host-dashboard/queries.ts`
  - `app/[locale]/host/(dashboard)/page.tsx`
  - `features/listings/` (the existing submit-readiness logic, e.g. Arabic-only inclusions)

### New features and trends to catch

**N6. Get listed in the state-backed experience channels**
- **What:** Apply to flynas "Saudi Experiences" and to the STA's 2026–27 Saudi Winter partner programme as the Aseer supplier for the 8 co-created listings. Build a partner feed only if a channel accepts. The TikTok CSV route already shows the pattern.
- **Why now:**
  - flynas/STA launched with 150+ activities in July [2][3].
  - Saudi Winter 2025 carried 1,200+ products [4].
  - Viator's own Q2 shows organic search is getting harder and more costly [21][22].
- **Who:** host (demand), admin.
- **Impact / effort:** High / S for the application (owner-led). M if a feed is needed. Commission terms on those channels are unknown and need checking before signing.
- **Saudi fit:** strong; government-backed, Arabic, domestic audience.
- **Codebase:** none for the application; later `app/api/catalog/` (a second feed beside `tiktok.csv`).

**N3 (Revisited). AI-assistant distribution: still watch**
- **New evidence:**
  - Viator is in Gemini (30 Jul) [14][15], joined by GetYourGuide and Fever (12 Aug) [16].
  - Civitatis has a ChatGPT cart [17].
  - 68% of Saudi travellers use AI to plan and 76% of them use ChatGPT [29].
- **Why still parked:** every integration still hands checkout back to the platform [14][30], and Gharmish has zero bookable dates. Keep the existing parked trigger (chatgpt.com referrals over 20 a month → Arabic `llms.txt`).

**N7. Pay later for instant-book listings (later)**
- Headout's "Now, Pay Later" [23] and Viator's charge-before-date model are spreading.
- Gharmish request-to-book already charges nothing until acceptance, so the gap is only on instant-book listings.
- Revisit when instant book is common. Effort M (HyperPay tokenised charge), Impact Low today.

### Quick wins (< 1 week)
- **Q6.** G6 date alerts (minimum version: capture plus a manual admin export, before the automatic sender).
- **Q7.** G7 "Plan with your group" WhatsApp message.
- **Q8.** N6 applications to flynas Saudi Experiences and Saudi Winter (owner task, no code).
- **Q9.** Add a "Something went wrong? Tell us" link to the existing post-experience review-invite WhatsApp, pointing to the booking page's "Report a problem" form. It catches problems before the guest goes to the bank [8].
  - Code: `lib/notifications/whatsapp/templates/guest.ts`.
  - Needs a template revision (Meta approval).
- **Q10.** Review-policy line: one sentence on `/trust-and-safety` stating that every review from a completed booking is published, including low ratings, and that reviews are never incentivised. This aligns with UK/US fake-review enforcement [37][38].
  - Code: `messages/{en,ar}.json`, `app/[locale]/(site)/trust-and-safety/`.
  - The X6 review-moderation build card in the dev plan should stay consistent with this line.

## Top 5 for next sprint (impact ÷ effort)

1. **G6 – "Notify me when dates open" via WhatsApp** (High / S–M). Turns today's dead-end on all 8 live listings into captured demand.
2. **N6 – Apply to flynas "Saudi Experiences" and Saudi Winter 2026–27** (High / S, owner-led). A state-backed channel at near-zero build cost.
3. **G1 + H3 (Revisited) – Before-you-pay block and licence number** (High / S). There is now a compliance deadline of about March 2027.
4. **G7 – "Plan with your group" WhatsApp share with per-person maths** (Med / S). Addresses the group-budget friction Saudi travellers report.
5. **H5 – Weather move instead of weather cancel** (Med-High / M). Keeps bookings, cuts manual refunds and the risk of chargebacks.

Next in line: H2 (Revisited) performance card plus quality checklist.

## Sources
★ = claim verified from a search excerpt only (full pages could not be opened from this environment).

1. ★ Arival, "Fewer Trips, Higher Stakes: 2026 U.S. Traveler Outlook" — https://arival.travel/article/fewer-trips-higher-stakes-us-traveler-outlook-2026/
2. ★ flynas, "flynas launches Saudi Experiences platform … in collaboration with the Saudi Tourism Authority", Jul 2026 — https://www.flynas.com/en/media-center/news-updates/flynas-launches-saudi-experiences-platform-to-enhance-tourism-in-the-kingdom-in-collaboration-with-the-saudi-tourism-authority
3. ★ Sharikat Mubasher, "flynas, Saudi Tourism Authority launch 'Saudi Experiences' to support entrepreneurs" — https://sharikatmubasher.com/news/article/21560888/flynas-saudi-tourism-authority-launch-saudi-experiences-to-support-entrepreneurs?lang=en
4. ★ Sharikat Mubasher, "Saudi Arabia unveils Saudi Winter 2025 to attract global tourists" — https://en.sharikatmubasher.com/news/article/21506367/saudi-arabia-unveils-saudi-winter-2025-to-attract-global-tourists?lang=en
5. ★ Umm Al-Qura, لائحة الإرشاد السياحي (amending decision, 180-day transition) — https://www.uqn.gov.sa/decisions-and-regulations/4001829
6. ★ Gulf Business, "Saudi Arabia's new tourism platform brings licensing, investment and AI services under one roof", Sep 2026 — https://gulfbusiness.com/en/2026/saudi-arabia/saudi-arabias-new-tourism-platform-brings-licensing-investment-and-ai-services-under-one-roof/
7. ★ TradeArabia, "Saudi Tourism Ministry launches unified digital platform at LEAP 2026" — https://tradearabia.com/News/467300/Saudi-Tourism-Ministry-launches-unified-digital-platform-at-LEAP-2026
8. ★ Merchant Risk Council, "Weather disruptions, cancellations and chargebacks in travel", Apr 2026 — https://merchantriskcouncil.org/learning/resource-center/member-news/blog/2026/weather-disruptions-cancellations-and-chargebacks-in-travel
9. ★ Travel Tomorrow, "Disrupted Danube cruises spark controversy over TUI's compensation policy" — https://traveltomorrow.com/disrupted-danube-cruises-spark-controversy-over-tuis-compensation-policy/
10. ★ Trustpilot, Klook reviews (consumer reports, 2026) — https://ie.trustpilot.com/review/www.klook.com?page=4
11. ★ GlobeNewswire, "GetYourGuide Unveils New Tools to Help Tour and Attraction Operators…", 15 Sep 2026 — https://www.globenewswire.com/news-release/2026/09/15/3361880/0/en/getyourguide-unveils-new-tools-to-help-tour-and-attraction-operators-sharpen-performance-build-stronger-listings-and-reach-travelers-faster.html
12. ★ GetYourGuide Supply, "Unlocked Summit Berlin 2026" — https://getyourguide.supply/unlocked-summit-berlin-2026
13. ★ Arival, "GetYourGuide: A Push Towards Differentiation" — https://arival.travel/?p=194491
14. ★ Tripadvisor mediaroom, "Viator Becomes Google's First Connected App for Travel Experiences", 30 Jul 2026 — https://tripadvisor.mediaroom.com/2026-07-30-Viator-Becomes-Googles-First-Connected-App-for-Travel-Experiences
15. ★ TechGenyz, "Gemini Viator integration" — https://techgenyz.com/gemini-viator-integration/
16. ★ Google blog, "New connected apps and services in Gemini", Aug 2026 — https://blog.google/innovation-and-ai/products/gemini-app/new-connected-apps-services-gemini-august-2026/
17. ★ Civitatis blog, "ChatGPT × Civitatis" (vendor source), Sep 2026 — https://www.civitatis.com/blog/en/chatgpt-civitatis/
18. ★ PhocusWire, "Airbnb expands social discovery strategy with latest app updates (fall 2026)" — https://www.phocuswire.com/news/online/airbnb-expands-social-discovery-strategy-latest-app-updates-fall-2026
19. ★ Rental Scale-Up, "Airbnb turns word of mouth into a feature…" — https://www.rentalscaleup.com/airbnb-fall-update-2026-guest-features/
20. ★ Airbnb Q2 2026 shareholder letter (SEC 8-K Ex. 99.1) — https://www.sec.gov/Archives/edgar/data/0001559720/000119312526211816/d23351dex991.htm
21. ★ MarketBeat, "Tripadvisor Q2 earnings call highlights", Aug 2026 — https://www.marketbeat.com/instant-alerts/tripadvisor-q2-earnings-call-highlights-2026-08-07/
22. ★ Zacks, "Tripadvisor's Q2 earnings and revenues miss" — https://www.zacks.com/stock/news/2971962/tripadvisors-q2-earnings-and-revenues-miss-amid-macro-pressures
23. ★ Headout newsroom, "Headout launches Headout Now, Pay Later" — https://newsroom.headout.com/news/headout-launches-headout-now-pay-later/
24. ★ TTG Asia, "Klook, Mastercard to target experience-led travel in Asia-Pacific", 31 Aug 2026 — https://www.ttgasia.com/2026/08/31/klook-mastercard-to-target-experience-led-travel-in-asia-pacific/
25. ★ Umm Al-Qura, لائحة خدمات السفر والسياحة — https://www.uqn.gov.sa/decisions-and-regulations/4001822
26. ★ Amlak, "بالتفاصيل.. لائحة الإرشاد السياحي تشدد على دقة المعلومات" (single source; bilingual price rule unconfirmed) — https://amlak.net.sa/110187/
27. ★ Gulf News, "Riyadh Season 2026 to begin on October 21" — https://gulfnews.com/world/gulf/saudi/riyadh-season-2026-to-begin-on-october-21-with-10-weeks-of-entertainment-1.500689955
28. ★ Saudi Shopper, "SEVEN Abha entertainment destination opens" (single source) — https://saudishopper.com.sa/en/seven-abha-entertainment-destination-opens/
29. ★ MENA Startup Digest, "Two-thirds of UAE and Saudi travellers now trust AI for accommodation booking" (Marriott Bonvoy) — https://menastartupdigest.com/two-thirds-of-uae-and-saudi-travellers-now-trust-ai-for-accommodation-booking/
30. ★ Google blog, "AI Mode: agentic and personalized" — https://blog.google/products/search/ai-mode-agentic-personalized/
31. ★ SAMA, "E-Payments Account for 85% of Total Retail Payments in 2025" — https://sama.gov.sa/en-US/MediaCenter/News/Pages/news-1139.aspx
32. ★ Breaking Travel News, "US travelers take fewer trips but spend more on experiences" (Arival) — https://www.breakingtravelnews.com/news/article/us-travelers-take-fewer-trips-but-spend-more-on-experiences-finds-new-ariva/
33. ★ Zawya, "Flexible travel shapes Saudi summer plans: Skyscanner" — https://www.zawya.com/en/business/travel-and-tourism/flexible-travel-shapes-saudi-summer-plans-skyscanner-semczfic
34. ★ TradeArabia, "UAE, Saudi travellers shift towards flexible, wellness-focused holidays in 2027: Hilton" — https://www.tradearabia.com/News/486968/UAE-Saudi-travellers-shift-towards-flexible-wellness-focused-holidays-in-2027-Hilton/TTN
35. ★ Trustpilot, webook.com reviews (consumer reports, small sample) — https://nl-be.trustpilot.com/review/webook.com
36. ★ Skift, Airbnb host payout holds — https://skift.com/?p=568752
37. ★ Herbert Smith Freehills Kramer, "CMA launches first investigations into fake and misleading reviews", Mar 2026 — https://www.hsfkramer.com/notes/crt/2026-03/cma-launches-first-investigations-into-fake-and-misleading-reviews
38. ★ FoodNavigator-USA, "FTC signals crackdown on fake reviews and testimonials", Jan 2026 — https://www.foodnavigator-usa.com/Article/2026/01/07/ftc-signals-crackdown-on-fake-reviews-and-testimonials
