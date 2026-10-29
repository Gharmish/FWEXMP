# Market research — 2026-10-29

> Fourth report in this series. It builds on [2026-10-12](./2026-10-12-market-research.md) (on `main`) and on the unmerged branches `research/2026-10-15` and `research/2026-10-22`. It repeats none of their recommendations (G1–G9, H1–H7, N1–N7, Q1–Q17). New IDs start at G10, H8, N8 and Q18.
> Research ran through web-search excerpts only, because full pages could not be opened from this environment. Every source therefore carries ★. Check the original before quoting a figure externally.

## الملخص التنفيذي

- **حماية البيانات الشخصية دخلت مرحلة التطبيق الفعلي:** أعلنت سدايا عن 48 قرارًا تنفيذيًا، والغرامة قد تصل إلى 5 ملايين ريال للمخالفة الواحدة. والمطلوب إبلاغ سدايا بأي تسرّب خلال 72 ساعة. وما زالت مراجعة غارميش القانونية (أغسطس 2026) تذكر بندين مفتوحين: لا إجراء مكتوبًا للإبلاغ عن التسرّب، ولا طريقة لحذف الحساب أو تصدير البيانات. نوصي بكتابة إجراء الإبلاغ هذا الأسبوع، ثم بناء الحذف والتصدير ذاتيًا من صفحة «حسابي».
- **أنظمة السياحة المحدَّثة (سبتمبر 2026):** صار بإمكان المرشد التعاقد مع السائح مباشرة والعمل في أكثر من منطقة، والمهلة نحو 180 يومًا. هذا يسهّل التوسع خارج عسير، لكنه يرفع خطر أن يأخذ المضيف ضيوفه خارج المنصة. نوصي برابط حجز خاص بالمضيف بعمولة أقل للضيوف الذين يجلبهم بنفسه، وبحسم سؤال ترخيص المنصة نفسها مع الوزارة.
- **المنافسون العالميون هادئون:** سحبت Klook طرحها العام في 16 أكتوبر، وتتجه webook إلى السفر وأوروبا. لا يوجد إطلاق منتج جديد يستحق النسخ هذا الأسبوع.
- **«من سيحضر معي؟»:** تقول Airbnb إن 7 من كل 10 يريدون معرفة المزيد عن بقية المشاركين قبل الحجز. نقترح نسخة تناسب الخصوصية السعودية: مؤشر مجمّع على صفحة التجربة مثل «عائلتان محجوزتان في هذا الموعد»، بلا أسماء ولا صور.
- **Google «أشياء للقيام بها»:** قناة مجانية، وأكثر من نصف المشغّلين الصغار لم يفعّلوها. المطلوب أن يتحقق المالك من إتاحتها في السعودية، ولا يلزم بناء كود.

## Executive summary

- **PDPL enforcement is live; two gaps are still open.**
  - SDAIA has issued 48 enforcement decisions. Fines reach SAR 5M per violation and double for repeat offences, and a breach must be notified within 72 hours [1][2][3].
  - Gharmish's own legal audit (`docs/legal/legal-audit-2026-08-02.md`, A4) still lists **no breach-notification procedure** and **no deletion or export path**. A grep for deletion or export code returns 0.
  - Write the runbook this week, then build self-serve deletion and export.
- **The September 2026 tourism-rules overhaul cuts both ways.**
  - Guides may now work across regions and contract **directly with tourists**, with about 180 days to adjust [4][5][6].
  - That makes expansion beyond Aseer easier, but it also makes it easier for hosts to take guests off the platform.
  - Answer it with a host-sourced booking link at a lower commission, and close the open question of the platform's own MoT licence (legal audit A3).
- **Global competitors are quiet on product.**
  - Klook withdrew its US IPO on 16 Oct [11][12].
  - GetYourGuide reports H1 2026 GMV up 27% [24].
  - webook is moving into travel services and Europe [13][14].
  - No new feature launch was found that Gharmish should copy this week.
- **Show families who else is on the date, without exposing anyone.** Airbnb's "Who's going" is built on the finding that more than 7 in 10 people want to know about co-guests before booking [9][10]. The Saudi version is an aggregate, opt-in signal on the date picker, for example "2 families booked" or "women's group", with no names or photos.
- **Check Google "Things to do" (free).** It shows free booking links on Search and Maps, and more than half of small operators have never activated it [17][18]. Saudi availability is unconfirmed. This is an owner check, and the listing pages already emit JSON-LD.

## Current state (re-verified 2026-10-29)

The inventories in the 2026-10-12, 10-15 and 10-22 reports still hold. **`main` has no new commits since the 2026-10-22 report** (HEAD `4329f91`). Facts verified for this report:

- **Privacy and PDPL:**
  - Marketing consent exists. `guests.marketingConsentAt` is set by an unticked checkbox (`features/bookings/schemas.ts:110`, `features/bookings/lib/request/guest.ts:65`).
  - Lifecycle email and WhatsApp marketing check consent and suppression (`features/marketing/lifecycle-email.ts:61`, `lib/notifications/dispatch.ts:77,125`).
  - KYC retention is handled (`features/maintenance/passes/retention.ts:108`).
  - **Open:** no account deletion or data export (`grep -rniE 'deleteAccount|exportMyData|data-export|erasure' app features` returns 0).
  - **Open:** no breach-notification procedure (legal audit A4, line 54).
  - **Open:** foreign-FK `onDelete:'restrict'` blocks erasure (A4).
  - The guest account area is `app/[locale]/(site)/me/` (`page.tsx`, `profile/`) and `features/account/`.
- **Platform licence:** legal audit A3 ("Gharmish's own MoT licence … counsel to confirm with MoT") is still unanswered in the repo.
- **Commission:** stored per experience as `experiences.commissionBps` (default 1500, `db/schema.ts:594`). A booking already records `utmSource/utmMedium/utmCampaign` (`db/schema.ts:814`).
- **Host sharing:** a host share card (WhatsApp plus native share) exists (`features/hosts/components/host-share-card.tsx`). It does not tag the booking as host-sourced.
- **Party data:** a booking stores only `partySize` (`db/schema.ts:657`). There is no party type (family, women's group). `women_only` is a category, not a booking attribute (`db/schema.ts:93`, attestation at `:1018`).
- **Discovery plumbing:**
  - JSON-LD sits on the home, catalogue, listing, Abha and host pages (`components/seo/json-ld.tsx`; `app/[locale]/(site)/experiences/[slug]/page.tsx:585`).
  - Related experiences appear on the listing and confirmation pages (`features/experiences/components/related-experiences.tsx`).
  - The TikTok catalogue feed exists (`app/api/catalog/tiktok.csv/route.ts`).
  - The Snap pixel is already wired behind consent (`components/layout/marketing-pixels.tsx`), so no Snap recommendation is made despite new Snapchat data [20][21].

## What changed in the market (since 2026-10-22, or not covered before)

### Global competitors
- **Klook** withdrew its planned US IPO (filed Nov 2025, $300–500M raise) on 16 Oct 2026, citing market conditions, and said its bookings are on track [11][12].
- **GetYourGuide:** an executive post reports 18M+ experiences booked in H1 2026, with GMV up 27% year on year [24]. This is a single, self-reported source.
- **webook** (a Saudi company): an Oct 2026 interview describes its expansion from tickets into flights, hotels and visas, and towards Europe [13]. Separately, it took a majority stake in a Lisbon firm (Smartmove) as its European launch pad [14].
- **Airbnb:** no new Experiences launch was found since the last report. The October 2025 social release ("Who's going", guest-to-guest messages, per-experience privacy toggle) is the most recent, and Airbnb cited a survey in which more than 7 in 10 want to know about co-guests before booking [9][10].
- **Viator, Headout:** no new product found.

### Saudi Arabia and the GCC
- **Four tourism regulations updated** (tour guiding, travel and tourism services, hospitality facilities, private hospitality units) [4][5]. For guides:
  - fewer classification categories;
  - work allowed across several regions and disciplines;
  - licensing exams regulated;
  - **direct booking arrangements and contracts with tourists permitted** [4][5].
  
  One analysis says the rules were published in Umm Al-Qura on 11 Sep 2026, with about 180 days for providers and guides to adjust [6].
- **Travel-services guarantees:** a 25 Sep ministerial decision is reported to set financial guarantees for travel-services licences at SAR 50k (standard) and SAR 800k (with visa arranging) [5][6]. The ministry's own service directory maps SAR 50k to *Tour Operations* and SAR 800k to *General Travel & Tourism Services* [7]. **The sources conflict.** Counsel should read the gazette text.
- **Enforcement precedent:** 10 Riyadh travel offices were closed for violations in 2025. Fines reach SAR 50k, rising to SAR 1M for repeat offences [8].
- **PDPL:** enforcement has moved past guidance.
  - Clyde & Co reports 48 decisions announced by mid-January 2026 [1].
  - Latham dates the 48 to "early 2026" [2].
  - Reported violations include marketing messages sent without consent and missing safeguards [2].
  - A breach must be notified to SDAIA via the National Data Governance Portal within 72 hours [2][3].
- **Aseer:** the 2026 target is 3M+ visitors with 100+ events and experiences [25]. No 2026–27 Aseer winter programme announcement was found (Arabic and English searches).

### Trends
- **Skyscanner Travel Trends 2027 (Saudi cut):**
  - 89% of Saudi travellers plan to holiday abroad as much as or more than in 2026;
  - 50% expect to spend more on flights;
  - 12% of Saudi Gen Z plan to "disconnect as much as possible";
  - the global themes include fitness trips and intimate local music venues [15][16].
- **Social discovery:**
  - In Snapchat-commissioned research, 94% of Saudi consumers discover destinations on social platforms, 90% say family and friends shape decisions, and 80%+ of young Saudis are open to AI trip planning [20].
  - Snapchat reports 26M+ monthly users in the Kingdom [21].
  - Both sources are vendor research.
- **BNPL:** Tabby's SAMA finance licences (Jun 2026) enable longer plans above SAR 2,000, with flynas and Almosafer among travel merchants [19]. This is not new against N4 and N7, so no change to those positions.
- **Google "Things to do":**
  - Free product listings with links to the operator's site and OTAs [17].
  - An "official site" badge for claimed Business Profiles [17].
  - The price shown must match the booking system [18].
  - An Arival survey of 7,000+ operators found more than half of small and medium operators unaware or inactive [17].
  - No source confirms coverage in Saudi Arabia.

### Pain points (new evidence)
- **Unreachable operator, platform deflects:** a May 2026 Viator review describes a full day of failed attempts to reach an operator, with the platform asking for details by DM [22].
- **Refunds:** 2026 complaints on GetYourGuide describe completed cancellations with refunds not received, and a BNPL provider refunding only after escalation [23]. This corroborates the refund theme behind G8 (2026-10-22). No new recommendation.
- **Host payouts:** no 2026 evidence of payout delays on competitor platforms was found. The only supplier complaint located is from Nov 2024 [23].

## Recommendations

### Guest experience

**G10. "Who's on this date": an aggregate, privacy-safe group signal**
- **What:**
  - At checkout, the guest may optionally tag the booking as *Family*, *Women's group*, *Friends* or *Couple*.
  - The listing's date picker then shows aggregates only, for example "2 families booked" or "Women's group booked".
  - It never shows names, photos or a home city.
  - It is hidden for private bookings and when only one booking exists, so no single party is identifiable.
- **Why now:** Airbnb built "Who's going" on a survey in which more than 7 in 10 want to know about co-guests before booking [9][10]. It shows profiles and home countries, which does not suit Saudi privacy norms. An aggregate signal answers the real question ("will my family be comfortable in this group?") without exposing anyone. In Saudi research, 90% say family and friends shape travel decisions [20].
- **Who:** guest (confidence to book mixed-group slots), host (fewer pre-booking WhatsApp questions).
- **Impact / effort:** Med / M. It needs one nullable enum on bookings, an aggregate in the availability query and one checkout radio.
- **Saudi fit:** strong for family and privacy norms. Opt-in, aggregate-only, Arabic-first labels.
- **Codebase:**
  - `db/schema.ts` (bookings: `partyType` enum, nullable; then `pnpm db:generate`)
  - `features/bookings/schemas.ts`
  - `features/bookings/components/booking-request-form.tsx`
  - `features/availability/queries.ts` and `types.ts` (per-date counts)
  - `features/bookings/components/booking-calendar.tsx`
  - `messages/{en,ar}.json`

**G11. Self-serve "Delete my account" and "Download my data" on `/me`**
- **What:**
  - Two actions on `app/[locale]/(site)/me/profile`, each confirmed by OTP.
  - **Download** emails a JSON or ZIP of profile, bookings, reviews and wallet ledger.
  - **Delete** anonymises the guest row (name, phone and email hashed or nulled) instead of a hard delete. This keeps booking, invoice and VAT rows intact, which also resolves the `onDelete:'restrict'` FK blocker.
  - It is refused while a future booking or open dispute exists.
  - The admin sees a log entry.
- **Why now:** PDPL enforcement is active, with 48 decisions and fines up to SAR 5M [1][2][3]. The privacy page already promises these rights, and legal audit A4 lists them as unimplemented.
- **Who:** guest, admin (no manual handling of requests).
- **Impact / effort:** High (regulatory risk) / M.
- **Saudi fit:** PDPL is a Saudi law. Arabic-first copy must explain what is kept for tax law (invoices) and why.
- **Codebase:**
  - `app/[locale]/(site)/me/profile/page.tsx`
  - `features/account/` (new `actions.ts` and `types.ts`)
  - `db/schema.ts` (guests: `anonymisedAt`)
  - `features/wallet/` (ledger export)
  - `features/maintenance/passes/retention.ts` (reuse the anonymisation helpers)
  - `app/[locale]/(site)/privacy/page.tsx`
  - `messages/{en,ar}.json`

### Host experience

**H8. Host-sourced booking link at a lower commission**
- **What:**
  - Each host gets a personal link (`/hosts/<slug>?via=host`) from the existing share card.
  - Bookings arriving through it are stamped `source = host` and charged a lower commission, for example 10% instead of 15%. The host dashboard shows the count of host-sourced bookings.
  - The guest still gets Gharmish payment, reminders, credit and dispute protection.
- **Why now:** the Sept 2026 guide rules explicitly allow guides to contract **directly** with tourists [4][5]. A host who brings their own audience now has a legal reason to collect payment off-platform. A cheaper on-platform route keeps those bookings and their trust data (reviews, KYC) inside Gharmish.
- **Who:** host (keeps more of the income from guests they bring), admin (retention, fewer off-platform disputes).
- **Impact / effort:** Med-High / M. The commission is already a per-row integer (`commissionBps`), and UTM capture already exists on bookings.
- **Saudi fit:** hosts market through personal WhatsApp and Snapchat. This rewards that habit instead of fighting it.
- **Codebase:**
  - `features/hosts/components/host-share-card.tsx`
  - `features/analytics/utm-capture.tsx`
  - `db/schema.ts` (bookings: `source` or reuse `utmSource`; commission snapshot at `:662`)
  - `features/payments/settle.ts` (commission applied)
  - `features/host-earnings/`
  - `features/host-dashboard/`
- **Owner decision needed:** the rate (for example 10%), and an anti-gaming rule. A guest who already viewed the listing through Gharmish in the last 30 days, which `analyticsEvents` can show, stays at 15%.

### New features and trends to catch

**N8. Close the platform-licence question before the ~March 2027 adjustment window ends**
- **What:** an owner and counsel task with no code.
  1. Ask MoT (Unified Tourism Centre, 930 [5]) whether Gharmish, as merchant of record for hosted experiences, needs a *Tour Operations* or *General Travel & Tourism Services* licence.
  2. Ask which bank guarantee applies.
  3. Record the answer in legal audit A3.
- **Why now:**
  - The four rulebooks were rewritten in September with about 180 days to adjust [4][6].
  - The guarantee amounts are reported inconsistently: SAR 50k against SAR 800k, depending on category [6][7].
  - Enforcement includes office closures and fines up to SAR 1M for repeat offences [8].
- **Who:** admin and owner.
- **Impact / effort:** High / S.
- **Saudi fit:** a direct regulatory requirement.
- **Codebase:** `docs/legal/legal-audit-2026-08-02.md` (A3). If a licence number results, it slots into H3's display (2026-10-12).

**N9. Google "Things to do" eligibility check (watch)**
- **What:** an owner task.
  - Claim a Google Business Profile for Gharmish (and offer help to hosts with a fixed meeting point).
  - Check whether the Things to do product links are offered for Saudi listings.
  - If they are, add each listing's URL and SAR price.
  - Prices must match the site exactly [18].
- **Why now:** it is a free channel, and most small operators have not activated it [17]. The listing pages already emit `Product`/`Offer` JSON-LD, so no build is needed to start.
- **Impact / effort:** Med if available, otherwise none / S.
- **Saudi fit:** Google Maps is the default way Saudis look up places. Arabic listing names are needed.
- **Codebase:** none to start. `app/[locale]/(site)/experiences/[slug]/page.tsx:585` (JSON-LD) only if Google asks for different fields.

### Quick wins (< 1 week)
- **Q18. Breach-notification runbook (1 day, no code).** Add `docs/security/breach-runbook.md`, covering:
  - who decides;
  - the 72-hour SDAIA notice via the National Data Governance Portal [2][3];
  - a guest-notice template in Arabic and English;
  - the processors to contact (Supabase, Vercel, HyperPay, Twilio).
  
  This closes the A4 line that is still open.
- **Q19. N8 MoT licence question** (owner, a phone call to 930).
- **Q20. N9 Google Business Profile claim and Things-to-do check** (owner).
- **Q21. Minimum H8:** stamp `utmSource=host` on the share-card link now (no pricing change) to measure how many bookings hosts already bring before deciding the rate.

## Top 5 for next sprint (impact ÷ effort)

1. **Q18 – PDPL breach-notification runbook** (High / S). Closes an open audit item while enforcement is live.
2. **N8 – Confirm Gharmish's own MoT licence and guarantee** (High / S, owner-led). The rules changed in September and the adjustment clock is running.
3. **G11 – Self-serve data download and account deletion** (High / M). Fulfils PDPL rights the privacy page already promises.
4. **H8 – Host-sourced booking link at a lower commission** (Med-High / M; Q21 first). Counters the new legal path to direct host contracts.
5. **G10 – Aggregate "who's on this date" signal** (Med / M). Airbnb's top social insight, adapted to Saudi privacy norms.

Next in line: N9 (Google Things to do). The earlier Top 5 items (G8 instant credit refund, G9 Ramadan schedule, N6 Seasonal Offers) remain open and time-bound. G9 must still ship before January.

## Sources
★ = claim verified from a search excerpt only (full pages could not be opened from this environment).

1. ★ Clyde & Co, "Enforcement of the Saudi Personal Data Protection Law is live: Are you ready?", Mar 2026 — https://www.clydeco.com/en/insights/2026/03/enforcement-of-the-saudi-pdp-law
2. ★ Latham & Watkins via JD Supra, "Active Enforcement of Saudi Arabia Privacy Regime: Implications for Businesses" — https://www.jdsupra.com/legalnews/active-enforcement-of-saudi-arabia-3202525/
3. ★ DLA Piper, Data Protection in Saudi Arabia — https://www.dlapiperdataprotection.com/index.html?c=SA&t=law
4. ★ Arab News Pakistan, "Saudi tourism ministry updates four regulations" — https://www.arabnews.pk/saudi-arabia/saudi-tourism-ministry-updates-four-regulations-3001004
5. ★ TradeArabia, "Saudi Arabia updates tourism regulations to modernise sector" — https://tradearabia.com/News/486105/Saudi-Arabia-updates-tourism-regulations-to-modernise-sector
6. ★ Vision2030.ai analysis, "Saudi tourism regulation overhaul: four rules, September 2026" (secondary; gazette and 180-day details single-sourced) — https://vision2030.ai/analysis/saudi-tourism-regulation-overhaul-four-rules-september-2026/
7. ★ Ministry of Tourism, Travel and Tourism Services Regulations service directory (V015) — https://cdn.mt.gov.sa/mtportal/mt-fe-production/content/policies-regulations/documents/services-directory/Travel-and-Tourism-Services-Regulations-service-directory-En-V015.pdf
8. ★ Arab News, "10 Riyadh travel, tourism offices closed over rules breaches", Jul 2025 — https://arab.news/98skz
9. ★ Airbnb Newsroom, "Introducing social features for Airbnb Experiences", Oct 2025 — https://news.airbnb.com/introducing-social-features-for-airbnb-experiences/
10. ★ Marketing Dive, "Airbnb continues focus on travel experiences with new social features" — https://www.marketingdive.com/news/airbnb-continues-focus-on-travel-experiences-with-new-social-features/803513/
11. ★ Skift, "Klook Withdraws U.S. IPO, Citing Market Conditions", Oct 2026 — https://skift.com/?p=844411
12. ★ Renaissance Capital, "Klook Technology withdraws estimated $400 million IPO" — https://www.renaissancecapital.com/IPO-Center/News/122274/pan-asian-travel-booking-platform-klook-technology-withdraws-estimated-400
13. ★ EnterpriseAM, "webook eyes Europe as it expands from tickets into flights, hotels and visas", 19 Oct 2026 — https://enterpriseam.com/ksa/2026/10/19/webook-eyes-europe-as-it-expands-from-tickets-into-flights-hotels-and-visas/
14. ★ Essential Business (PT), "Saudi tech giant webook.com chooses Lisbon as European expansion launch pad" — https://www.essential-business.pt/category/entertainment/
15. ★ TradeArabia, "Digital detoxes, fitness, music to shape Saudi travel trends in 2027: Skyscanner" — https://tradearabia.com/News/487840/Digital-detoxes-fitness-music-to-shape-Saudi-travel-trends-in-2027-Skyscanner
16. ★ Zawya, same Skyscanner release — https://www.zawya.com/en/business/digital-detoxes-fitness-music-to-shape-saudi-travel-trends-in-2027-skyscanner-1588743
17. ★ Arival, "Google Things to Do: A Guide for Experience Businesses" — https://arival.travel/?p=176736
18. ★ Zaui, "Google Things to Do for operators", 12 Feb 2026 (vendor) — https://www.zaui.com/resources/blog/google-things-to-do-for-operators
19. ★ Tabby Newsroom, consumer and SME finance licences in KSA, 29 Jun 2026 — https://tabby.ai/en-AE/newsroom/finance-licences-ksa
20. ★ Connecting Travel, "94% of Saudi travellers discover destinations on social platforms" (Snapchat-commissioned) — https://connectingtravel.com/all-content/94-of-saudi-travellers-discover-destinations-on-social-platforms
21. ★ CairoScene, "Snapchat Reports Saudi Arabia as One of Its Fastest-Growing Markets" — https://cairoscene.com/Buzz/Snapchat-Reports-Saudi-Arabia-as-One-of-Its-Fastest-Growing-Markets
22. ★ Trustpilot, Viator reviews (self-selected consumer reports, incl. May 2026) — https://ie.trustpilot.com/review/www.viator.com?page=7
23. ★ Sikayetvar, GetYourGuide complaints (self-selected) — https://www.sikayetvar.com/en/getyourguide-us/getyourguide-delayed-refund-complaint
24. ★ LinkedIn post by a GetYourGuide executive (H1 2026 figures; self-reported, single source) — https://de.linkedin.com/in/wgluckin
25. ★ Zawya, "Saudi's Aseer eyes 3mln tourists as hospitality sector expands" — https://www.zawya.com/en/world/middle-east/saudis-aseer-eyes-3mln-tourists-as-hospitality-sector-expands-harwim8b
