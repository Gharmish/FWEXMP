# Market research — 2026-10-22

> Third report in this series. It builds on [2026-10-12](./2026-10-12-market-research.md) (on `main`) and 2026-10-15 (on the unmerged branch `research/2026-10-15`). It does not repeat their ideas. One earlier recommendation (N6) comes back marked **Revisited** because new evidence turned up.
> Research ran through web-search excerpts only, because full pages could not be opened from this environment. Every source carries ★ for that reason. Check the original before quoting a figure externally.

## الملخص التنفيذي

- **السوق المحلي هو السوق:** تراجع القادمون من الخارج 13% في الربع الأول من 2026، بينما نمت الرحلات المحلية 16%، ويقول وزير السياحة إن السياحة الداخلية تمثل 60–65% من النشاط. على غارميش أن تبني للعائلة السعودية أولًا، وأن تؤجّل ما يخدم الزائر الأجنبي وحده.
- **رمضان 1448 يبدأ نحو 8 فبراير 2027:** نما عدد السياح المحليين في عطلة رمضان والعيد الماضية 14% إلى قرابة 10 ملايين. لكن لكل تجربة في غارميش وقت بدء واحد طوال العام. نوصي بإضافة «جدول رمضان» لكل تجربة (موعد بعد الإفطار أو بعد التراويح)، وأن يُنجَز قبل يناير.
- **الاسترداد البطيء ما زال أكبر شكوى:** صارت GetYourGuide تعيد المبالغ رصيدًا في المحفظة فورًا. أما في غارميش فقد استغرق آخر استردادين بنكيين يدويين 20 و41 يومًا. نوصي بخيار «استرداد فوري كرصيد غارميش» عند الإلغاء، يختاره الضيف بنفسه، مع بقاء خيار الاسترداد إلى البطاقة.
- **رسالة واحدة لكل ضيوف الموعد:** أطلقت GetYourGuide للمشغّلين المراسلة الجماعية مع إشعار القراءة. ومن أكثر ما يشتكي منه الضيوف على Viator مرشد لا يحضر وإلغاء يصلهم برسالة آلية بلا تفسير. نوصي بزر في لوحة المضيف يرسل تحديثًا عبر واتساب لكل ضيوف الموعد.
- **التقييمات الأولى:** تقول GetYourGuide إن احتمال حجز نشاط له ثلاثة تقييمات يبلغ ثلاثة أضعاف. نوصي ببرنامج «ضيوف مدعوون» يظهر شارة واضحة ولا يدخل في متوسط النجوم. ونعيد طرح التقدّم لمنصة العروض الموسمية التابعة للهيئة السعودية للسياحة.

## Executive summary

- **Domestic is the market.** In Q1 2026, inbound visitors fell 13% while domestic trips rose 16% [1][3]. The tourism minister puts domestic travel at 60–65% of the sector's business [2]. Build for the Saudi family first; defer foreign-visitor-only features.
- **Ramadan 1448 starts around 8 Feb 2027** [17][18]. Last Ramadan and Eid break, domestic tourists rose 14% to about 10M [4]. Every Gharmish listing has one `startTime` for the whole year. A per-listing Ramadan schedule (after iftar or after Taraweeh) must ship before hosts plan in January.
- **Slow refunds remain the top complaint.** GetYourGuide's fall release puts refunds straight into a wallet credit [6]. Gharmish's last two manual bank refunds took about 20 and 41 days (dev plan R6). Offer an opt-in "instant Gharmish Credit" refund at cancellation, keeping the card refund available.
- **One message to every guest on a date.** GetYourGuide gave operators group messaging with read receipts [6][7]. Viator reviews describe guides who never came and cancellations that arrived as an unexplained auto email [10][11]. Add a host action that sends one WhatsApp update to all guests on a slot.
- **First reviews unlock bookings.** GetYourGuide reports that travellers are three times more likely to book an activity with three reviews, and it now seeds new listings through labelled creator reviews [8][9]. Gharmish should run a labelled "invited guest" programme that stays out of the star average. N6 (Revisited): apply to the STA Seasonal Offers platform, which already covered Aseer in summer 2026 [21][22].

## Current state (re-verified 2026-10-22)

The inventories in the 2026-10-12 and 2026-10-15 reports still hold. Since 15 Oct, `main` received only two commits: an Apple Pay domain file refresh and a mobile checkout layout fix. Additional facts verified for this report:

- **Supply:** all 8 listings are still `live` with `availability_weekdays = '{}'` (`docs/ops/2026-10-12-relist-schedule-backup.md`). No `date_alert`, `waitlist` or `notify_me` code exists (grep returns 0).
- **Start time:** each listing has a single `startTime` (default `09:00`, `db/schema.ts:573`) and a `bookingCutoffHours` lead time. There is **no** seasonal or date-range override (`grep -i 'season|override' db/schema.ts` returns 0), and no Ramadan copy in `messages/*.json`.
- **Refund rails** (`features/bookings/lib/refund.ts`):
  - On guest cancellation, the card leg goes to the HyperPay gateway with a manual fallback that collects bank details (`features/bookings/lib/cancel-core.ts`). The wallet leg comes back as Gharmish Credit.
  - Guests have **no** option to take the card leg as instant credit.
  - The reverse path already exists: after an admin emergency cancel into credit, the guest can move the card-charged share back to the card (`features/wallet/refund-out-actions.ts`).
- **Host to guest communication:**
  - The host dashboard has bookings, a calendar, transitions and cancel (`features/host-bookings/components/`).
  - There is **no** way to message all guests on a slot (`grep -i 'broadcast|messageGuests|notifyGuests'` returns 0).
  - Inbound WhatsApp is recorded in `features/conversations/inbound.ts` for the support line. It is not a guest–host chat.
- **Reviews:**
  - One review per completed booking (`db/schema.ts:1064`).
  - The average is one aggregate over all visible reviews (`features/reviews/queries.ts:122`).
  - There is no review label or source field.
- **Categories:** `wellness`, `nature` and `family` already exist with landing pages (`db/schema.ts:85`, `features/experiences/components/category-landing.tsx`). No wellness collection is proposed below.
- **Host languages:** `hosts.languages` is stored (`db/schema.ts:399`) but not filterable. It stays unfiltered on purpose (see "Domestic first" below).

## What changed in the market (since 2026-10-15, or not covered before)

### Global competitors
- **GetYourGuide, Fall 2026 release (vendor source):**
  - a redesigned mobile ticket with larger QR codes, clearer meeting points and offline access;
  - map search by neighbourhood or hotel on all devices;
  - refunds that land in the traveller's Wallet as credit, ready to rebook;
  - stored-card checkout;
  - new local payment methods (KakaoPay, AliPay, DANA);
  - availability inside Gemini, ChatGPT and Claude [6].
  
  On the operator side, the release added AI listing checks and group messaging with read receipts [6][7]. The assistant-availability claim could not be corroborated by a second source.
- **GetYourGuide Creator Reviews (beta, Sep 2026):** for new listings, an invited creator takes the activity like a normal traveller and reviews it.
  - The operator covers the cost of one booking (up to 2 spots).
  - Reviews publish within 48 hours, labelled "Travel Partner Tested".
  - GetYourGuide says travellers are three times more likely to book an activity that has three reviews [8][9].
- **Airbnb, Viator, Klook, Headout:** no new product announcement since 15 Oct was found. The searches returned only items already covered in the earlier reports.

### Saudi Arabia and the GCC
- **Demand mix:**
  - Q1 2026 had 28.9M domestic tourists (+16%) and 8.3M inbound (−13%) [1][3][25].
  - Per tourist, domestic visitors spent about SAR 1.2k in the quarter against about SAR 5.8k for international visitors [3].
  - The minister said domestic travel is 60–65% of the business, and that Ramadan and Hajj results cushioned the regional conflict [2].
  - In March, agencies reported Eid trips being changed or cancelled after the 28 Feb escalation [5].
- **Ramadan and Eid are a domestic peak.** During the 2026 Ramadan and Eid school break, about 10M domestic tourists travelled (+14%) and spent SAR 10.2bn (+5%) [4]. Wego reported 49% of Ramadan 2026 travellers booking more than a month ahead [19].
  - Ramadan 1448 is expected to start on Mon 8 Feb 2027, with Eid al-Fitr around 9–10 Mar, subject to moon sighting [17][18].
- **School mid-year break:** expected to start around 7–8 Jan 2027 (secondary calendar sources; check the Ministry of Education closer to the date) [20].
- **STA "Seasonal Offers" platform:** launched for Summer 2026 ("Unlock More") at VisitSaudi.com/SeasonalOffers.
  - It has 50+ private-sector partners, with offers in Riyadh, Jeddah, **Aseer**, Taif, Al-Baha and the Red Sea.
  - Hospitality, travel, transport and retail businesses can list products [21][22].
- **Riyadh Season 2026** opened 21 Oct with a 10-week programme [23][26].
- **Licensing enforcement:** since Oct 2025, operating without a tourism licence costs up to SAR 250k in major destinations [24]. This raises the stakes on the licence-number work (G1 + H3) already in the plan.
- **Wellness:** Saudi Arabia targets a SAR 26bn wellness-tourism market by 2030 [27].

### Trends
- **Hilton 2027 Trends (Saudi edition):** the four Saudi trends are "Wellness Rewired", "Micro-Travel Mindset", "Travel Trust Equation" and "The Rise of 'Ish" [14].
  - 79% say fresh air and the outdoors are essential to how they relax.
  - 65% seek experiences that calm the body.
  - Saudi travellers are among the most likely to call a 5–6-day trip "short" [14][15][16].
- **WhatsApp cost:** Meta's 1 Apr 2026 price change raised the Saudi marketing-message rate by about 10% (to about $0.05 per message) and added SAR billing [12][13]. Utility messages tied to a booking are not part of that rise.
- **BNPL and gifting:** no new 2026 evidence specific to Saudi experiences was found. The earlier "watch" positions stand.

### Pain points (new evidence)
- **Guides who never come, and unexplained cancellations:**
  - Viator reviews (including May 2026) describe a guide or pickup that never arrived and no refund despite proof [10][11].
  - Others describe a tour cancelled by an auto email with no reason [11].
  - Viator and the operator each told the guest the refund was the other's job [11].
- **Refund delays:** the same Viator threads [10][11]. Gharmish has its own evidence: about 20 and 41 days for its two manual bank refunds (dev plan R6).

## Recommendations

### Guest experience

**G8. "Instant Gharmish Credit" refund choice at cancellation**
- **What:** When a refund is due, the guest cancel screen offers two options:
  - "Refund to my card": today's path. The gateway refund runs first, with the manual bank fallback.
  - "Take it now as Gharmish Credit": credited immediately, usable on any booking.
  
  The guest must pick one; there is no default. Choosing credit skips the bank-details form. Because `refund-out-actions.ts` exists, the guest can still move the card-charged share back to the card later, so the choice is reversible.
- **Why now:**
  - GetYourGuide's fall release made wallet-credit refunds a headline feature [6].
  - Refund delays dominate competitor complaints [10][11].
  - Gharmish's manual bank refunds took about 20 and 41 days (dev plan R6).
  - This is **not** the rejected "automated refunds" item: card refunds stay as they are, and the credit is an internal ledger entry, as the admin emergency-cancel path already does.
- **Who:** guest (money back in seconds), admin (fewer manual bank transfers), host (credit tends to rebook).
- **Impact / effort:** High / S–M. It needs a `wallet_only` rail beside `auto` and `card_only` in `refund.ts`, plus one radio group in the cancel form.
- **Saudi fit:** credit stays non-withdrawable except back to the original card (SAMA posture as documented in `refund-out-actions.ts`). Arabic-first copy must say clearly that the card refund remains available.
- **Codebase:**
  - `features/bookings/lib/refund.ts` (new rail)
  - `features/bookings/lib/cancel-core.ts` (skip the bank-details requirement when credit is chosen)
  - `features/wallet/reservation.ts` (`creditWalletRefund`)
  - `features/bookings/components/cancel-booking-button.tsx` (the guest cancel form)
  - `messages/{en,ar}.json`
- **Owner decision needed:** whether to add a small bonus (for example +5%) for choosing credit. Without one, the choice should be shown neutrally.

**G9. Ramadan schedule per listing**
- **What:** Hosts can set an alternate `startTime` (and optionally weekdays) that applies only between two dates. The host form pre-fills Ramadan 1448 (about 8 Feb to 9 Mar 2027) with suggested slots after iftar or after Taraweeh. The detail page shows "Ramadan timing" when the chosen date falls inside the range. Pair it with a "Ramadan nights in Aseer" collection on `/experiences`.
- **Why now:**
  - Last Ramadan and Eid break brought about 10M domestic tourists (+14%) [4].
  - 49% of Ramadan travellers booked more than a month ahead [19], so listings need Ramadan times by early January.
  - Ramadan is expected to start on 8 Feb 2027 [17][18].
  - Today a 09:00 juniper walk or a midday saleeg lunch would simply stop selling for a month.
- **Who:** host (keeps selling through Ramadan), guest (bookable evening family plans).
- **Impact / effort:** Med-High / M. Touches availability, the cutoff calculation, `.ics` times and reminder scheduling, which all read `startTime`.
- **Saudi fit:** central. Food experiences become iftar or suhoor experiences, and evenings are family time.
- **Codebase:**
  - `db/schema.ts` (experiences: `seasonalStartTime`, `seasonFrom`, `seasonTo`; then `pnpm db:generate`)
  - `features/availability/queries.ts`, `features/availability/types.ts`
  - `features/host-experiences/actions.ts` and form
  - `features/bookings/lib/booking-ics.ts`
  - reminder scheduling in `lib/notifications/`
  - `messages/{en,ar}.json`

### Host experience

**H6. "Message everyone on this date"**
- **What:** On `/host/bookings`, a host picks a date and sends one update to every confirmed guest on it. There are three fixed WhatsApp utility templates, each with one short free-text field:
  - "Meeting point changed", which reuses G2's note and photo if shipped;
  - "Running late by N minutes";
  - "Weather update", which links to H5's move flow if shipped.
  
  Each send is logged on each booking for dispute evidence and shows delivered or read status from Twilio callbacks.
- **Why now:**
  - GetYourGuide shipped operator group messaging with read receipts [6][7].
  - The commonest Viator complaints are a guide or pickup that never arrived and unexplained cancellation emails [10][11].
  - Booking-tied utility templates avoid the higher Saudi marketing rate [12].
- **Who:** host (one tap instead of N calls), guest, admin (a written trail when a dispute comes in).
- **Impact / effort:** Med-High / M. Template approval goes through `pnpm whatsapp:templates`, plus a delivery-status read.
- **Saudi fit:** WhatsApp is the default channel. Templates are written in Arabic first, and no guest phone number is shown to the host (Gharmish sends the message).
- **Codebase:**
  - `features/host-bookings/actions.ts` and `components/`
  - `app/[locale]/host/(dashboard)/bookings/page.tsx`
  - `lib/notifications/whatsapp/templates/guest.ts`
  - `lib/notifications/dispatch.ts`
  - `scripts/whatsapp-templates.ts`

**H7. Labelled "invited guest" visits to seed first reviews**
- **What:** For a listing with fewer than 3 reviews, the admin can issue up to 2 single-use promo codes that the host funds (at cost), for local invited guests.
  - Reviews from those bookings carry a visible label: "Invited guest: discounted visit".
  - They are **excluded from the star average** until the listing has 3 organic reviews.
  - The `/trust-and-safety` review policy (2026-10-15 Q10) gains one sentence disclosing the programme.
- **Why now:**
  - GetYourGuide Creator Reviews targets exactly this cold-start problem, citing the three-times booking lift [8][9].
  - All 8 Gharmish listings were relisted with few reviews (the dev plan notes that hiding one 2★ review moved the public average from 4.00 to 4.67).
  - Labelling keeps this on the right side of the fake-review enforcement cited in the 2026-10-15 report.
- **Who:** host (first bookings), guest (honest early signal).
- **Impact / effort:** Med / M.
- **Saudi fit:** works well with women-only and family listings, where a trusted first-hand account matters most.
- **Codebase:**
  - `db/schema.ts` (reviews: `source` enum `organic|invited`; bookings: link to the promo)
  - `features/promo-codes/`
  - `features/reviews/queries.ts:122` (filter in the aggregate)
  - `features/reviews/components/` (label)
  - `app/[locale]/(site)/trust-and-safety/`
- **Owner decision needed:** host-funded or Gharmish-funded visits.

### New features and trends to catch

**N6 (Revisited). Apply to the STA Seasonal Offers platform as well as flynas and Saudi Winter**
- **What changed:** the 2026-10-15 report named flynas "Saudi Experiences" and the Saudi Winter programme. New evidence:
  - the STA's own Seasonal Offers platform (VisitSaudi.com/SeasonalOffers) ran in Summer 2026 with 50+ private partners;
  - it covered **Aseer**;
  - it accepts travel and retail businesses' products and promotions [21][22].
  
  The winter edition is the next window.
- **Action:** an owner task with no code. Submit a winter offer, such as a family bundle or a promo code tied to the existing `features/promo-codes/`. No feed is needed unless the STA asks for one.
- **Impact / effort:** High / S.

**Domestic first: a filter on what not to build yet**
- Domestic is 60–65% of the business and inbound is falling [1][2][3]. Keep parked:
  - a host-language filter (`hosts.languages` exists);
  - foreign-payment methods;
  - English-first discovery work.
- Revisit when inbound recovers in Ministry data.

### Quick wins (< 1 week)
- **Q14. Open dates for the school mid-year break.** This is an owner and host task with no code. Restore weekdays for at least the family and nature listings over the break starting around 7–8 Jan 2027 [20] (`docs/ops/2026-10-12-relist-schedule-backup.md` has the original weekdays). Start with the wellness and nature listings, given Hilton's outdoor and wellness findings [14][15].
- **Q15. N6 (Revisited) Seasonal Offers application** (owner).
- **Q16. Minimum G8:** add the credit option only for fully wallet-paid or small (for example under SAR 300) refunds first, then widen.
- **Q17. Ramadan heads-up to hosts:** send one WhatsApp or email to hosts now, asking for their Ramadan timing preference. It feeds G9's defaults and shows demand before any build.

## Top 5 for next sprint (impact ÷ effort)

1. **G8 – Instant Gharmish Credit refund choice** (High / S–M). Removes the 20–41-day refund wait for guests who opt in, using existing wallet rails.
2. **N6 (Revisited) – Apply to the STA Seasonal Offers platform for winter** (High / S, owner-led). A state channel that already covered Aseer.
3. **G9 – Ramadan schedule per listing** (Med-High / M). Must ship before January for Ramadan starting around 8 Feb 2027.
4. **H6 – "Message everyone on this date" via WhatsApp** (Med-High / M). Fixes the "nobody showed up or told us" failure seen on Viator.
5. **H7 – Labelled invited-guest reviews** (Med / M). Solves the cold start of 8 relisted listings, with disclosure.

Next in line: G6 (date alerts, 2026-10-15) remains the precondition for most of this. With zero open dates, Q14 is the cheapest single action this week.

## Sources
★ = claim verified from a search excerpt only (full pages could not be opened from this environment).

1. ★ Saudi Press Agency, "Tourism Ministry: Domestic Tourism Grows 16% in Q1 2026" — https://www.spa.gov.sa/en/N2555693
2. ★ Arab News, "Strong Ramadan and Hajj results eased impact of Iran war, Saudi tourism minister says" — https://www.arabnews.com/node/2647758
3. ★ EnterpriseAM, "Domestic demand props up Saudi tourism headcount as war dents high-spending foreign arrivals", 21 Sep 2026 — https://enterpriseam.com/ksa/2026/09/21/domestic-demand-props-up-saudi-tourism-headcount-as-war-dents-high-spending-foreign-arrivals/
4. ★ TradeArabia, "Saudi domestic tourism grows 16pc in Q1 2026" (Ramadan and Eid figures) — https://tradearabia.com/News/413894/Saudi-domestic-tourism-grows-16pc-in-Q1-2026
5. ★ Sabq, التوترات العسكرية تربك خطط السعوديين لإجازة العيد, Mar 2026 — https://sabq.org/article/T12ajdD
6. ★ GetYourGuide press, "Fall release 2026" (vendor source; AI-assistant availability not corroborated) — https://www.getyourguide.press/blog/fallrelease2026
7. ★ Yahoo Finance / GlobeNewswire, "GetYourGuide Unveils New Tools to Help Tour and Attraction Operators…", 15 Sep 2026 — https://finance.yahoo.com/small-business/articles/getyourguide-unveils-tools-help-tour-110000758.html
8. ★ Skift, "GetYourGuide Taps Creators to Write Reviews for Tour Operators", 15 Sep 2026 — https://skift.com/2026/09/15/getyourguide-creator-reviews-new-listings/
9. ★ GetYourGuide Supply, "Make a great first impression with Creator Reviews" — https://getyourguide.supply/growth-hub/creator-reviews
10. ★ Trustpilot, Viator reviews (consumer reports, self-selected) — https://ie.trustpilot.com/review/www.viator.com?page=7
11. ★ Reviews.io, Viator reviews (consumer reports, self-selected) — https://www.reviews.io/company-reviews/store/viator/9w
12. ★ YCloud, "WhatsApp API message pricing update effective April 1, 2026" — https://www.ycloud.com/blog/whatsapp-api-message-pricing-update-effective-april-1-2026
13. ★ Wetarseel, "WhatsApp pricing changes from 1st April 2026" — https://wetarseel.ai/whatsapp-api-pricing-all-you-need-to-know-in-2025/
14. ★ Hilton Stories, 2027 Trends Report, Saudi release — https://stories.hilton.com/emea/releases/2027-trends-release-sa-en
15. ★ Hilton, 2027 Trends Report fact sheet (Sep 2026) — https://stories.hilton.com/uploads/2026/09/Hiltons-2027-Trends-Report-Main-Fact-Sheet.pdf
16. ★ Euronews, "The rise of micro-travel and other trends set to hit the big time in 2027", 1 Oct 2026 — https://www.euronews.com/2026/10/01/the-rise-of-micro-travel-and-other-trends-set-to-hit-the-big-time-in-2027-according-to-hil
17. ★ Gulf News, "When is Ramadan 2027? The expected date, moon sighting and Eid explained" — https://gulfnews.com/uae/ramadan/when-is-ramadan-2027-the-expected-date-moon-sighting-and-eid-explained-1.500630523
18. ★ The National, "Ramadan 2027 dates and Eid Al Fitr holiday", 6 Oct 2026 — https://www.thenationalnews.com/news/uae/2026/10/06/ramadan-2027-uae-dates-eid-al-fitr-holiday/
19. ★ Zawya, "Ramadan accommodation searches rise 20.67% in Makkah, 25.16% in Madinah: Wego" — https://www.zawya.com/en/business/travel-and-tourism/ramadan-accommodation-searches-rise-2067-in-makkah-2516-in-madinah-wego-agqy53pe
20. ★ Mdares, Saudi Academic Calendar 1448 H (aggregator); King Abdulaziz University academic calendar — https://mdares.ai/sa-en/calendar · https://kau.edu.sa/en/academic-calendar
21. ★ GCC Business News, "'Unlock More': STA unveils Saudi Summer 2026 tourism offers platform" — https://www.gccbusinessnews.com/sta-saudi-summer-2026-offers-platform/
22. ★ TradeArabia, "Saudi Arabia expands summer tourism with new 'Unlock More' platform", 28 Jun 2026 — https://tradearabia.com/News/464153/Saudi-Arabia-expands-summer-tourism-with-new-%E2%80%98Unlock-More%E2%80%99-platform
23. ★ TradeArabia, "Riyadh Season 2026 to open on October 21" — https://www.tradearabia.com/News/486894/Riyadh-Season-2026-to-open-on-October-21
24. ★ Gulf Business, "Saudi tightens tourism rules, fines soar to SAR250,000" (2025) — https://gulfbusiness.com/en/2025/saudi-arabia/saudi-tightens-tourism-rule-fines-soar-sar250000/
25. ★ Gulf Business, "Saudi tourist spending hits SAR82.7bn in Q1 as domestic travel offsets fall in foreign arrivals" — https://gulfbusiness.com/en/2026/tourism/saudi-tourist-spending-hits-sar82-7bn-in-q1-as-domestic-travel-offsets-fall-in-foreign-arrivals/
26. ★ Arab News Pakistan, "The countdown is on: Riyadh Season 2026 is almost here" — https://www.arabnews.pk/saudi-arabia/the-countdown-is-on-riyadh-season-2026-is-almost-here-3002486
27. ★ Hospitality News, "ENVI Lodges accelerates Saudi expansion" (wellness-tourism SAR 26bn by 2030 target) — https://www.hospitalitynewsmag.com/envi-lodges-accelerates-saudi-expansion/
