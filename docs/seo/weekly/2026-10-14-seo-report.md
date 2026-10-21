# SEO weekly report: 2026-10-14

> **الملخص:** ارتفع التقييم إلى 79/100 (+3). صارت التجارب الثماني المنشورة كلها في خريطة الموقع، ولكل منها صفحة سليمة: عنوان ووصف وبيانات منظمة (Product) وصورة مشاركة. يصلح PR #91 أربع مشكلات: الأوصاف المقطوعة، ونص المراجعات الإنجليزي في البيانات المنظمة للصفحات العربية، واسم المضيف الإنجليزي في مسار التنقل العربي، وروابط الفئات من صفحة أبها.
> **العائق الأكبر ما زال خارج الكود:** لم يُفعَّل Google Search Console بعد، والموقع لا يظهر في نتائج البحث. وصلت 3 زيارات عضوية فقط هذا الأسبوع، كلها بالإنجليزية.

**HEAD audited:** `267b62f968232fb0f7d36d959b815056a04a3419` (`main`). The production deployment `dpl_6gPwASjWY86LAzdNtpvU6qM87ZGG` is READY on this SHA.
**Catalog state:** **8 live experiences** (relisted 2026-10-12, up from 0 last run) and 1 draft. All 8 were relisted deliberately with **no bookable weekdays** (owner decision, recorded in `docs/ops/2026-10-12-relist-schedule-backup.md`). Every Offer therefore reads `SoldOut`, which is honest, and is not reported as a finding.

| Surface                                                                                                                                                   | Source                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| robots.txt, sitemap.xml, llms.txt, 34 public page-locales (16 experience, 6 host, 12 static or landing), 4 OG image routes, 2 404 probes, 3 private pages | **Production** via the Vercel connector (`web_fetch_vercel_url`). Direct `curl` from the sandbox still fails with `CONNECT tunnel failed, response 403`. |
| Lighthouse, TTFB, verification of the fixes                                                                                                               | **Local production build** (this run's build, then the `seo/fix-2026-10-14` build)                                                                       |
| Live and verified slugs, organic traffic, zero-result searches                                                                                            | **Production DB** (read-only SELECT)                                                                                                                     |
| SERP                                                                                                                                                      | WebSearch proxy excerpts (★)                                                                                                                             |

---

## Needs the founder today

None. No 🔴: every fetched public page returns 200, the sitemap lists all 8 live experiences and all 4 verified hosts, and every OG route returns `200 image/png`.

## Scorecard

| Area                 | Score  | Δ      | Deductions                                                                                                                                                                                                                                                                                                                   |
| -------------------- | ------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Crawlability         | 98     | 0      | `/experiences` main content still streams in behind a skeleton (SEO-15, −2).                                                                                                                                                                                                                                                 |
| Indexability         | 95     | +10    | 8 live experiences are now in the sitemap. Each is 200, self-canonical, and has en/ar/x-default alternates. No GSC (−5).                                                                                                                                                                                                     |
| Metadata             | 92     | +2     | Fixes from #53 verified live. 11 of 16 experience descriptions end mid-sentence (−4, fixed in #91). `/en/hosts/host` has an Arabic-only title and a broken-quote description (−4, SEO-08).                                                                                                                                   |
| Structured data      | 91     | −2     | Product, Offer (SAR) and BreadcrumbList are valid on all 16 experience pages. AR pages emit English `reviewBody` (−3, fixed in #91). The AR host breadcrumb uses the English name (−1, fixed in #91). No `sameAs` (−2). `aura` and `host` are still typed `Person` (−2).                                                     |
| Bilingual / hreflang | 95     | −2     | hreflang matches the sitemap on all 34 fetched pages. Deductions: English JSON-LD on AR pages (−2) and the English host name in the AR breadcrumb (−1), both fixed in #91. `/en/hosts/host` shows an Arabic name (−1). One English user review appears on two AR pages (−1).                                                 |
| Content              | 74     | +12    | Grids are populated (home 8, catalog 8, `/abha` 8), and experience pages run about 270–485 words. Deductions: no first-party photos (−10). `/hosts/host` is thin with 0 live experiences (−6). One listing is priced at SAR 5 (−5, SEO-26). One AR title has a grammar error (−3, SEO-27). There is no nature Original (−2). |
| Performance          | 76     | +8     | Lab only. `/ar` Perf is 78 with LCP 4.2 s (was 62 and 4.8 s). `/en` Perf is 89 with LCP 3.6 s. The experience page's LCP is 5.3 s. CLS is 0.001 on every page.                                                                                                                                                               |
| Visibility           | 12     | 0      | 3 organic visits in 7 days (−40% WoW), 0 of them Arabic. `site:gharmish.com` returns nothing ★. No GSC.                                                                                                                                                                                                                      |
| **Overall**          | **79** | **+3** | Mean of the 8 areas, compared with 76 on 2026-10-11 (second run).                                                                                                                                                                                                                                                            |

## Fixed this run

PR: **[#91 SEO fixes – 2026-10-14](https://github.com/Gharmish/FWEXMP/pull/91)**. `pnpm scan` passes (lint, typecheck, audit, 2,266 tests, build).

| ID     | Sev | Fix                                                                                                                   | Before (production)                                                                                                                                                     | After (local build)                                                                         |
| ------ | --- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| SEO-22 | P2  | Clamped meta descriptions now end on a full sentence (`lib/meta-description.ts`, shared by experience and host pages) | `/en/experiences/juniper-forest-dawn-walk-jabal-sawda`: "…ancient juniper. Your host reads the…" (11 of 16 pages cut mid-sentence)                                      | "…as mist moves through ancient juniper."                                                   |
| SEO-23 | P1  | AR review JSON-LD now uses the Arabic text                                                                            | `/ar/experiences/an-evening-with-the-flower-men` and `/ar/experiences/asiri-coffee-ritual-and-saleeg-lunch`: `reviewBody` was English, while the visible card is Arabic | Same per-locale pick as `ReviewCard`                                                        |
| SEO-24 | P2  | AR host JSON-LD and breadcrumb name localized                                                                         | `/ar/hosts/asir-adventures-co`: `"name":"Asir Adventures Co."`                                                                                                          | `"name":"شركة مغامرات عسير"`, matching the h1                                               |
| SEO-25 | P2  | Category landings linked from `/abha`                                                                                 | The 7 category landings were linked only from the home page's client-side marquee                                                                                       | A server-rendered row with 7 links. Heading: "Browse by category" / «تصفّح حسب نوع التجربة» |

## Findings by severity

| ID                 | Sev   | Finding                                                                           | Evidence                                                                                                                                                                                                                        | Status                                                                            | Owner   |
| ------------------ | ----- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------- |
| SEO-23             | P1    | English JSON-LD reviews on AR pages                                               | See "Fixed this run"                                                                                                                                                                                                            | Fixed in #91                                                                      | —       |
| SEO-06             | P2    | Thin landings and empty grids                                                     | Live: `/ar/experiences/nature` 204 words with 1 card, `/ar/experiences/women-only` 264 words with 2 cards, `/ar/abha` 570 words with 8 cards                                                                                    | **Fixed, verified live** (8 listings live)                                        | —       |
| SEO-08             | P2    | `/hosts/host` profile has data problems                                           | Live: the slug is generic, the EN title and h1 are «رحلات وعي», the EN description opens `We" offers…`, and the AR bio has the typo «مجرب رحلة» (should be «مجرد»). The profile has 0 live experiences and about 104–118 words. | Open. Fix in the admin data.                                                      | Ops     |
| SEO-09             | P2    | High AR home lab LCP                                                              | `/ar` LCP 4.2 s (was 4.8 s), Perf 78 (was 62). The experience page is at 5.3 s.                                                                                                                                                 | Improving. Field data is still unavailable (Speed Insights has no read API here). | Eng     |
| SEO-22             | P2    | Descriptions cut mid-sentence                                                     | See "Fixed this run"                                                                                                                                                                                                            | Fixed in #91                                                                      | —       |
| SEO-24             | P2    | English host name in the AR JSON-LD                                               | See "Fixed this run"                                                                                                                                                                                                            | Fixed in #91                                                                      | —       |
| SEO-25             | P2    | Category landings had only one crawl path                                         | See "Fixed this run"                                                                                                                                                                                                            | Fixed in #91                                                                      | —       |
| SEO-26             | P2    | `asiri-coffee-ritual-and-saleeg-lunch` is priced at **SAR 5**                     | Live JSON-LD `"price": 5`, page "SAR 5 per guest", `/llms.txt` "Price: SAR 5 per person". Other listings are SAR 180–540.                                                                                                       | Open. Pricing is data and outside this routine's scope.                           | Founder |
| SEO-17, 18, 19, 20 | P2/P3 | Fixes from #53                                                                    | Live `/ar/hosts/aura` title «… · مضيف محلي في أبها وعسير · غارميش», `/en/abha` title 50 chars, AR category breadcrumbs «التجارب › الطبيعة»                                                                                      | **Fixed, verified live** (`/hosting` was not re-fetched)                          | —       |
| SEO-13             | P3    | Brand hosts typed `Person`                                                        | `/hosts/asir-adventures-co` is now `Organization`. `aura` and `host` are still `Person`.                                                                                                                                        | Partly fixed                                                                      | Eng     |
| SEO-14             | P3    | Organization has no `sameAs`                                                      | Absent on both home pages                                                                                                                                                                                                       | Waiting on the owner's social handles                                             | Founder |
| SEO-15             | P3    | `/experiences` streams in behind a skeleton                                       | `<main>` first holds an `animate-pulse` skeleton, and the cards arrive in `<div hidden id="S:1">`                                                                                                                               | Note only. Caching is deferred.                                                   | —       |
| SEO-16             | P3    | a11y issues                                                                       | Home a11y is 96 (color contrast). The experience page is 97 (`aria-prohibited-attr`).                                                                                                                                           | Open                                                                              | Eng     |
| SEO-21             | P3    | Intermittent CLS on the AR home hero                                              | CLS was 0.001 in this run's lab measurement                                                                                                                                                                                     | Watch                                                                             | Eng     |
| SEO-27             | P3    | AR title mixes grammatical gender                                                 | `/ar/experiences/plant-play-and-enjoy-a-barbecue-with-a-chef-dnrp9e` h1 and title «ازرعِ، العبِ واستمتعي بالشواء مع شيف». Suggested: «ازرعي، العبي واستمتعي بالشواء مع شيف» (the listing is women-only).                        | Open. Host listing data.                                                          | Ops     |
| SEO-28             | P3    | The home h1 runs into an aria-hidden word list                                    | The crawled `/ar` h1 text reads «…يعرفونه أكثر.تجارب المغامرةالطبيعةالعافية…»                                                                                                                                                   | Open                                                                              | Eng     |
| SEO-29             | P3    | The language switcher keeps the incoming query string                             | Seen with the fetch tool's share token (`/en/abha?_vercel_share=…`). UTM parameters would carry over the same way. Canonicals limit the impact.                                                                                 | Open, needs checking with a real UTM parameter                                    | Eng     |
| SEO-30             | P3    | No `og:locale:alternate`                                                          | Absent on all 34 fetched pages                                                                                                                                                                                                  | Open                                                                              | Eng     |
| SEO-31             | P3    | The 404 shell has no `lang`/`dir`, and its og:image is generated for the bad slug | `/ar/experiences/zzzz-not-a-slug` returns 404 with noindex (correct), but uses the `__next_error__` shell                                                                                                                       | Open                                                                              | Eng     |
| SEO-32             | P3    | Organization `areaServed` is in English on the AR home page                       | `app/[locale]/(site)/page.tsx:148` `areaServed: 'Abha, Aseer, Saudi Arabia'`                                                                                                                                                    | Open                                                                              | Eng     |
| SEO-33             | P3    | Bot probes are logged as page views                                               | `analytics_events` has 7 `page_view` rows in 7 days with `locale = 'xmlrpc.php'`                                                                                                                                                | Open. This is analytics noise, not SEO.                                           | Eng     |

No issues were opened this run. The only P1 (SEO-23) is fixed in #91, and no P0 exists.

**Verified healthy this run (no finding):**

- **robots.txt:**
  - Allows `/{ar,en}/hosts` and `/{ar,en}/hosting`.
  - Disallows the 8 private prefixes per locale.
  - Has a `Sitemap:` line.
- **sitemap.xml** has 56 URLs, all with en, ar and x-default (→ ar) alternates.
  - It includes the 8 `live` experiences, matching the production DB exactly. Their `lastmod` is 2026-10-12, the real relist time.
  - It includes all 4 `verified` hosts.
  - It excludes the draft listing, the pending host `mountain-roots-collective` and the suspended host `sarawat-expeditions`.
- **llms.txt** returns 200 `text/plain` and lists 8 experiences × 2 locales and 4 hosts × 2 locales.
- **16 experience pages:**
  - All return 200, with correct `lang`/`dir`, exactly one h1, a self-canonical and matching hreflang.
  - All have og:image `…/card.png`; two were spot-checked and returned `200 image/png`.
  - Titles are 36–65 chars and descriptions 126–159 chars.
  - Product JSON-LD has `image`, `offers.price`, `priceCurrency: "SAR"`, `availability` and `url`. `aggregateRating` appears only on the 3 listings with a visible review.
  - BreadcrumbList has 3 levels.
- **18 static, landing and host pages:**
  - Titles and descriptions are all unique, and every description is 75–158 chars.
  - ItemList on home, catalog and `/abha` has 8 items. Nature has 1 and women-only has 2.
- **Private pages:** `/en/me`, `/en/sign-in` and `/en/wishlist` are `noindex, nofollow` and robots-disallowed.
- **404 probes:** `/ar/experiences/zzzz-not-a-slug` and `/en/hosts/zzzz-not-a-host` return a real 404 with `noindex`.
- **Verification tags:** the `facebook-domain-verification` and `domain-verification` tags are still present in `app/[locale]/layout.tsx:76-85`.

## Regressions since last run

`git log e7273a5..267b62f` touched these SEO-surface files:

- `app/globals.css` (ticker, `27a1f5b`)
- two booking/confirmation pages (`1557c0e`), which are private routes
- four admin pages (`3b1a13c`), which are private
- message strings in `bookings`, `wallet` and `hostListing` (`5747750`, `6114624`, `1557c0e`)
- the four SEO commits from #53

**No regressions found.** The ticker change did not move CLS, which was 0.001 in the lab measurement on `/ar`.

## Organic traffic and demand gaps

| Window (rolling, from 04:10 UTC) | AR  | EN  | Total | WoW  |
| -------------------------------- | --- | --- | ----- | ---- |
| Last 7 days                      | 0   | 3   | **3** | −40% |
| Previous 7 days                  | 0   | 5   | 5     | —    |

- All 3 visits came from `google.com` and landed on `/` in English.
- Total page views were 315 (last 7 days) against 626 (previous 7).
- The 2026-10-11 run counted 3 and 9 visits, over a window ending 3 days earlier, so the two runs are not directly comparable.

**Zero-result searches (28 days):** 75 in total. Only 4 came after the 2026-10-12 relist, and all 4 were `category=nature&originals=1`. The other 71 were caused by the empty catalog.

That filter still returns nothing because no nature listing is an Original. The live Originals are 1 heritage, 1 adventure and 1 women-only listing. This is a content gap, not a code problem.

Free-text gaps over 28 days: `aura` ×3 (a host name, which search does not match) and `خيل` ×2 (horse riding: no listing exists).

## SERP presence (★ = from search excerpts only)

| Keyword                                                | gharmish.com seen?                | Who holds the excerpts                                                                                                      |
| ------------------------------------------------------ | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `site:gharmish.com`                                    | No ★                              | Unrelated sites (ghazali.org, gharieni)                                                                                     |
| تجارب أبها                                             | Not found in the first excerpts ★ | platinumlist.net                                                                                                            |
| أنشطة في أبها                                          | Not found ★                       | excursionmania, okaz, platinumlist, saudipedia                                                                              |
| سياحة عسير تجارب                                       | Not found ★                       | ajel, sabq, alwatan, okaz (news)                                                                                            |
| things to do in Abha                                   | Not found ★                       | laurewanders, Expedia, listmag, hotelscombined                                                                              |
| Abha experiences                                       | Not found ★                       | **book.visitsaudi.com** (Raydah, an Asiri home visit), Expedia                                                              |
| Aseer tours                                            | Not found ★                       | Expedia, tradearabia, euronews, listmag                                                                                     |
| Soudah tours                                           | Not found ★                       | Expedia, platinumlist (Gaithan and Soudah hikes), rezdy, AAA                                                                |
| رحلات السودة                                           | Not found ★                       | The results are about Sudan (the keyword is ambiguous). Keep «جبل السودة رحلة» as the tracked form.                         |
| Soudah via ferrata Abha (**new**, from a live listing) | Not found ★                       | No excerpt describes a via ferrata at Soudah. This is an open niche that `soudah-cliff-via-ferrata` could own once indexed. |

## Performance signals

| Page (local build, Lighthouse mobile)      | Perf | SEO\* | A11y | LCP   | CLS   | TBT    |
| ------------------------------------------ | ---- | ----- | ---- | ----- | ----- | ------ |
| `/ar`                                      | 78   | 92    | 96   | 4.2 s | 0.001 | 310 ms |
| `/en`                                      | 89   | 92    | 96   | 3.6 s | 0.001 | 130 ms |
| `/ar/experiences/soudah-cliff-via-ferrata` | 78   | 92    | 97   | 5.3 s | 0.001 | 170 ms |
| `/ar/experiences/nature`                   | 83   | 92    | 100  | 4.2 s | 0     | 170 ms |

\*The only SEO audit that fails is `canonical`, which is expected on localhost because the canonical points at gharmish.com.

- **TTFB, local, median of 5:** `/ar` 46 ms, `/ar/experiences` 41 ms. Production TTFB is not measured, because the sandbox proxy blocks direct requests.
- **Vercel runtime errors (7 days):**
  - 1 refresh-token `AuthApiError` on `/middleware`
  - 1 admin `DeadlineError` (a known nuisance)
  - 1 transient pooler `CONNECT_TIMEOUT` on the ratings query (`/[locale]/sign-in.rsc`, 2026-10-12)

  None of these affect public SEO.

- **Deployments:** 0 failed in the 5 latest production deployments.
- **Experience images** are served via `/_next/image`. The `card.png` files are about 30–49 KB, and the host OG image is about 143 KB.

## Deferred and accepted items

| Item                                                                                      | Status                                                                                                                                                      |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `force-dynamic` locale layout, no root `loading.tsx`                                      | Owner decision, kept so 404s stay real. Caching is deferred, never a P0. The home OG image is served with `max-age=0`, which belongs to the same trade-off. |
| Experience photography                                                                    | Quarantined since 2026-08. The fix is a photo shoot (owner task).                                                                                           |
| x-default → Arabic                                                                        | Owner decision. Verified on 34 of 34 fetched pages.                                                                                                         |
| 8 live listings with no bookable weekdays, so Offers read `SoldOut`                       | Owner decision on 2026-10-12 (`docs/ops/2026-10-12-relist-schedule-backup.md`). Google may show the listings as "Out of stock" until weekdays are restored. |
| `asir-adventures-co` / `asiri-coffee-*` slugs, "Aseer" spelling                           | Kept on purpose                                                                                                                                             |
| Gallery tiles with `alt=""` (`features/experiences/components/photo-gallery.tsx:286,311`) | Deliberate. The wrapping button carries the "photo n/N" label, so this is not a finding.                                                                    |
| `accepted:` list                                                                          | Empty                                                                                                                                                       |

## Decisions for the founder

1. **Verify Google Search Console and Bing Webmaster Tools.** `verification` in `app/[locale]/layout.tsx` still has no `google` key. Now that 8 experience pages are live, this is the step that gets them indexed.
   - Add the token.
   - Submit `https://gharmish.com/sitemap.xml`.
   - Request indexing for the 8 `/ar/experiences/*` URLs.

   This is a standing item.

2. **Check the SAR 5 price on `asiri-coffee-ritual-and-saleeg-lunch`** (SEO-26). It appears in Product JSON-LD, on the page and in `llms.txt`, and it looks like a test value. If it is real, nothing needs to change.
3. **Restore bookable weekdays when ready.** The listings are indexable now, but every Offer reads `SoldOut`. The weekdays to restore are in the relist backup doc.

## Next-run watchlist

- Merge and deploy #91, then re-check the live descriptions, the AR `reviewBody`, the AR host breadcrumb, and the category links on `/abha`.
- Indexing: whether any `/experiences/*` URL appears for `site:gharmish.com` ★, and whether GSC is verified.
- Organic: still 3 visits a week and 0 Arabic. Watch whether the 8 live experience pages earn any Arabic organic entry.
- SEO-26 (price) and SEO-08 (`/hosts/host` data) outcomes.
- Experience-page LCP (5.3 s lab): look at the hero image priority and size if it does not improve.
