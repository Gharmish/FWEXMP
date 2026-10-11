# SEO weekly report: 2026-10-11

> **الملخص:** هذا أول تشغيل للتقرير، وهو يضع خط الأساس عند 72/100. الزحف والفهرسة وhreflang سليمة، وأصلح PR #50 خمس مشكلات منها روابط داخلية معطّلة وصورة المشاركة الغائبة عن الصفحة الرئيسية.
> **العائق الأكبر ليس تقنيًا:** لا توجد أي تجربة منشورة، ولا يظهر الموقع في نتائج البحث للكلمات المستهدفة، ولم يُفعَّل Google Search Console بعد.

**Run:** first run, so this report sets the baseline. There is no previous report or SEO Log comment to compare against.
**HEAD audited:** `b341775f5b52ea2c0b2de47a0108526c9faac94d` (`main`)
**Catalog state:** 0 live experiences (8 paused, 1 draft). This is a known business condition that the daily ops digest already tracks. The static surface was audited as normal.

**Where each check ran**

| Surface                                                                                                                       | Source                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| robots.txt, sitemap.xml, llms.txt, 31 public pages (both locales), 6 private pages, 404s, www/http redirects, OG image routes | **Production**, fetched through the Vercel connector (`web_fetch_vercel_url`). Direct `curl` from the sandbox returns `CONNECT tunnel failed, 403`. |
| Lighthouse, TTFB samples, fix verification                                                                                    | **Local production build** (`pnpm build && pnpm start`) in sample-data mode                                                                         |
| Live / verified slugs, organic traffic, zero-result searches                                                                  | **Production DB** (read-only SELECT)                                                                                                                |
| SERP presence                                                                                                                 | WebSearch proxy excerpts (★ marks each claim). Not Google rankings.                                                                                 |

---

## Needs the founder today

None. No 🔴 this run: every public page returns 200, the sitemap and robots.txt are healthy, and the OG image routes return `200 image/png`.

## Scorecard

| Area                 | Score  | Δ vs last week | Deductions                                                                                                                                                                                                                                                     |
| -------------------- | ------ | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Crawlability         | 92     | baseline       | Review cards linked to 404s (−5, fixed in #50). `LLM:` line in robots.txt is a non-standard directive and Lighthouse marks the file invalid (−3).                                                                                                              |
| Indexability         | 85     | baseline       | With 0 live listings, no experience pages can be indexed (−10). Index coverage can't be checked without GSC (−5).                                                                                                                                              |
| Metadata             | 76     | baseline       | Home page had no og:image (−8, fixed). 9 page-locales had meta descriptions over 160 chars (−5, fixed). Brand repeated in titles (−3, fixed). Slogan-only titles on 4 pages (−4). Catalog descriptions under 70 chars (−2). og:locale missing below home (−2). |
| Structured data      | 90     | baseline       | English ItemList description on Arabic pages (−4, fixed). Brand hosts typed as `Person`, and `hasCredential` is a plain English string (−3). Organization has no `sameAs` or `contactPoint` (−3).                                                              |
| Bilingual / hreflang | 95     | baseline       | hreflang en/ar/x-default matches the sitemap on 31 of 31 pages. Small English leaks inside Arabic structured data (−5, mostly fixed).                                                                                                                          |
| Content              | 55     | baseline       | 0 live listings, so every category landing and /abha shows an empty grid. Landings run 67–136 words (thin). No first-party photos. One host bio has a broken opening.                                                                                          |
| Performance          | 65     | baseline       | Lab only (local): AR home LCP 5.9 s with Perf 62; EN home LCP 3.7 s with Perf 80. CLS 0.001.                                                                                                                                                                   |
| Visibility           | 15     | baseline       | 4 organic visits in 7 days (−50% WoW). No presence for any of the 8 tracked keywords ★. No GSC.                                                                                                                                                                |
| **Overall**          | **72** | baseline       | Mean of the 8 areas                                                                                                                                                                                                                                            |

## Fixed this run

PR: **[#50 SEO fixes – 2026-10-11](https://github.com/Gharmish/FWEXMP/pull/50)**. `pnpm scan` passes (lint, typecheck, audit, 2,215 tests, build).

| ID     | Fix                                                                                                                                      | Before (production)                                                                                                                                                                                                                                    | After (local build)                                                                                                                 |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| SEO-01 | Home page re-attaches og:image and twitter:image. Adds a structural test that fails any page that declares `openGraph` without `images`. | `/ar`, `/en`: no `og:image` and no `twitter:image` tag                                                                                                                                                                                                 | `og:image=https://gharmish.com/{ar,en}/opengraph-image`                                                                             |
| SEO-02 | Review cards only link to `live` experiences (home strip and host profile)                                                               | `/ar` and `/en` link to `/experiences/an-evening-with-the-flower-men` and `/experiences/asiri-coffee-ritual-and-saleeg-lunch`. `/ar/hosts/asir-adventures-co` links to `/ar/experiences/women-only-hike-yoga-and-sketching`. All three return **404**. | Both queries filter on `experiences.status = 'live'`                                                                                |
| SEO-03 | Dedicated meta descriptions for the category landings, and a shorter `/en/abha` description                                              | AR 167–275 chars, EN 228–341 chars, `/en/abha` 189 chars                                                                                                                                                                                               | AR 100–127, EN 129–147, `/en/abha` 152                                                                                              |
| SEO-04 | Localized `ItemList.description` on `/ar/experiences` and `/ar/hosts`                                                                    | "Experiences hosted by the people who know Aseer best." (English, on the Arabic page)                                                                                                                                                                  | «تجارب منتقاة يقدّمها أهل المكان الذين يعرفونه أكثر — بدايتنا من أبها، عسير.»                                                       |
| SEO-05 | /about and /hosts titles no longer repeat the brand                                                                                      | `About Gharmish · Gharmish`, `عن غارميش · غارميش`, `مضيفو غارميش · غارميش`                                                                                                                                                                             | `About us — local experiences in Aseer · Gharmish`, `من نحن — تجارب محلية في عسير · غارميش`, `مضيفون محليون في أبها وعسير · غارميش` |

## Findings by severity

| ID     | Sev | Finding                                                                                                                                                           | Evidence                                                                                                                                                                                                                                                             | Status                                                                                                                                       | Owner         |
| ------ | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| SEO-01 | P1  | Home page has no og:image or twitter:image. Shares of the top page render as text-only links.                                                                     | Live `/ar`, `/en` head has `og:title…og:type` and no `og:image`. `app/[locale]/(site)/page.tsx:62-74`                                                                                                                                                                | Fixed in #50                                                                                                                                 | —             |
| SEO-02 | P1  | Broken internal links: review cards on the home page and a host profile point to paused listings, which 404.                                                      | Live `/ar/experiences/an-evening-with-the-flower-men` → 404. `features/reviews/queries.ts:333-339`, `:408`                                                                                                                                                           | Fixed in #50                                                                                                                                 | —             |
| SEO-03 | P2  | Meta descriptions truncated in search results on 7 category landings × 2 locales and on `/en/abha`                                                                | `app/[locale]/(site)/experiences/[slug]/page.tsx:126` used `.intro`. `/en/experiences/nature` is 341 chars.                                                                                                                                                          | Fixed in #50                                                                                                                                 | —             |
| SEO-04 | P2  | English ItemList description inside Arabic JSON-LD                                                                                                                | `(catalog)/page.tsx:180`, `hosts/page.tsx:79` (`SITE_DESCRIPTION`)                                                                                                                                                                                                   | Fixed in #50                                                                                                                                 | —             |
| SEO-05 | P2  | Brand repeated in /about and /hosts titles, with no place keyword                                                                                                 | Live titles listed above                                                                                                                                                                                                                                             | Fixed in #50                                                                                                                                 | —             |
| SEO-06 | P2  | Thin landings: the category pages and /abha carry only an intro paragraph, and the grid is empty while there are 0 live listings                                  | Main-content words: AR categories 67–84, EN nature 99, EN women-only 79, `/ar/abha` 109, `/en/abha` 136                                                                                                                                                              | Open. Grows on its own once listings return; also add 2–3 paragraphs of editorial (what to wear, season, getting there)                      | Content       |
| SEO-07 | P2  | Slogan titles with no keyword                                                                                                                                     | `/ar/help` «أسئلتك، مجابة.», `/ar/how-it-works` «من التصفح إلى قمة الجبل.», `/ar/cancellation-policy` «الخطط تتغير. وهذا ما يحدث بالضبط.», `/ar/trust-and-safety` «احجز بثقة، وستجد عناية تليق بك.» (and the EN equivalents). These pages reuse the H1 as `<title>`. | Open. Next run: add `metaTitle` keys, e.g. «الأسئلة الشائعة — حجز التجارب في أبها» / "Help & FAQ — booking experiences in Abha"              | SEO routine   |
| SEO-08 | P2  | Host profile `/hosts/host` has a generic slug, and its English bio opens with a stray quote: `We" offers far more…`                                               | Live `/llms.txt` and `/en/hosts/host`                                                                                                                                                                                                                                | Open. Host-owned content; admin to correct the bio and pick a real slug (legacy-slug redirects already exist)                                | Ops           |
| SEO-09 | P2  | Lab LCP on the Arabic home page is 5.9 s, against 3.7 s on English. The LCP element is the hero sub-paragraph.                                                    | Lighthouse mobile, local build: AR Perf 62 / TBT 600 ms. EN Perf 80 / TBT 390 ms.                                                                                                                                                                                    | Open. Check whether the hero entrance animation (`RiseIn`/`FadeIn`) holds the paragraph at opacity 0. Lab only, so re-measure on production. | Eng           |
| SEO-10 | P2  | `/ar/experiences` (58 chars) and `/en/experiences` (68 chars) descriptions are under 70 chars                                                                     | Live head                                                                                                                                                                                                                                                            | Open. Next run.                                                                                                                              | SEO routine   |
| SEO-11 | P3  | robots.txt `LLM: https://gharmish.com/llms.txt` is a non-standard directive. Lighthouse SEO reports "robots.txt is not valid" (SEO score 85).                     | `app/robots.txt/route.ts:52`                                                                                                                                                                                                                                         | Open. Turn it into a comment (`# LLM: …`), which keeps the BRIEF §6 reference. Next run.                                                     | SEO routine   |
| SEO-12 | P3  | `og:locale` missing on every page below home, because each page's `openGraph` block drops the layout's                                                            | Live head of `/ar/abha`, `/ar/hosts`, categories, etc.                                                                                                                                                                                                               | Open                                                                                                                                         | SEO routine   |
| SEO-13 | P3  | Host JSON-LD types brand hosts (`aura`, `host`) as `Person`, and `hasCredential` is the English string "Verified host" on Arabic pages                            | Live `/ar/hosts/aura` JSON-LD                                                                                                                                                                                                                                        | Open                                                                                                                                         | Eng           |
| SEO-14 | P3  | Organization JSON-LD has no `sameAs`, `contactPoint` or `address`                                                                                                 | Live `/ar` JSON-LD                                                                                                                                                                                                                                                   | Open. Needs the official social profile URLs.                                                                                                | Founder → Eng |
| SEO-15 | P3  | `/experiences` body streams in after a loading skeleton. Crawlers that don't run JS see the skeleton first, and the real content sits in a deferred hidden block. | Live `/ar/experiences` `<main>` opens with `<template id="B:1">` plus skeleton                                                                                                                                                                                       | Note only. Googlebot renders it fine.                                                                                                        | —             |
| SEO-16 | P3  | Lighthouse a11y: color-contrast on the home page and heading-order on category pages                                                                              | Local Lighthouse (a11y 96–98)                                                                                                                                                                                                                                        | Open                                                                                                                                         | Eng           |

**Verified healthy (no finding):**

- robots.txt allows `/{ar,en}/hosts` and `/hosting` and disallows the 8 private prefixes.
- sitemap.xml returns 200 with 44 URLs. Every entry carries en, ar and x-default alternates. It contains 0 experience URLs, matching 0 `live` rows, and no paused or draft slug. All 4 `verified` hosts are present, and the pending and suspended hosts are absent. Static pages carry no lastmod.
- llms.txt returns 200 `text/plain`.
- All 31 public page-locales return 200 with a correct `lang`/`dir`, exactly one `<h1>`, an absolute self-canonical, and 3 hreflang links matching the sitemap.
- `/en/me`, `/en/wishlist`, `/en/sign-in`, `/en/host` and `/en/admin` are all `noindex, nofollow` and disallowed. `/en/dev` returns 404.
- Unknown slugs under `/experiences` and `/hosts` return a real 404 with noindex.
- `www.` → apex and `http://` → `https://` are each a single 308.
- `/ar/opengraph-image` and `/en/hosts/aura/opengraph-image` both return `200 image/png`.
- All JSON-LD blocks parse. FAQPage appears only on `/hosting` and `/help`, where the FAQ is rendered on the page. Breadcrumbs have 3 levels on category and host pages.

## Regressions since last run

None measurable, because this is the first run. Commits since 2026-10-04 that touched the watched paths (`c9460d9`, `0e1ef06`, `b341775`) only changed booking, wallet and terms copy. None touched metadata, robots, the sitemap or JSON-LD. **Note:** SEO-02 appeared without any code change: it started when every listing was paused on 2026-10-01.

## Organic traffic and demand gaps

Source: `analytics_events`, `type = 'page_view'`, `referrer_host` matching google, bing, duckduckgo, yandex or yahoo.

| Window          | AR  | EN  | Total | WoW  |
| --------------- | --- | --- | ----- | ---- |
| Last 7 days     | 0   | 4   | **4** | −50% |
| Previous 7 days | 3   | 5   | 8     | —    |

Top organic landing paths (14 days): `/` 9, `/hosts/[slug]` 3. Every organic visit came from `google.com`. Total page views in the last 7 days: AR 76, EN 253. The `locale` column also records scanner paths (`xmlrpc.php`, `.env`) and referrer spam (backlink-farm domains); [#16 Plan N3](https://github.com/Gharmish/FWEXMP/issues/16) covers cleaning that traffic.

**Zero-result searches (28 days, top entries):** almost all are category filters (`category=nature&originals=1` ×22, `women_only` ×5, `adventure` ×4, `nature` ×3…). These come from having 0 live listings, not from content gaps. Free-text gaps: `aura` ×3 (a host name; search doesn't match host names) and `خيل` (horse) ×2.

## SERP presence

Source is WebSearch excerpts, not Google rankings, so ★ marks every claim.

| Keyword                                     | gharmish.com seen?                     | Who holds the excerpts                                                                                     |
| ------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `site:gharmish.com`                         | No ★ (0 domain results in the excerpt) | —                                                                                                          |
| تجارب أبها                                  | Not found in the first excerpts ★      | platinumlist.net, sabq.org                                                                                 |
| أنشطة في أبها                               | Not found ★                            | excursionmania.com, okaz, platinumlist, saudipedia                                                         |
| سياحة عسير تجارب                            | Not found ★                            | News sites (ajel, sabq, alwatan, okaz)                                                                     |
| things to do in Abha                        | Not found ★                            | laurewanders.com, Expedia, listmag, hotelscombined                                                         |
| Abha experiences                            | Not found ★                            | **book.visitsaudi.com** (incl. "Experience Abha Like a Local: visit a traditional Asiri home"), Expedia    |
| Aseer tours                                 | Not found ★                            | Expedia, euronews, listmag, rihlattravelnews                                                               |
| Soudah tours                                | Not found ★                            | Expedia, platinumlist, Rezdy, AAA                                                                          |
| رحلات السودة                                | Not found ★                            | Results are about Sudan (السودان), so the term is ambiguous. «جبل السودة رحلة» is the better tracked term. |
| _New:_ ركوب الخيل أبها (from the `خيل` gap) | Not found ★                            | Airbnb Experiences (Morocco), news                                                                         |
| _New:_ women only hiking Abha               | Not found ★                            | visitsaudi.com stories, Gulf News                                                                          |
| _New:_ غارميش تجارب (brand)                 | Not found ★                            | Unrelated (the proxy reads it as Garmisch)                                                                 |

The 9 Google visits to `/` over 14 days show the home page is indexed on Google, even though the proxy doesn't surface it.

## Performance signals

| Page (local build, Lighthouse 12 mobile) | Perf | SEO\* | A11y | LCP   | CLS   | TBT    |
| ---------------------------------------- | ---- | ----- | ---- | ----- | ----- | ------ |
| `/ar`                                    | 62   | 85    | 96   | 5.9 s | 0.001 | 600 ms |
| `/en`                                    | 80   | 85    | 96   | 3.7 s | 0.001 | 390 ms |
| `/ar/experiences/nature`                 | 80   | 85    | 98   | 5.1 s | 0.001 | 120 ms |

\*Two things cap the SEO score: the robots.txt `LLM:` line (SEO-11, real), and a canonical that points at gharmish.com while the test runs on localhost (expected).

- **Experience page:** not measured, because there are 0 live listings and no detail page renders.
- **TTFB, local, median of 5:** `/ar` 57 ms, `/ar/experiences` 42 ms. **Production TTFB is not measured**, because the sandbox proxy blocks direct requests.
- **Static checks:** fonts preload only for the current locale (`app/[locale]/layout.tsx`, PERF-05). Marketing pixels stay consent-gated. CLS is about 0.
- **Vercel:** 3 runtime-error groups in 7 days. Two are admin `DeadlineError`s, a known nuisance. One is a single transient pooler drop on `/[locale]/experiences/[slug]` on 2026-10-05, which isn't an SEO issue. 0 failed deployments since 2026-09-17.
- **Vercel Web Analytics:** not measured. The API returns `404 Web Analytics not found` for the project, even though `@vercel/analytics` is mounted in the layout.

## Deferred and accepted items

| Item                                                                                        | Status                                                                                                                  |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `force-dynamic` locale layout with no root `loading.tsx` (no ISR/CDN for anonymous traffic) | Owner decision, kept so 404s stay real. Caching improvements are deferred, never a P0.                                  |
| Experience photography                                                                      | Photos were quarantined in 2026-08 on purpose. The fix is a photo shoot (owner task). No stock photos will be restored. |
| x-default → Arabic                                                                          | Owner decision, verified on all 31 pages                                                                                |
| Host slugs `asir-adventures-co` and `asiri-coffee-*`, the "Aseer" spelling                  | Kept on purpose                                                                                                         |
| `accepted:` list                                                                            | Empty (first run)                                                                                                       |

## Decisions for the founder

1. **Verify Google Search Console and Bing Webmaster Tools.** The site has no `google-site-verification` meta, and `verification` in `app/[locale]/layout.tsx` has only Facebook and Saudi Business Center. Verification would give real queries, impressions and index coverage; everything in "Visibility" is a proxy until then. Add the token in `verification.google` and submit `https://gharmish.com/sitemap.xml`. This item stays here each week until it's done.
2. **Bring at least one listing back to `live`.** Every landing page (7 categories, `/abha`, `/experiences`) is currently an intro over an empty grid, so the 12 SEO pages have nothing to rank with. This is the same item as [#9 PM P1](https://github.com/Gharmish/FWEXMP/issues/9). Raised here only because it caps Content and Indexability.
3. **Fix the `/hosts/host` profile** (SEO-08). It needs a real slug (for example, the brand name in Latin letters) and a corrected English bio. This is admin data, not code.

## Next-run watchlist

- PR #50 merged and deployed. Re-check live `/ar` og:image, the review-strip links and category description lengths.
- SEO-07, SEO-10 and SEO-11 (slogan titles, short catalog descriptions, robots `LLM:` line) are the planned fixes for next run.
- The first listing back to `live`: confirm it reaches the sitemap within an hour, gets a Product JSON-LD with `offers.priceCurrency = SAR`, and returns `200 image/png` from `card.png`.
- AR home LCP: re-measure, and test the hero entrance animation hypothesis.
- Organic visits: last week 4. Watch whether AR stays at 0.
- Track «جبل السودة رحلة» in place of «رحلات السودة».
