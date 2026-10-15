# Market research — 2026-10-12

> First report in this series. `docs/research/` was empty on `main` and the remote had no `research/*` branches, so nothing here is "Revisited".
> Research ran through web-search excerpts only, because full pages could not be opened from this environment. Every source carries ★ for that reason. Check the original before quoting a figure externally.

## الملخص التنفيذي

- **تنظيم جديد للإرشاد السياحي (سبتمبر 2026):** حدّثت وزارة السياحة أربع لوائح. أصبح بإمكان المرشد التعاقد مع السائح مباشرةً وإصدار وثائق الحجز، بشرط الإفصاح الواضح عن السعر وطريقة الدفع وسياسة الإلغاء والاسترداد. نوصي بأن تعرض صفحة التجربة وصفحة الدفع هذه البنود مجتمعة، وبأن يظهر رقم ترخيص المضيف.
- **المنافسون يقلّلون الغموض قبل الحجز:** أطلقت GetYourGuide ملخصات للتقييمات بالذكاء الاصطناعي وصورةً لنقطة اللقاء على القسيمة. نقطة اللقاء في غارميش خريطة فقط، وإضافة صورة لها مكسب سريع.
- **الحجز عبر المحادثة وصل إلى السوق السعودي:** أطلقت ‏webook مساعد حجز بالذكاء الاصطناعي على واتساب وإنستغرام وX، ويقول 80% من المسافرين السعوديين إنهم واثقون من استخدام الذكاء الاصطناعي في التخطيط والحجز. وكيل غارميش على واتساب لا يستطيع اليوم البحث في التجارب.
- **العائلات والمجموعات هي النمو:** نمت حجوزات العائلات والمجموعات 70% لدى المسافر، و46% من السعوديين يرون تنظيم رحلة جماعية أكثر إرهاقًا من الانتقال إلى منزل جديد. لا تدعم غارميش الحجز الخاص للمجموعة ولا تسعير الأطفال.
- **ثقة المضيفين:** رفعت GetYourGuide عمولة بعض الشركاء من 20% إلى 30% بإشعار قصير. ينبغي أن تعلن غارميش عمولتها (15%) وموعد التحويل صراحةً في صفحة الاستضافة، مع لوحة أداء بسيطة لكل تجربة.

## Executive summary

- **Regulation moved (11 Sep 2026).** The Ministry of Tourism updated four regulations. Under the new tour-guiding rule, guides may contract directly with tourists and issue booking documents, provided they clearly disclose the price, how payment works, and the cancellation and refund policy [1][2]. Gharmish should show those terms together before payment and display each host's licence number.
- **Competitors are removing pre-booking uncertainty.** GetYourGuide's Spring 2026 release added AI review summaries, keyword search within reviews, and a photo of the exact meeting point on the voucher [3][4]. On Gharmish the meeting point is a pin on a map, so adding a photo is cheap.
- **Conversational booking has reached Saudi Arabia.** webook.com launched an AI booking assistant on WhatsApp, Instagram and X [5]. Skyscanner reports that 80% of Saudi travellers are confident using AI to plan and book trips [6]. The Gharmish WhatsApp agent cannot search the catalogue today.
- **Families and groups drive growth.** Almosafer reported 70% growth in family and group bookings [7]. In Skyscanner's survey, 46% of Saudi respondents said organising a group trip is more stressful than moving house [8]. Gharmish prices per person only and has no private-group or child pricing.
- **Host trust is a differentiator.** GetYourGuide raised some suppliers' commission from 20% to 30% at short notice in peak season [9]. Gharmish's 15% rate and its payout timing are not stated on `/hosting`.

## Current state (verified in the repo, 2026-10-12)

Do not propose any of the following; they already exist.

- **Catalogue and search:** `/experiences` with filters for text, category, price, duration, day preset, group size, city and Originals, plus four sort orders (`features/experiences/lib/search.ts`). There is also an `/abha` landing page, a wishlist (`features/wishlist`), live `llms.txt` (`app/llms.txt/route.ts`), JSON-LD, and a TikTok catalogue feed (`app/api/catalog/tiktok.csv`).
- **Booking:** request-to-book (the default) or instant book per listing (`bookingModeEnum`, `db/schema.ts:156`). Pricing is a flat per-person `priceSar` with `maxGroupSize` and `minAge`. Guests can cancel or reschedule under three cancellation tiers. Each booking has a VAT/ZATCA QR invoice and an `.ics` file per booking.
- **Payments:** HyperPay (card, mada, Apple Pay), the Gharmish Credit wallet and promo codes. Refunds are processed by hand.
- **Reviews:** star rating, guest photos, and a host reply that can be edited for 24 hours (`features/reviews`). There are **no** AI summaries and no keyword search within reviews.
- **Host dashboard:** overview, bookings, experiences (photos, moments, map location), an availability calendar with weekdays, blackout dates, stop-sell and cutoff, earnings with payout statements, profile and reviews. There is **no** per-listing performance view, even though first-party funnel events (`page_view` and others) are recorded for admin analytics (`db/schema.ts:1651`).
- **Support and notifications:** a WhatsApp AI agent (`features/support-agent/tools.ts`) handles my bookings, booking detail, available dates, cancel, reschedule, refund bank details, host approvals, identity checks, tickets and escalation. It has **no** catalogue search and cannot create bookings. Email goes through Resend and WhatsApp through Twilio; guests get two reminder stages and a review invite after the experience.
- **Trust:** verified-host seal with KYC; `tourism_license` is a document type hosts can upload (required for companies, optional for individuals). There is **no** licence-number field on hosts or listings.
- **Marketing:** a referral mechanism exists (`features/marketing/referral.ts`) but stays inactive until `referral_reward_sar` is above 0.
- **Confirmed absent by grep:** BNPL (`tabby|tamara` returns 0), gift cards (only a prompt string matches), private or buy-out bookings, child pricing, tiered group pricing, waitlist, video on listings, loyalty, a host iCal feed, an MCP or agent endpoint, guest–host chat, and a meeting-point photo.

## What changed in the market (last 3–6 months)

### Global competitors
- **GetYourGuide (22 Apr 2026):** Spring release with AI review summaries above reviews, keyword search within reviews, personalised search suggestions, and meeting-point photos on the voucher [3][4]. The meeting-point photo works only for fixed meeting points, not pickups [10]. GetYourGuide also had a ChatGPT app live before March 2026 [3].
- **Airbnb (20 May 2026):** Summer Release expanded Experiences and Services and added AI features for discovery, planning and support [11]. Airbnb is recruiting social-media creators to host experiences; Chesky said creator-led experiences convert better than other categories [12]. Experiences supply grew roughly 80% year on year, but Experiences remain a small part of Airbnb's business [13].
- **Viator / Tripadvisor:** In February 2026 the Viator and Tripadvisor experiences businesses were merged into one reporting segment [14]. Viator also announced a distribution partnership with Booking.com [15].
- **Klook:** added sports and live-event hospitality packages in April 2026 [16] and launched the global "Get Your Travel Right" brand campaign in August 2026 [17].
- **Experiences inside ChatGPT:** GetYourGuide, Klook, Viator, Headout and others are reported to be live as ChatGPT apps built on MCP [18].
- **Headout:** no 2026 product news found.

### Saudi Arabia and the GCC
- **Tourism volume:** 2025 was a record year, with 123M visitors and SAR 304bn in spending [19]. In Q1 2026, domestic trips rose 16% to 28.9M while inbound visitors fell 13% (Cavendish Maxwell, a consultancy estimate rather than official data) [20].
- **Regulation:** four regulations were updated on 11 Sep 2026. Guides may now work across several regions and contract directly with tourists, but must disclose price, payment, cancellation and refund terms [1][2]. A single analysis site reports a 180-day transition period for guides and travel-service providers; this is unconfirmed [21].
- **Aseer:** the 2026 summer season targeted more than 3M visitors with 122 events and about 100 bookable experiences. The Aseer Region Development Authority launched an interactive map on Discover Aseer [22][23].
- **Riyadh Season 2026** opens 21 Oct and runs about 10 weeks [24]. This is the next big window for domestic leisure spending; Aseer can market itself as the cool-weather, nature alternative.
- **webook.com** launched an AI booking assistant on WhatsApp, Instagram and X [5] and a package-visa product under a Ministry of Tourism pilot (July 2026) [25].

### Trends
- **AI:** 80% of Saudi travellers are confident using AI to plan and book [6]. Only 12% of tour operators actively use generative AI, while over 50% of travellers use AI somewhere in planning [26].
- **Social discovery:** in Snapchat-commissioned research, 94% of Saudi consumers said they discover destinations on social platforms (vendor-sourced) [27].
- **Families and groups:** see [7][8]. Almosafer's January–July 2026 data shows domestic travel at 46% of bookings, up 13% [28].
- **Gifting:** an experience-gift trend exists, but no 2026 Saudi data was found, so this report makes no market claim about it.
- **BNPL:** Tabby is reported to hold SAMA consumer-finance licences and to have travel merchants such as Almosafer and flynas [29]. No 2026 data on BNPL for travel was found.

### Pain points on competitor platforms
- **Operators:** short-notice commission rises at GetYourGuide (20%→30%) [9]; last-minute cancellations under 24-hour terms cost operators money [30]; Airbnb removed low-booking experiences at short notice [31].
- **Guests:** cancellation and refund problems make up about 24% of negative travel-app reviews, and hidden fees about 19% (one review-analysis firm; method unpublished) [32]. Consumer sites report GetYourGuide tours cancelled without clear notice and refunds that were slow or never arrived [30].

## Recommendations

### Guest experience

**G1. One "before you pay" terms block, matching the new guide regulation**
- **What:** On the experience page sidebar and on `book/[reference]/pay`, show one bilingual block: total price (VAT-inclusive), what is included, payment method, the listing's cancellation tier with real dates calculated from the chosen slot ("free cancellation until Thu 15 Oct, 09:00"), the refund route (wallet or bank, manual), and the host's licence number.
- **Why now:** the 11 Sep 2026 tour-guiding rule requires clear disclosure of price, payment, cancellation and refund terms when guides contract directly [1][2]. Cancellations and hidden fees are the top two complaints about travel apps [32].
- **Who:** guest and admin (compliance).
- **Impact / effort:** High / S. The data already exists (`getCancellationTiers`, `startInstant` in `features/bookings/lib/cancellation*.ts`), so this is mostly presentation.
- **Saudi fit:** Arabic-first legal clarity; supports Ministry of Tourism compliance as the transition window runs.
- **Codebase:** `app/[locale]/(site)/experiences/[slug]/page.tsx`, `app/[locale]/(site)/book/[reference]/pay/`, `features/bookings/lib/cancellation-policy.ts`, `messages/{en,ar}.json`.

**G2. Meeting-point photo plus a "how to find us" note**
- **What:** Hosts upload one photo of the exact meeting spot and write a 200-character bilingual note ("park by the juniper gate; look for the green tent"). Show both on the confirmation page, in the reminder WhatsApp, and in the `.ics` description.
- **Why now:** GetYourGuide shipped meeting-point photos on vouchers in April 2026 [3][4][10].
- **Who:** guest and host (fewer "where are you?" calls and fewer no-shows).
- **Impact / effort:** Med-High / S. It reuses the existing photo-upload pipeline.
- **Saudi fit:** mountain trailheads in Aseer have weak addressing; a photo works for older and family guests who do not read maps.
- **Codebase:** `features/host-experiences/components/location-picker.tsx`, `experience-form.tsx`, `app/[locale]/(site)/book/confirmed/[ref]/page.tsx`, `features/bookings/lib/booking-ics.ts`, `lib/notifications/whatsapp/templates/guest.ts`, plus a new `experiences` column (run `pnpm db:generate`).

**G3. Private-group booking ("book the whole experience for my family")**
- **What:** An optional per-listing private price (a flat SAR amount for up to N people). The guest stepper offers "Join a group" or "Private for my family". A private booking closes the slot to other guests.
- **Why now:** family and group bookings grew 70% [7]; 46% of Saudi respondents find organising group trips very stressful [8].
- **Who:** guest and host (a higher basket per slot).
- **Impact / effort:** High / M. It touches slot capacity logic and pricing.
- **Saudi fit:** strong. Families often prefer not to share an activity with strangers; this complements the women-only category without fragmenting it.
- **Codebase:** `db/schema.ts` (experiences pricing fields and booking flag), `features/experiences/components/guest-stepper.tsx`, `features/bookings/` (capacity), `features/availability/`, `features/host-experiences/` form.

**G4. Child pricing**
- **What:** An optional child price (ages 3–11) next to `priceSar`, with the stepper split into adults and children.
- **Why now:** families are the growth segment [7], and Visa reports Saudi family travel at nearly double the regional average share [28].
- **Who:** guest.
- **Impact / effort:** Med / M.
- **Saudi fit:** high; large families are the norm.
- **Codebase:** `db/schema.ts`, `guest-stepper.tsx`, `features/bookings/lib/vat.ts` (totals), the invoice PDF.

**G5. Bilingual AI review summary (deferred until review volume exists)**
- **What:** Once a listing has 8 or more reviews, show a 2–3 line summary above the reviews in AR and EN, generated in a nightly job and cached.
- **Why now:** GetYourGuide's April 2026 release [3].
- **Impact / effort:** Med / M. Low value until reviews accumulate, so park it.
- **Codebase:** `features/reviews/queries.ts`, `features/reviews/components/reviews-section.tsx`.

### Host experience

**H1. Public rate card and payout promise on `/hosting`**
- **What:** State on `/hosting` the 15% commission, when payouts are sent after completion, that hosts set their own price, and a commitment to give at least 90 days' notice before any commission change.
- **Why now:** GetYourGuide's short-notice commission rise drove operators to reconsider the partnership [9]; Airbnb removed experiences at short notice [31].
- **Who:** host.
- **Impact / effort:** Med / S (copy only). The 90-day promise needs owner sign-off.
- **Saudi fit:** builds trust with small family-run hosts, who weigh fairness heavily.
- **Codebase:** `messages/{en,ar}.json` (`hosting.payout.*`), `app/[locale]/(site)/hosting/`.

**H2. Per-listing performance card in the host dashboard**
- **What:** For each experience, show views, booking requests, bookings and conversion over the last 30 days, built from the existing first-party funnel events. Add one suggestion line, such as "Guests view but don't book: add a meeting-point photo".
- **Why now:** Arival reports that only 12% of operators use AI or data tools actively, and acquisition costs are rising [26]. Hosts need feedback without leaving the platform.
- **Who:** host.
- **Impact / effort:** Med / S–M. The data is already collected (`db/schema.ts:1651`); this needs a query and a card.
- **Saudi fit:** neutral. All figures are aggregate, with no guest PII.
- **Codebase:** `features/host-dashboard/queries.ts`, `app/[locale]/host/(dashboard)/page.tsx`, `lib/funnel-tracking.ts`.

**H3. Licence number field and display**
- **What:** Add a `tourism_licence_number` field to hosts, required for companies. Admins verify it against the uploaded `tourism_license` document. Show it on the host profile and in the G1 block.
- **Why now:** licensing and exams were restructured in the September regulations [1][2].
- **Who:** guest, admin and host.
- **Impact / effort:** Med / S.
- **Codebase:** `db/schema.ts` (hosts), `features/host-applications/`, `app/[locale]/admin/host-applications/`, `app/[locale]/(site)/hosts/[slug]/`.

**H4. Host iCal export feed**
- **What:** A private per-host `webcal://` URL listing confirmed bookings, so hosts who also sell elsewhere see their Gharmish bookings in their phone calendar.
- **Why now:** operators spread sales across OTAs and direct channels [26][31].
- **Impact / effort:** Low-Med / S. `booking-ics.ts` already exists.
- **Codebase:** `features/bookings/lib/booking-ics.ts`, a new `app/api/host/calendar/[token]/route.ts`, `lib/booking-link-token.ts`.

### New features and trends to catch

**N1. Catalogue search for the WhatsApp agent**
- **What:** Add a read-only `search_experiences` tool (city, date, party size, category, women-only) that returns 3 cards with deep links to `/experiences/[slug]`. Booking stays on the web.
- **Why now:** webook launched AI booking through WhatsApp [5]; 80% of Saudi travellers are comfortable booking with AI [6].
- **Who:** guest.
- **Impact / effort:** High / M. It reuses `features/experiences/lib/search.ts`; the main work is prompt safety and Arabic phrasing.
- **Saudi fit:** WhatsApp is the default channel in KSA; this runs Arabic-first.
- **Codebase:** `features/support-agent/tools.ts`, `features/support-agent/prompt.ts`, `features/experiences/lib/search.ts`.

**N2. Short vertical video on listings**
- **What:** Allow one optional 15–30 second clip per listing. Show it on the card on hover or tap and in the gallery, and expose it in the TikTok catalogue feed.
- **Why now:** in Saudi Gen Z research, video is the most influential content type [27][33]; Airbnb is leaning on creators [12].
- **Impact / effort:** Med / M (storage, transcoding and performance budget).
- **Codebase:** `features/experiences/components/photo-gallery.tsx`, `experience-card.tsx`, `app/api/catalog/tiktok.csv/route.ts`, Supabase storage.

**N3. Read-only MCP / ChatGPT app endpoint (watch, do not build yet)**
- Competitors are live in ChatGPT [18], and `llms.txt` already covers basic AI discoverability. Revisit when monthly bookings justify the effort. Effort: L.

**N4. Tabby/Tamara**
- Evidence for travel-specific BNPL adoption is thin [29]. Ask HyperPay whether BNPL can be added as a payment brand, and revisit only if the average basket rises (for example, after G3 ships).

**N5. Gift an experience**
- **What:** Buy Gharmish Credit as a gift with a bilingual WhatsApp or email card (Eid, graduations).
- **Fit:** reuses the wallet. The evidence is generic rather than Saudi-specific, so this is **not** in the Top 5. Effort: M.

### Quick wins (< 1 week)
- **Q1.** Before-you-pay block (G1).
- **Q2.** Commission and payout copy on `/hosting` (H1).
- **Q3.** Meeting-point photo and note (G2).
- **Q4.** Turn on the existing referral reward: set `referral_reward_sar` (owner decision; the code already exists in `features/marketing/referral.ts`).
- **Q5.** A "Cool escape from the city" collection timed to Riyadh Season (opens 21 Oct) [24], using existing category and landing components (`category-landing.tsx`), with no new code paths.

## Top 5 for next sprint (impact ÷ effort)

1. **G1 – Before-you-pay terms block plus licence number** (High / S). Covers the regulatory disclosure and the top guest complaint.
2. **G2 – Meeting-point photo and directions note** (Med-High / S). Matches GetYourGuide's April 2026 feature and cuts no-shows.
3. **H1 – Public 15% rate card and payout promise on `/hosting`** (Med / S). Positions Gharmish against GetYourGuide's commission rise.
4. **H2 – Per-listing performance card for hosts** (Med / S–M). Built on funnel data Gharmish already collects.
5. **N1 – Catalogue search tool for the WhatsApp agent** (High / M). Matches webook's AI booking assistant on the channel Saudis use.

The next item in line is G3 (private-group booking): highest impact, but effort M.

## Sources
★ = claim verified from a search excerpt only (full pages could not be opened from this environment).

1. ★ Arab News, "Saudi tourism ministry updates four regulations", Sep 2026 — https://www.arabnews.com/saudi-arabia/saudi-tourism-ministry-updates-four-regulations-3001382
2. ★ Saudi Press Agency, "Tourism Ministry Updates Four Regulations…", Sep 2026 — https://www.spa.gov.sa/en/N2673881
3. ★ Skift, "GetYourGuide's AI Updates Target the Gap Between Planning and Booking", 22 Apr 2026 — https://skift.com/2026/04/22/getyourguide-ai-updates/
4. ★ GetYourGuide press release via OneNewsPage, 22 Apr 2026 — https://www.onenewspage.com/n/Press+Releases/1ztf28nkms/GetYourGuide-Launches-AI-Powered-Features-to-Help-Travelers.htm
5. ★ Zawya, "webook.com launches AI booking assistant across X, Instagram, WhatsApp and its app" — https://www.zawya.com/en/press-release/companies-news/webook.com-launches-ai-booking-assistant-across-x-instagram-whatsapp-and-its-app-423332
6. ★ MENA Startup Digest, "80% of Saudi Travelers Confident Using AI to Plan and Book Trips" (Skyscanner) — https://menastartupdigest.com/?p=51314
7. ★ Connecting Travel, "Almosafer report reveals domestic tourism trends in Saudi" (2024 report) — https://connectingtravel.com/news/almosafer-report-reveals-domestic-tourism-trends-in-saudi-ct
8. ★ Zawya, "Flexible travel shapes Saudi summer plans: Skyscanner" — https://www.zawya.com/en/business/travel-and-tourism/flexible-travel-shapes-saudi-summer-plans-skyscanner-semczfic
9. ★ Arival, "GetYourGuide Commission Increasing for Some Operators" (2025) — https://arival.travel/article/getyourguide-commission-increasing-for-some-operators
10. ★ GetYourGuide Supply blog, "Introducing meeting point pictures", Jan 2026 — https://www.getyourguide.supply/articles/introducing-meeting-point-pictures-show-travelers-exactly-where-to-meet-you
11. ★ Chekin, "Airbnb Summer Release 2026" — https://chekin.com/en/blog/airbnb-summer-release-2026/
12. ★ AltexSoft, "Airbnb Bets on Creators as Experiences Chase Repeat Demand" — https://www.altexsoft.com/travel-industry-news/airbnb-bets-on-creators-as-experiences-chase-repeat-demand/
13. ★ Arival, "Inside the Airbnb Experiences Relaunch" — https://arival.travel/?p=187663
14. ★ Tripadvisor IR memo, Feb 2026 — https://ir.tripadvisor.com/static-files/81a3a0b5-665e-415b-81c7-446a14b3b27d
15. ★ TravelDailyNews, "Viator and Booking.com announce new global partnership" — https://www.traveldailynews.com/regional-news/viator-and-booking-com-announce-new-global-partnership/
16. ★ Klook press release (sports and live events), 16 Apr 2026 — https://www.insidenova.com/online_features/press_releases/klook-expands-its-experiences-offering-to-include-sports-live-events-unveiling-a-blockbuster-line-up/article_f690b892-1702-526e-9206-7fad80dae186.html
17. ★ Medianews4u, "Klook launches global Get Your Travel Right campaign", Aug 2026 — https://www.medianews4u.com/klook-launches-global-get-your-travel-right-campaign-via-bbh-singapore/
18. ★ Alpic, "How AI reshapes the travel industry" — https://alpic.ai/blog/how-ai-reshape-the-travel-industry
19. ★ Amlak, "Saudi tourism hits record highs…" — https://amlak.net.sa/en/105802/
20. ★ Zawya, "Saudi tourism spend hits $22bln in Q1 2026" — https://www.zawya.com/en/economy/gcc/saudi-tourism-spend-hits-22bln-in-q1-2026-x5adqstt
21. ★ Vision2030.ai, "Saudi tourism regulation overhaul: four rules, September 2026" (single-source analysis) — https://vision2030.ai/analysis/saudi-tourism-regulation-overhaul-four-rules-september-2026/
22. ★ Connecting Travel, "Saudi Arabia aims to attract 3m visitors to Aseer in 2026" — https://connectingtravel.com/news/saudi-arabia-aims-to-attract-3m-visitors-to-aseer-in-2026
23. ★ TradeArabia, "Aseer introduces interactive map for tourism season" — https://www.tradearabia.com/News/463933/Aseer-introduces-interactive-map-for-tourism-season
24. ★ Gulf News, "Riyadh Season 2026 to begin on October 21" — https://gulfnews.com/world/gulf/saudi/riyadh-season-2026-to-begin-on-october-21-with-10-weeks-of-entertainment-1.500689955
25. ★ Zawya, "webook launches Saudi package visa service for seven countries" — https://www.zawya.com/en/business/webook-launches-saudi-package-visa-service-for-seven-countries-479699
26. ★ Xola (citing Arival research), "What we're seeing in tour and attraction operations trends" — https://www.xola.com/articles/what-were-seeing-in-tour-and-attraction-operations-trends/
27. ★ Connecting Travel, "94% of Saudi travellers discover destinations on social platforms" (Snapchat-commissioned) — https://connectingtravel.com/all-content/94-of-saudi-travellers-discover-destinations-on-social-platforms
28. ★ GDN Online, "Saudi travellers embrace domestic tourism and flexible travel: Almosafer" (2026); Visa KSA press release (2025) — https://www.gdnonline.com/Details/1405739/Saudi-travellers-embrace-domestic-tourism-and-flexible-travel-Almosafer · https://sa.review.visa.com/en_SA/about-visa/newsroom/press-releases/prl-02092025.html
29. ★ Gulf Business, Tabby profile 2026 — https://www.gulfbusiness.com/en/2026/lists/top-50-iconic-companies-in-mena-region/tabby/
30. ★ Sikayetvar, GetYourGuide complaints (consumer reports, unverified) — https://www.sikayetvar.com/en/getyourguide-us
31. ★ PhocusWire, "Airbnb removing dozens of experiences, canceling future reservations" — https://www.phocuswire.com/airbnb-removing-dozens-experiences-canceling-future-reservations
32. ★ Unstar, "Travel booking app reviews: biggest complaints 2026" — https://unstar.app/blog/travel-booking-app-reviews-biggest-complaints-2026
33. ★ Saudi Digital Library, "The Influence of Social Media on Travel Destination Choices Among Millennials and Generation Z in Saudi Arabia" — https://drepo.sdl.edu.sa/items/e563f79b-9141-4106-ba3b-d083b59ff4b5
