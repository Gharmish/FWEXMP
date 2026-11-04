# SEO weekly report: 2026-11-04

> **الملخص:** التقييم 80/100 (+2). دُمجت إصلاحات الأسبوعين الماضيين (#91 و#161) في 29 أكتوبر وظهرت كلها في الإنتاج: نصوص المراجعات في الصفحات العربية عربية الآن، والأوصاف مكتملة، وخريطة الموقع تتجدّد. وصلت 4 زيارات عضوية (مقابل 0).
> **الجديد:** خلاصة TikTok تصف التجارب الثماني كلها بأنها «متوفرة» مع أنه لا يوجد تاريخ قابل للحجز في أي منها (#303، P1). وما زال تفعيل Google Search Console هو العائق الأكبر.

**HEAD audited:** `8b891139aa1692e81e8c0c6b7e1792aa0f5d3b8a` (`main`). Production deployment `dpl_F64hUW9qoViUQ7ACzFBUihqh5RP8` is READY on this exact SHA.
**Catalog state:** 8 `live` experiences and 1 draft. 4 `verified` hosts, 1 `pending` and 1 `suspended`, unchanged. **All 8 live listings have an empty `availability_weekdays`**, so they are live but unbookable (an owner decision). The Product JSON-LD reports this honestly as `SoldOut`. The TikTok feed doesn't (SEO-39).

| Surface                                                                                                                                                                                                           | Source                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| robots.txt, sitemap.xml (cache-busted), llms.txt, `/ar`, `/ar/abha`, 2 AR experience pages, 1 AR host page, a `card.png` OG image, a 404 probe                                                                    | **Production** via the Vercel connector. Direct `curl` still fails with `CONNECT tunnel failed, response 403`. |
| All 54 sitemap page-locales (status, lang/dir, h1, title, description, canonical, hreflang, OG, twitter, JSON-LD, img alt, word count), 64 internal links, 18 OG image URLs, private pages, 404s, legacy redirect | **Local production build** of `8b89113` in sample-data mode                                                    |
| Lighthouse, TTFB                                                                                                                                                                                                  | **Local production build**                                                                                     |
| Live and verified slugs, traffic, searches                                                                                                                                                                        | **Production DB** (read-only SELECT)                                                                           |
| Runtime errors, deployments                                                                                                                                                                                       | **Vercel API**                                                                                                 |
| SERP                                                                                                                                                                                                              | WebSearch proxy excerpts (★)                                                                                   |

---

## Needs the founder today

Nothing is 🔴. The sitemap, robots.txt, llms.txt and OG images return 200 in production, the sitemap matches the DB exactly, and unknown slugs return a real 404.

## Scorecard

| Area                 | Score  | Δ      | Deductions                                                                                                                                                                                                     |
| -------------------- | ------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Crawlability         | 98     | 0      | `/experiences` main content streams in behind a skeleton (SEO-15, −2).                                                                                                                                         |
| Indexability         | 95     | +2     | SEO-38 closed: the production sitemap regenerated (`last-modified` 2026-11-03 12:08 UTC) and matches the DB (8 live, 4 verified). No GSC (−5).                                                                 |
| Metadata             | 96     | +5     | #91 and #161 are live: descriptions end on a full sentence, and the al-qatt EN title is 54 characters. `/en/hosts/host` data remains (−4, SEO-08).                                                             |
| Structured data      | 93     | +2     | Fixed: AR `reviewBody`, AR host name, `areaServed` (+5). **New:** the TikTok feed asserts `in stock` for 8 unbookable listings (−3, SEO-39 / #303). No `sameAs` (−2). `aura` and `host` typed `Person` (−2).   |
| Bilingual / hreflang | 98     | +3     | hreflang matches the sitemap on 54 of 54 page-locales. No English JSON-LD on AR pages in production. `/en/hosts/host` shows an Arabic name (−1). English-only user reviews still appear on AR host pages (−1). |
| Content              | 74     | 0      | No first-party photos (−10). `/hosts/host` is thin with 0 live experiences (−6). SAR 5 listing price (−5, SEO-26). AR title grammar (−3, SEO-27). No nature Original (−2).                                     |
| Performance          | 75     | 0      | **Held.** Lab scores rose 10–20 points, but `benchmarkIndex` rose from about 1,500 to 2,171–2,545, so the sandbox was much faster. No code reason for a change (see Performance signals).                      |
| Visibility           | 12     | +2     | **4 organic visits** (google.com ×3, bing.com ×1) against 0. Still not found for any tracked keyword ★, and the brand query still returns Garmisch-Partenkirchen ★. No GSC.                                    |
| **Overall**          | **80** | **+2** | Mean of the 8 areas (80.1), against 78 on 2026-10-28.                                                                                                                                                          |

## Fixed this run

**No fix PR this run.** The 7 fixes from #91 and #161 were merged on 2026-10-29 and verified in production this run (see Closed below). The crawl found no new page-level defect a safe-fix PR could address:

| Item                                          | Why no safe fix this run                                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| SEO-39 TikTok feed availability               | `app/api/**` is HIGH-risk and needs a new batch availability read. Filed as **#303** with the proposed diff. |
| SEO-08, SEO-26, SEO-27, SEO-40                | Host and listing data (admin). Pricing is outside this routine.                                              |
| SEO-13 (`aura` and `host` typed `Person`)     | Needs `cr_number` (KYC data) in the public host DTO                                                          |
| SEO-28 (h1 includes the rotating word list)   | Touches the hero animation                                                                                   |
| SEO-30 (`og:locale:alternate`)                | About 15 page files, plus the HIGH-risk layout                                                               |
| SEO-31 (404 shell has no `lang`)              | Linked to the owner's `force-dynamic` / real-404 decision                                                    |
| Thin AR women-only landing (134 words, local) | Local word count depends on the sample-data listing count. The fix is more real listings, not filler.        |

## Findings by severity

| ID     | Sev | Finding                                                                 | Evidence (this run)                                                                                                                                                                                                                                                                                                                                        | Status                         | Owner       |
| ------ | --- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ----------- |
| SEO-39 | P1  | **New.** The TikTok catalog feed says `in stock` for every live listing | `app/api/catalog/tiktok.csv/route.ts:62-66` hardcodes `'in stock'` (`TODO(analytics)`). Production DB: 8 of 8 live listings have empty `availability_weekdays`. Production `/ar/experiences/soudah-cliff-via-ferrata` Product JSON-LD says `"availability":"https://schema.org/SoldOut"` for the same SKU, so the feed and the page contradict each other. | **Issue #303** (proposed diff) | Eng / Owner |
| SEO-08 | P2  | `/hosts/host` profile data                                              | Live `/llms.txt`: host name «رحلات وعي» on the EN URL, the bio opens `We" offers…`, 0 live experiences                                                                                                                                                                                                                                                     | Open (admin data)              | Ops         |
| SEO-09 | P2  | AR home lab LCP above EN                                                | Median `/ar` 4.0 s against `/en` 3.6 s (last week 5.9 s and 5.6 s on a slower sandbox). The gap is 0.4 s (0.3 s last week), with no code change.                                                                                                                                                                                                           | Open                           | Eng         |
| SEO-26 | P2  | `asiri-coffee-ritual-and-saleeg-lunch` priced at SAR 5                  | Live `/llms.txt`: "Price: SAR 5 per person". Other listings are SAR 180–540.                                                                                                                                                                                                                                                                               | Open (pricing)                 | Founder     |
| SEO-13 | P3  | Brand hosts typed `Person`                                              | `app/[locale]/(site)/hosts/[slug]/page.tsx` name regex, unchanged                                                                                                                                                                                                                                                                                          | Open                           | Eng         |
| SEO-14 | P3  | Organization has no `sameAs`                                            | Absent on production `/ar`                                                                                                                                                                                                                                                                                                                                 | Waiting on social handles      | Founder     |
| SEO-15 | P3  | `/experiences` streams behind a skeleton                                | Local `/ar/experiences` and `/en/experiences`: 0 words in `<main>` in the initial HTML                                                                                                                                                                                                                                                                     | Note only (caching deferred)   | —           |
| SEO-16 | P3  | a11y                                                                    | Lighthouse a11y: home 96, experience 97, category 100                                                                                                                                                                                                                                                                                                      | Open                           | Eng         |
| SEO-27 | P3  | AR title mixes grammatical gender                                       | `plant-play-and-enjoy-a-barbecue-with-a-chef-dnrp9e` (host data, unchanged)                                                                                                                                                                                                                                                                                | Open                           | Host / Ops  |
| SEO-28 | P3  | Home h1 runs into the aria-hidden rotating word list                    | `app/[locale]/(site)/page.tsx:212-226`, unchanged                                                                                                                                                                                                                                                                                                          | Open                           | Eng         |
| SEO-29 | P3  | Language switcher keeps the query string                                | Unchanged. hreflang and canonical are clean.                                                                                                                                                                                                                                                                                                               | Note only                      | —           |
| SEO-30 | P3  | No `og:locale:alternate`                                                | 0 of 54 page-locales, and production `/ar` too                                                                                                                                                                                                                                                                                                             | Open                           | Eng         |
| SEO-31 | P3  | The 404 shell has no `lang`/`dir` and no h1                             | Live `/ar/experiences/zzzz-not-a-slug`: 404, `noindex`, no `lang`                                                                                                                                                                                                                                                                                          | Open                           | Eng         |
| SEO-33 | P3  | Bot and referrer spam logged as page views                              | 16 page views this week from spam hosts (`five.co.in` ×8, `acquire.co.in` ×2, `addurl.in`, `allinone.co.in`, `analyticshaven.top`) and 4 from bare IPs. One `search` event with the literal `q={search_term_string}` (a bot reading the SearchAction template).                                                                                            | Watch                          | —           |
| SEO-36 | P3  | `/hosting` links to `/host/apply` (disallowed, 307 to sign-in)          | Local: `/{en,ar}/host/apply` → 307 `/…/sign-in?next=/host/apply`. These are the only 2 non-200s among 64 internal links.                                                                                                                                                                                                                                   | Note only                      | —           |
| SEO-37 | P3  | Bare `/` falls back to `/en` without `Accept-Language`                  | Unchanged                                                                                                                                                                                                                                                                                                                                                  | Note only (product decision)   | Founder     |
| SEO-40 | P3  | **New.** Arabic place name in the English feed                          | Live `/llms.txt`: `plant-play-…-dnrp9e` "Place: حي المنسك, Abha" in the English manifest. It is listed as Category "Women only" under the title "…barbecue with a chef" (host data).                                                                                                                                                                       | Open (listing data)            | Ops         |

**Closed this run (verified in production):**

| ID     | Fix  | Production evidence                                                                                                                                                               |
| ------ | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEO-23 | #91  | `/ar/experiences/an-evening-with-the-flower-men` `reviewBody`: «تجربة لا تُنسى. تيجان الزهور وغروب الشمس…»                                                                        |
| SEO-22 | #91  | AR descriptions end on a full sentence: soudah (142 characters), flower-men (80). Locally, 0 of 54 page-locales end in `…`.                                                       |
| SEO-24 | #91  | `/ar/hosts/asir-adventures-co`: Organization `name` and h1 «شركة مغامرات عسير»                                                                                                    |
| SEO-25 | #91  | `/ar/abha` renders `<nav aria-labelledby="abha-categories">` with the 7 landings                                                                                                  |
| SEO-32 | #161 | `/ar` Organization `areaServed`: «أبها، عسير، المملكة العربية السعودية»                                                                                                           |
| SEO-34 | #161 | `/en/experiences/al-qatt-painting-rijal-almaa` title is 54 characters (local)                                                                                                     |
| SEO-35 | #161 | `/llms.txt` opens "Experiences hosted by the people who know the place best."                                                                                                     |
| SEO-38 | —    | Cache-busted `/sitemap.xml`: `last-modified: Tue, 03 Nov 2026 12:08:13 GMT`. It regenerates, and the content equals the DB. Caching is not a finding (the routine's fixed facts). |

**Verified healthy this run (no finding):**

- Production robots.txt allows `/{ar,en}/hosts` and `/{ar,en}/hosting`, disallows the 8 private prefixes in both locales, and has `Sitemap: https://gharmish.com/sitemap.xml`.
- Production sitemap has 54 URLs, each with en, ar and x-default (→ `/ar`). It lists exactly the 8 `live` experiences and the 4 `verified` hosts. The draft `…-copy-uwb2cp`, the pending `mountain-roots-collective` and the suspended `sarawat-expeditions` are absent. `lastmod` appears only on experiences and hosts.
- Production `/llms.txt` returns 200 `text/plain` and lists 8 experiences and 4 hosts with EN and AR URLs.
- Production `/ar/experiences/plant-play-…/card.png` returns `200 image/png`. All 18 og:image URLs return `200 image/png` locally.
- Local, 54 of 54 page-locales: 200, correct `lang`/`dir`, exactly one `<h1>`, titles 22–60 characters, descriptions 75–158 characters, self-canonical, hreflang identical to the sitemap, OG and twitter tags present, no duplicate titles or descriptions, every JSON-LD block parses, and no `<img>` without `alt`.
- Production Product JSON-LD: `offers` carries `price`, `priceCurrency: SAR`, honest `availability` (`SoldOut`) and `url`. `aggregateRating` appears only on listings with reviews (flower-men). BreadcrumbList has 3 levels on experience and host pages and 2 on `/abha`.
- Private pages: `/en/me`, `/en/wishlist`, `/en/sign-in`, `/en/dev` and `/ar/me` are `noindex, nofollow`. `/en/host` and `/en/admin` 307 to sign-in. `/en/book/x` returns 404 with `noindex`. All are disallowed in robots.txt.
- 404s are real (live `/ar/experiences/zzzz-not-a-slug`, local `/ar/hosts/zzzz-nope`). The legacy host slug `/en/hosts/faisal-al-qahtani` returns 308 to `/en/hosts/abdulaziz-alasmari` in one hop.
- The verification tags in `app/[locale]/layout.tsx:76-85` are unchanged.
- Not checked: http→https and apex/www redirects. The connector follows same-origin redirects only and direct `curl` is blocked.

## Regressions since last run

`git log 4329f91..8b89113`: 157 commits (about 60 merged PRs). The SEO-relevant ones:

| Change                                                                                                                                               | Effect                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| #91, #161 (SEO fixes): `abha/page.tsx`, `about/page.tsx`, `page.tsx`, `experiences/[slug]`, `hosts/[slug]`, `lib/site.ts`, `lib/meta-description.ts` | Intended. Verified live (see Closed).                      |
| `experiences/[slug]/page.tsx`: supersede seat release (#77)                                                                                          | Booking widget only. Metadata and JSON-LD unchanged.       |
| `app/[locale]/layout.tsx`: `<MarketingPixels />` wrapped in `<Suspense>` (#190)                                                                      | No metadata change. The verification tags are intact.      |
| `components/layout/marketing-pixels.tsx`: pixels blocked on capability URLs                                                                          | Still consent-gated. No third-party script before consent. |
| `features/reviews` fallback text and direction (#189)                                                                                                | AR pages show Arabic review text where it exists.          |
| `proxy.ts`: a comment only                                                                                                                           | None                                                       |
| `messages/*.json`: new admin/host copy and `categoriesHeading`                                                                                       | Key parity is held by `messages/catalog.test.ts`.          |

**No regressions found.**

## Organic traffic and demand gaps

| Window (rolling, to 04:05 UTC) | AR  | EN  | Total | WoW |
| ------------------------------ | --- | --- | ----- | --- |
| Organic, last 7 days           | 0   | 4   | **4** | +4  |
| Organic, previous 7 days       | 0   | 0   | 0     | —   |

- **The 4 organic visits** are google.com ×3 and bing.com ×1, all landing on `/` in English. There is still no Arabic organic visit.
- **All page views:** 427, against 279 the week before (+53%). Arabic rose from 66 to 114 (+73%), and English rose from 213 to 313. 406 have no referrer.
- **Zero-result searches (28 days):** the `category=nature&originals=1` filter (32, last seen 2026-10-14), `category=women_only` (2), `category=adventure` (1), `category=adventure,women_only` (1), and one bot hitting `q={search_term_string}`. There were no free-text zero-result queries, so no new keyword seeds this week.

## SERP presence (★ = from search excerpts only)

| Keyword              | gharmish.com seen? | Who holds the excerpts                                                                                                         |
| -------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `site:gharmish.com`  | No ★               | Unrelated (ghazali.org, GitHub, Hugging Face)                                                                                  |
| «gharmish غارميش»    | Not found ★        | Garmisch-Partenkirchen (trip.com, Wikidata), Gharm (Wikipedia), Qurmish                                                        |
| تجارب أبها           | Not found ★        | platinumlist.net (Soudah exploration trip SAR 220), linkedin                                                                   |
| أنشطة في أبها        | Not found ★        | excursionmania.com, okaz, platinumlist, sabq, saudipedia                                                                       |
| سياحة عسير تجارب     | Not found ★        | ajel.sa, alyaum, alwatan, sabq, okaz, al-madina (Aseer summer season news)                                                     |
| things to do in Abha | Not found ★        | laurewanders.com, Expedia (many country sites), Travelocity, listmag, thrillophilia                                            |
| Abha experiences     | Not found ★        | **book.visitsaudi.com** (traditional Asiri home visit), **tickets.jarir.com** (new), Expedia, localadventures.travel, trip.com |
| Aseer tours          | Not found ★        | Expedia, ootlah, **discoveraseer.com/en/experiences** (official ASDA listing, new), euronews, listmag                          |
| Soudah tours         | Not found ★        | Expedia, platinumlist (Gaithan hike SAR 248–288), rezdy, AAA, lokalee                                                          |
| رحلة جبل السودة      | Not found ★        | mawdoo3, excursionmania, sayidaty, sabq. Editorial only, no booking platform.                                                  |

## Performance signals

| Page (local build, Lighthouse 12 mobile, median of 3) | Perf | SEO | A11y | LCP   | CLS   | TBT    | benchmarkIndex |
| ----------------------------------------------------- | ---- | --- | ---- | ----- | ----- | ------ | -------------- |
| `/ar`                                                 | 78   | 100 | 96   | 4.0 s | 0     | 388 ms | 2,171–2,342    |
| `/en`                                                 | 85   | 100 | 96   | 3.6 s | 0.001 | 270 ms | 2,441–2,546    |
| `/ar/experiences/soudah-cliff-via-ferrata`            | 76   | 100 | 97   | 4.5 s | 0.001 | 379 ms | 2,222–2,378    |
| `/ar/experiences/nature`                              | 78   | 100 | 100  | 4.3 s | 0     | 212 ms | 2,227–2,371    |

- **Not a real improvement.** `benchmarkIndex` was 2,171–2,546 this run against 1,417–1,607 last run, so the sandbox CPU was about 50% faster. The scores rose with it while the rendering code didn't change. Performance stays at 75.
- **TTFB, local, median of 5:** `/ar` 32 ms and `/ar/experiences` 39 ms. Production TTFB is not measured because the proxy blocks direct requests.
- **Static checks:** no third-party `<script src>` in the initial HTML, marketing pixels stay consent-gated, no unsized hero media (CLS ≤ 0.001 in 12 of 12 runs), and every `<img>` has `alt`.
- **Vercel runtime errors (7 days):** 1 group. `config-check: Production configuration missing: ADMIN_ALERT_WHATSAPP` fired 985 times across public routes (2026-10-29 to 10-31). This is an ops alert-rail gap already tracked in #247. Pages still render (every production fetch this run was 200). The pooler `CONNECT_TIMEOUT` errors from last week did not recur.
- **Deployments:** production is on HEAD `8b89113` (READY). No failed production deployments in the last 5.

## Deferred and accepted items

| Item                                                            | Status                                                                                   |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `force-dynamic` locale layout, no root `loading.tsx`            | Owner decision, kept so 404s stay real. Caching is deferred, never a P0.                 |
| Experience photography                                          | Quarantined since 2026-08. The fix is a photo shoot (owner task).                        |
| x-default → Arabic                                              | Owner decision. Verified on 54 of 54 page-locales.                                       |
| Live but unbookable listings (empty weekdays)                   | Owner decision since 2026-10-12. JSON-LD is honest (`SoldOut`). The feed isn't (SEO-39). |
| `asir-adventures-co` / `asiri-coffee-*` slugs, "Aseer" spelling | Kept on purpose                                                                          |
| `accepted:` list                                                | Empty                                                                                    |

## Decisions for the founder

1. **Verify Google Search Console and Bing Webmaster Tools.** `verification` in `app/[locale]/layout.tsx:76` still has no `google` key. The first 4 organic visits arrived this week, but there is no view of the queries, impressions or index coverage behind them, and the brand name still doesn't surface for its own spelling ★. This is a standing item.
2. **Review #303 (TikTok feed availability).** It is HIGH-risk (`app/api/**`). Until it lands, any TikTok catalog ad promotes 8 listings that have no bookable date. If ads aren't running, pausing the catalog sync is the zero-code alternative.
3. **Fix the SAR 5 price on `asiri-coffee-ritual-and-saleeg-lunch`** (SEO-26). Search engines, AI assistants and the TikTok feed all repeat it.

## Next-run watchlist

- #303: once the route changes, confirm the feed says `out of stock` for empty-weekday listings, then retire SEO-39.
- The first Arabic organic visit. All organic traffic so far lands on `/en`.
- The `ADMIN_ALERT_WHATSAPP` error volume on public routes (#247). Watch for any change to 5xx.
- Lighthouse: compare only at a similar `benchmarkIndex` (about 2,200–2,500 this run).
- SERP: discoveraseer.com and tickets.jarir.com are new holders for "Abha experiences" and "Aseer tours".
