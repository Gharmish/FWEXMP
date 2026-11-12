# Market research — 2026-11-12

> Sixth report in this series. It builds on [2026-10-12](./2026-10-12-market-research.md), [2026-10-15](./2026-10-15-market-research.md), [2026-10-22](./2026-10-22-market-research.md), [2026-10-29](./2026-10-29-market-research.md) and [2026-11-05](./2026-11-05-market-research.md), all on `main`. It repeats none of their recommendations (G1–G11, H1–H8, N1–N11, Q1–Q23) except N6, which is marked **Revisited** because there is new evidence. New IDs start at H9 and N12.
> Research ran through web-search excerpts only, because full pages could not be opened from this environment. Every source therefore carries ★. Check the original before quoting a figure externally.
> Another short report. The week's real news is on the **supply side**: Klook launched an AI agent for its merchants, and the Ministry of Tourism's TourismX tools for guides and its developer portal are now in beta. Demand-side news (Airbnb + Viator, TikTok GO) has not reached Saudi Arabia yet.

## الملخص التنفيذي

- **«كلوك» أطلقت وكيلاً ذكياً للمضيفين (3 نوفمبر):** يكتب مسودة الإعلان من مواد المضيف ويحدّث الأسعار والتوفر. في غارميش حقل الوصف الإنجليزي إلزامي (60 حرفاً على الأقل) والعربي اختياري، وهذا عكس ما يناسب مضيفاً سعودياً يكتب بالعربية. نقترح زر «اكتب لي المسودة من ملاحظاتي» يكتب النسختين العربية والإنجليزية ليراجعها المضيف (H9).
- **وزارة السياحة أطلقت «TourismX» وبوابة المطوّرين:** فيها أدوات مجانية للمرشدين (مساعد ذكي للمرشد، مولّد نصوص الجولات) وواجهات برمجية للمطوّرين. نوصي المالك بالتسجيل وطلب واجهة للتحقق من رخص المرشدين، لربطها بختم «مضيف موثّق» (N12).
- **برنامج «شتاء السعودية 2026» بدأ:** أُطلق «المسار الشمالي» في 3 نوفمبر، والهيئة تدعو مقدّمي التجارب لاستخدام هوية البرنامج. ونافذة موسم الشتاء في «اكتشف عسير» من 1 نوفمبر إلى 31 ديسمبر. نوصي المالك بالتسجيل الآن والانضمام حين تُفتح المواعيد (N6، مراجَعة).
- **نمو السياحة الكلي تباطأ:** 61.2 مليون سائح في النصف الأول من 2026 (+1% فقط)، بينما ارتفعت الرحلات المحلية 16% في الربع الأول. السوق المحلي العربي ما زال هو الرهان الصحيح.
- **ما زال قائماً:** زر واتساب في صفحة «لا نتائج» (Q23)، والتحقق من موجة الفوترة الإلكترونية قبل 1 فبراير 2027 (N11)، وجدول رمضان (G9) الذي يجب أن يبدأ في ديسمبر.

## Executive summary

- **Klook shipped an AI agent for its merchants (3 Nov).** K.ai drafts structured listings from material the merchant uploads, updates prices and availability on instruction, and explains changes in performance [1][2][3]. In Gharmish, the English description is required and the Arabic one is optional (`features/listings/schemas.ts:120-123`). That is backwards for an Arabic-first host. **H9:** a "draft it from my notes" button that writes both languages for the host to edit (M, Claude Code session).
- **The Ministry of Tourism's TourismX and MT Developer Portal are in beta.** They include a Tour Guide AI Assistant, an AI Tour Script Generator and APIs for third-party developers [4][5][6]. **N12 (owner):** register, ask whether a licence-lookup API exists, and point hosts to the free guide tools.
- **The Saudi Winter 2026 programme has started.** The Northern Trail launched on 3 Nov, and the Saudi Tourism Authority asks experience providers to use the programme identity [7][8]. Discover Aseer's winter window is 1 Nov–31 Dec [9]. **N6 Revisited (owner):** register now, join when dates reopen.
- **Total tourism growth slowed. Domestic growth has not.** There were 61.2M tourists in H1 2026 (+1% year on year) [10][11], against +16% domestic trips in Q1 [12]. Keep building for Arabic-speaking domestic guests.
- **Watch only:** the Airbnb–Viator catalogue deal is still "later in 2026", with no launch found [13][14]. TikTok GO booking is US-only [15][16]. Guest complaints on GetYourGuide and Viator still centre on last-minute operator cancellations [17][18]. Gharmish already refunds operator cancellations in full and sends a `booking_cancelled` WhatsApp.

## Current state (re-verified 2026-11-12)

The inventories in the earlier reports still hold. Since the 2026-11-05 report, `main` received only bug fixes and the weekly PM and SEO reports (`git log --since=2026-11-04`, no `feat` commits). Facts verified for this report:

- **Listing creation:**
  - `/host/experiences/new` collects only a name and category, then creates a draft row (`app/[locale]/host/(dashboard)/experiences/new/page.tsx`).
  - The edit page saves each section on its own (`app/[locale]/host/(dashboard)/experiences/[id]/experience-form.tsx`). A readiness card shows what is missing (`features/host-experiences/components/readiness-card.tsx`).
  - **English is required, Arabic is optional:** `titleEn` needs 8–120 characters and `descriptionEn` 60–4,000. `titleAr` and `descriptionAr` are optional (`features/listings/schemas.ts:120-123`).
  - **No AI drafting exists.** The only Anthropic client is the WhatsApp support agent (`features/support-agent/agent.ts:80`). `@anthropic-ai/sdk` is already a dependency (`package.json:59`), so H9 needs no new package.
- **Licences:** `tourism_license` is a KYC document type, optional for individuals and required for CR (company) hosts (`db/schema.ts:1186-1194`). It is checked by hand, with no lookup against the ministry.
- **Operator cancellations:** a host or admin cancellation of a paid booking refunds in full (`features/bookings/lib/transition-executor.ts:324-329`). The guest gets an email and a `booking_cancelled` WhatsApp (`lib/notifications/whatsapp/templates/guest.ts:281`). Host cancellations count toward the host's cancellation rate on the dashboard (`app/[locale]/host/(dashboard)/page.tsx:510`).
- **Funnel and supply (2026-11-06 PM report, not re-queried):** no paid booking since 2026-10-02. The 8 live listings have no bookable dates (owner decision, not re-proposed here).
- **Last week's items:** Q23, N10 and N11 appear in the PM report's founder decisions, but no issue was opened for them between 4 and 12 Nov (`GET /issues?since=2026-11-04`).

## What changed in the market (since 2026-11-05, or not covered before)

### Global competitors

- **Klook K.ai (3 Nov 2026):**
  - It is an AI agent inside Klook's merchant portal. It checks bookings and availability, and it updates inventory and pricing when the merchant asks [1][2].
  - It drafts structured product listings from material the merchant uploads, for the merchant to review [2][3].
  - It flags performance changes on the Reviews and Dashboard pages and suggests reasons [2].
  - The rollout is phased and global, ahead of the year-end season [1].
  - Klook says merchants who use K.ai get 3.4× the monthly bookings of those who don't. That is Klook's own figure, and it does not show causation [2].
- **Airbnb:**
  - The Tripadvisor/Viator deal (announced 11 Aug) is still described as launching "later in 2026". No launch was found [13][14].
  - The autumn 2026 update covers Services (for example baby-equipment rental), not Experiences [19].
- **GetYourGuide:** no product launch found since the April AI release and the September Creator Reviews beta. Its most recent news is a digital-services-tax surcharge on suppliers in five markets from 1 Oct [20].
- **TikTok GO:** in-app booking of hotels, tours and experiences launched in the US in May 2026 [15][16]. No Saudi or MENA launch was found. N2 (short video) stays as it was.

### Saudi Arabia and the GCC

- **TourismX, the MT App and the MT Developer Portal (Ministry of Tourism):**
  - The ministry announced an AI Tourism Vision. One source dates it 29 Jun 2026 [4].
  - TourismX is a beta platform for businesses. Its tools include a Tour Guide AI Assistant and an AI Tour Script Generator [4][5].
  - The beta Saudi MT App serves investors, tourism businesses and tour guides. It has an AI assistant called Noura [5][6].
  - The MT Developer Portal offers APIs and integration tools for technology partners [5].
  - The stated aim is to give guides and small operators digital tools that only large firms used to have [21].
  - Gharmish's reports had not covered it before.
- **Saudi Winter 2026:**
  - The Tourism Minister launched the Northern Trail (Riyadh to Jubbah, 1,200 km) under the Saudi Winter 2026 programme. Trade press dated it 3 Nov [7][8].
  - The Saudi Tourism Authority encourages experience providers to use the programme's official identity in their promotion [7].
  - Last year's programme listed 1,200+ products and 600+ offers and ran to the end of Q1 [22].
  - Discover Aseer lists its winter season as 1 Nov–31 Dec [9]. No official Aseer 2026–27 winter programme was found (third week searched) [9][23].
- **Demand:**
  - H1 2026: 61.2M tourists (+~1% year on year) and SAR 151.9B spending, announced at WTM London (4–5 Nov) [10][11].
  - Q1 2026: domestic trips +16% to 28.9M [12].
  - One report says sector growth fell 5–6% in the first five months of 2026 [24]. It is single-sourced and not used for any recommendation.
- **PDPL:** no new decision-level enforcement was found. SDAIA does not publish a decision-by-decision register. Secondary sources count 48 decisions and say SDAIA favours warnings and corrective orders [25][26]. Q22 (#254 runbook) stands as written.
- **BNPL:** Tabby raised a $233M Series F at a $6.5B valuation (Sep–Oct 2026) and now holds SAMA consumer and SME finance licences [27][28]. This adds nothing to N4 or N7 while no listing is sellable.

### Trends

- **AI for the supply side:** Klook (K.ai) and the Saudi ministry (TourismX script generator) both shipped AI that writes listings or tour scripts for small operators in the same quarter [1][5]. Until now, competitor AI news was guest-facing (GetYourGuide review summaries, Klook's traveller agent).
- **Agentic booking:** Google AI Mode books restaurants, tickets and appointments, and is testing hotels in the US. No tours or activities booking was found [29][30]. N3 stays on watch.
- **Gifting:** SAR travel gift cards (SAR 500–5,000) are sold through Saudi gift-card resellers [31]. No experience-specific demand data was found. N5 is unchanged.

### Pain points (new evidence)

- **Guests:** 2026 complaints about GetYourGuide and Viator centre on operators cancelling at short notice or not showing up, and on refund disputes afterwards [17][18]. They are self-selected complaint sites, with no rates. Gharmish already covers this case (full refund, WhatsApp notice, host cancellation rate), so there is no new recommendation.
- **Hosts:** no Experiences-specific host complaint was found this week. Airbnb stays-host complaints about falling bookings [32] are not about Experiences.

## Recommendations

### Guest experience

No new guest recommendation this week. Q23 (WhatsApp ask on zero-result searches) is still the best guest item and has not been filed yet.

### Host experience

**H9. "Draft it from my notes": a bilingual listing drafter on the listing edit page**

- **What:**
  - Add a "Draft from my notes" panel to the details section of `/host/experiences/[id]`. The host types or pastes notes in Arabic or English (what happens, where, how long, what to bring, family or women-only fit).
  - A server action sends the notes to Claude through the existing SDK and returns `titleAr`, `titleEn`, `descriptionAr` and `descriptionEn`, shaped to the same zod limits.
  - The drafts only fill the form fields. Nothing is saved until the host presses the section's normal save, and admin review before going live stays as it is.
  - Cap use per host per day. Never send host contact details. Log failures to Sentry with the host id only.
- **Why now:**
  - Klook shipped the same pattern on 3 Nov: listings drafted from the merchant's own material, then reviewed [1][2][3].
  - The Saudi ministry gives guides an AI Tour Script Generator for the same reason: small operators lack writing resources [5][21].
  - In Gharmish, `descriptionEn` (60+ characters) is required and Arabic is optional (`features/listings/schemas.ts:120-123`). An individual Saudi host who writes in Arabic hits an English wall before the listing can be completed.
  - Q23 and N10 are meant to bring demand signals and new hosts. Each new host then has to write a bilingual listing.
- **Who:** host (listing finished in one sitting), admin (less rewriting during co-creation).
- **Impact / effort:** Med / M.
  - Impact: it removes the main writing barrier for new individual hosts. It matters most once recruitment starts, not for the 8 existing listings.
  - Effort: a server action, a prompt, a form panel and tests. The SDK and key already exist.
- **Saudi fit:** Arabic-first. The prompt asks for calm, Modern Standard Arabic that matches BRIEF's tone ("a host introducing a friend to their hometown"). It keeps family and women-only details accurate and never invents facilities.
- **Codebase:**
  - `app/[locale]/host/(dashboard)/experiences/[id]/experience-form.tsx` (panel) and `build-form-copy.ts` (copy props)
  - `features/host-experiences/actions.ts` (new action using `useActionState` and a zod schema; returns `{ success: false, message, values }` on failure)
  - `features/support-agent/agent.ts:80` (client pattern to reuse) and `lib/env.ts:134` (`ANTHROPIC_API_KEY`)
  - `features/listings/schemas.ts:119-123` (limits the output must meet)
  - `messages/en.json` and `messages/ar.json` (`hostExperiences.form.*` keys)
- **Owner decision first:** should Arabic become the required language and English the optional one for individual hosts? That is a schema rule change, separate from H9. The drafter works either way.
- **Who executes:** a Claude Code session the owner starts. Too large for an S card, because it involves a prompt, rate limiting and tests.

### New features and trends to catch

**N12. Register on the MT Developer Portal and TourismX; ask for a licence-lookup API** (owner task, no code yet)

- **What:**
  1. Register Gharmish on the Ministry of Tourism's MT Developer Portal and the TourismX beta.
  2. Ask whether an API exists to verify a tour-guide or tourism-activity licence number. If it does, the verified-host seal can check `tourism_license` automatically instead of by hand.
  3. Ask the same contact the open N8 question: whether a marketplace needs its own licence under the September 2026 rules.
  4. Tell current hosts about the free Tour Guide AI Assistant and AI Tour Script Generator in the next host WhatsApp update.
- **Why now:**
  - The portal is new and offers APIs to technology partners [5]. Early partners are more likely to be heard.
  - Licensed guides are the ministry's named audience for the MT App and TourismX [5][6][21].
  - N8 has an adjustment-window deadline in about March 2027 (2026-10-29 report).
- **Who:** admin and owner (KYC by API instead of by hand), host (free tools).
- **Impact / effort:** Med / S (owner time). If a lookup API exists, it becomes an M build (verified seal plus H3 licence display).
- **Saudi fit:** it puts the government licence behind the "verified host" seal, which is the trust signal Saudi guests expect.
- **Codebase (only if an API exists):** `db/schema.ts:1186-1194` (KYC document types), `features/host-applications/`, `features/admin/` (KYC review).

**N6 Revisited. Saudi Winter 2026 and Discover Aseer's winter window** (owner task)

- **What changed:** the Saudi Winter 2026 programme is live (Northern Trail, 3 Nov), and the Saudi Tourism Authority is inviting experience providers to use its identity [7][8]. Discover Aseer's winter window runs 1 Nov–31 Dec [9].
- **Action:** ask the Saudi Tourism Authority how a marketplace joins the Saudi Winter offers listing. Combine it with the N10 request to Discover Aseer. Join only once listings have dates, because traffic sent to listings with no dates is wasted.
- **Impact / effort:** Med / S (owner time). It is time-boxed: the Aseer window closes on 31 Dec.

**Watch (no action):** Airbnb–Viator in Saudi Arabia [13][14]; TikTok GO outside the US [15]; Google AI Mode for activities [29].

### Quick wins (< 1 week)

There is no new Daily Fixer card this week. The best S card is still **Q23** in the [2026-11-05 report](./2026-11-05-market-research.md#guest-experience). It is complete and paste-ready, and it has not been filed.

- **N12:** one registration and one email (owner).
- **N6 Revisited:** one email, combined with N10 (owner).

## Top 5 for next sprint (impact ÷ effort)

1. **Q23 – WhatsApp ask on zero-result searches** (carried; Med / S, Daily Fixer). The card is in the 11-05 report. 84% of searches still dead-end, and no issue has been filed.
2. **N12 – Register on the MT Developer Portal and TourismX, and ask for a licence-lookup API** (Med / S, owner). A new government channel that could automate the verified-host check and settle the N8 licence question.
3. **N11 – Confirm the ZATCA Phase 2 wave with the accountant** (carried; High if in scope / S, owner). The 1 Feb 2027 deadline is 81 days away, and no Fatoora integration exists.
4. **N6 Revisited + N10 – one email to Discover Aseer and the Saudi Winter programme** (Med / S, owner). Aseer's winter window closes on 31 Dec. Join when dates reopen.
5. **H9 – Bilingual listing drafter from host notes** (Med / M, Claude Code session). Klook and the ministry shipped the same pattern this quarter, and Gharmish currently requires English from Arabic-first hosts.

Still open from earlier reports, unchanged in priority:

- G9 (Ramadan schedule): it must start in December, because Ramadan begins about 8 Feb 2027.
- Q22 (SDAIA clause in the #254 runbook).
- G11 (data download and deletion).
- H8 and Q21 (host-sourced link).
- G8 (instant credit refund).
- N8 (licence question; N12 is now the route to ask it).

## Sources

★ = claim verified from a search excerpt only (full pages could not be opened from this environment).

1. ★ Macau Business, "Klook launches K.ai, an AI agent that manages merchants' back-office operations", 3 Nov 2026 — https://macaubusiness.com/klook-launches-k-ai-an-ai-agent-that-manages-merchants-back-office-operations/
2. ★ The Paypers, "Klook launches K.ai agent to manage merchants' back-office operations", Nov 2026 — https://thepaypers.com/payments/news/klook-launches-kai-agent-to-manage-merchants-back-office-operations
3. ★ Webull News (wire copy), "Klook launches K.ai…" — https://www.webull.com/news/15858431489711104
4. ★ Stellagent, "Saudi Arabia TourismX AI tourism", 30 Jun 2026 — https://stellagent.ai/insights/saudi-arabia-tourismx-ai-tourism
5. ★ Zawya, "Saudi Arabia rolls out AI tourism strategy to enhance visitor experience" — https://www.zawya.com/en/business/travel-and-tourism/saudi-arabia-rolls-out-ai-tourism-strategy-to-enhance-visitor-experience-sghob2xn
6. ★ Fast Company Middle East, AI Tourism Vision and Saudi MT App (Noura) — https://fastcompanyme.com/?p=97520
7. ★ TradeArabia, "Saudi Arabia launches 1,200km Northern Trail to boost winter tourism", 3 Nov 2026 — https://tradearabia.com/News/489114/Saudi-Arabia-launches-1-200km-Northern-Trail-to-boost-winter-tourism
8. ★ GDN Online, "Saudi Arabia launches 1,200km Northern Trail to boost winter tourism" — https://www.gdnonline.com/Details/1411677/Saudi-Arabia-launches-1,200km-Northern-Trail-to-boost-winter-tourism
9. ★ Discover Aseer, Winter season (1 Nov–31 Dec; year not stated on page) — https://discoveraseer.com/en/event/event-seasons/winter-season
10. ★ Arab News Pakistan, "Saudi Arabia welcomes 61.2m tourists in first half of 2026" — https://www.arabnews.pk/saudi-arabia/saudi-arabia-welcomes-612m-tourists-in-first-half-of-2026-3006072
11. ★ Macau Business, "H.E. Ahmed Al Khateeb … inaugurates Saudi Land at WTM London 2026" — https://macaubusiness.com/h-e-ahmed-al-khateeb-saudi-minister-of-tourism-inaugurates-saudi-land-at-wtm-london-2026-reinforcing-saudis-commitment-to-global-travel-trade/
12. ★ Arab News, "Saudi domestic tourism rises 16% in Q1: Ministry" — https://www.arabnews.com/node/2639192
13. ★ Skift, "Airbnb partners with Tripadvisor for experiences, drops build-your-own strategy", 11 Aug 2026 — https://skift.com/2026/08/11/airbnb-partners-with-tripadvisor-experiences-drops-build-your-own-strategy/
14. ★ PhocusWire, "Airbnb partners with Tripadvisor to scale experiences" — https://www.phocuswire.com/news/distribution/airbnb-partners-tripadvisor-scale-experiences
15. ★ Skift, "TikTok Turns Travel Videos Into Bookable Stays and Experiences", 12 May 2026 — https://skift.com/2026/05/12/tiktok-go-travel-booking-social-media/
16. ★ Euronews Arabic, "TikTok GO lets US users book travel experiences in app", 13 May 2026 — https://arabic.euronews.com/travel/2026/05/13/from-dances-to-destinations-tiktok-go-lets-us-users-book-travel-experiences-in-app
17. ★ Sikayetvar, GetYourGuide complaints (last-minute cancellations; self-reported) — https://www.sikayetvar.com/en/getyourguide-us
18. ★ BBB, Viator, Inc. complaints profile — https://prod.bbb.org/us/ma/needham/profile/tour-operators/viator-inc-0021-541464/complaints?page=3
19. ★ Airbnb Newsroom, "Airbnb 2026 autumn update" — https://news.airbnb.com/en-uk/airbnb-2026-autumn-update
20. ★ Destination.com, "GetYourGuide to pass digital services tax costs to tour operators", Aug 2026 — https://www.destination.com/news/getyourguide-to-pass-digital-services-tax-costs-to-tour-operators
21. ★ eTurboNews, Saudi AI Tourism Vision (tools for guides and small operators) — https://eturbonews.com/?p=3157073
22. ★ Asharq Al-Awsat, "Tourism Minister Launches Saudi Winter 2025 Program…" — https://english.aawsat.com/business/5186290-tourism-minister-launches-saudi-winter-2025-program-broad-private-sector
23. ★ Al Riyadh Daily, "Aseer Continues Tourism Growth, Targets More Than Three Million Visitors" — https://alriyadhdaily.com/article/6d310d718098407eb1f6fe2484178577
24. ★ MENA Startup Digest, "Saudi Arabia Unveils AI Tourism Vision…" (single source for the 5–6% decline) — https://menastartupdigest.com/?p=43751
25. ★ JD Supra, "Active Enforcement of Saudi Arabia Privacy Regime" — https://www.jdsupra.com/legalnews/active-enforcement-of-saudi-arabia-3202525/
26. ★ Clyde & Co, "Enforcement of the Saudi Personal Data Protection Law is live", Mar 2026 — https://www.clydeco.com/en/insights/2026/03/enforcement-of-the-saudi-pdp-law
27. ★ Crowdfund Insider, "Saudi Fintech Firm Tabby Reports $233M Funding Round at $6.5B Valuation", Sep 2026 — https://www.crowdfundinsider.com/2026/09/310324-saudi-fintech-firm-tabby-reports-233m-funding-round-at-6-5b-valuation-as-it-moves-beyond-bnpl
28. ★ MENA Startup Digest, "Tabby Moves Beyond BNPL in Saudi Arabia, Securing SAMA Licenses…" — https://menastartupdigest.com/?p=43661
29. ★ Google Blog, "New ways to plan travel with AI in Search" — https://blog.google/products-and-platforms/products/search/agentic-plans-booking-travel-canvas-ai-mode/
30. ★ Deep Arrival, "Google agentic hotel booking US test", Aug 2026 — https://deeparrival.com/news/google-agentic-hotel-booking-us-test-august-2026/
31. ★ GIFQ, TripGift SA (SAR 500–5,000 travel gift card) — https://www.gifq.com/brands/tripgift-sa
32. ★ AirROI, "Are Airbnb bookings down in 2026?" — https://www.airroi.com/blog/are-airbnb-bookings-down-2026
