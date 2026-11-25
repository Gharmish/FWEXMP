# SEO weekly report: 2026-11-25

> **الملخص:** التقييم 80/100 (دون تغيير). لا تراجعات: إعادة تصميم صفحة التجربة والبطاقة (#426) حافظت على العنوان والوصف ووسم canonical وhreflang وبيانات Product المنظَّمة، وخريطة الموقع مطابقة لقاعدة البيانات (8 تجارب و4 مضيفين). وأصلح #430 تصنيف أسماء الشركات العربية في بيانات المضيف المنظَّمة.
> **ما يحتاج انتباهك:** لم تصل أي زيارة عضوية هذا الأسبوع (0 مقابل 3)، وما زال تفعيل Google Search Console هو العائق الأكبر. وما زال #305 (إصلاح خلاصة TikTok) بانتظار المراجعة منذ 3 أسابيع.

**HEAD audited:** `504f4e3e5260a74fdc331ae04ce9decb6a9c78b5` (`main`). Production deployment `dpl_GdmzQRoQT1icZs5Enb7TTfCq3cAD` is READY on this exact SHA, and CI on it is green.
**Catalog state:** unchanged since 2026-10-12. There are 8 `live` experiences, all with an empty `availability_weekdays` (live but unbookable, an owner decision), and 1 draft. Hosts: 4 `verified`, 1 `pending` and 1 `suspended`.

| Surface                                                                                                                                                                                                   | Source                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| robots.txt, sitemap.xml (cache-busted), llms.txt, `/ar`, `/ar/experiences/soudah-cliff-via-ferrata` and its `card.png`, `/en/hosts/asir-adventures-co` and its `opengraph-image`, an experience 404 probe | **Production** via the Vercel connector. Direct `curl` still fails with `CONNECT tunnel failed, response 403`. |
| All 54 sitemap page-locales, 62 internal links, 18 og:image URLs, private pages, redirects, Lighthouse, TTFB                                                                                              | **Local** production build (`pnpm start`)                                                                      |
| Traffic, search demand, catalog                                                                                                                                                                           | Production DB (read-only SELECT)                                                                               |

**Local build note:** `pnpm build` compiled and wrote `.next`, then exited 1 with the same `SecurityFatalError` on Next.js 16.4.3 as last week. The output served normally. The Next.js bump is open as #338 (`[high-risk]`, not SEO-owned). `pnpm audit --prod --audit-level=high` now **passes** (9 moderate, 0 high), so the picomatch blocker in #385 no longer reproduces locally.

## Needs the founder today

Nothing is 🔴.

## Scorecard

| Area                 | Score  | Δ     | Deductions                                                                                                                                                                                                  |
| -------------------- | ------ | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Crawlability         | 98     | 0     | `/experiences` main content streams in behind a skeleton (SEO-15, −2).                                                                                                                                      |
| Indexability         | 95     | 0     | No GSC (−5). The sitemap regenerated on fetch (`last-modified` 2026-11-25 04:02 UTC) and matches the DB.                                                                                                    |
| Metadata             | 97     | 0     | `/en/hosts/host` data (−3, SEO-08).                                                                                                                                                                         |
| Structured data      | 94     | +1    | #430 fixed the dead Arabic branch of the Organization heuristic (half of SEO-13). The TikTok feed says `in stock` (−3, SEO-39 / #303). No `sameAs` (−2, SEO-14). `aura` and `host` are still `Person` (−1). |
| Bilingual / hreflang | 98     | 0     | hreflang matches the sitemap on 54 of 54. `/en/hosts/host` shows an Arabic name (−1). English-only reviews appear on AR pages (−1).                                                                         |
| Content              | 74     | 0     | No first-party photos (−10). `/hosts/host` is thin (−6). SAR 5 price (−5, SEO-26). AR title grammar (−3, SEO-27). No nature Original (−2).                                                                  |
| Performance          | 75     | 0     | **Held.** The sandbox `benchmarkIndex` is about 1,600, against about 3,000 last week (half the CPU), so lab numbers can't be compared. See Performance below.                                               |
| Visibility           | 10     | −2    | **0 organic visits**, against 3. Still not found for any tracked keyword ★. No GSC.                                                                                                                         |
| **Overall**          | **80** | **0** | Mean of the 8 areas is 80.1, against 80.25 on 2026-11-18.                                                                                                                                                   |

## Fixed this run

**No fix PR this run.**

- No open P0 to P2 finding has a safe code fix. SEO-39 already has its fix in #305 (`[high-risk]`). SEO-08 and SEO-26 are host data and pricing. SEO-09 is lab-only and can't be measured this week (slow sandbox).
- The only code-fixable items left are P3 polish (SEO-28, SEO-29). The local `pnpm build` step is red for a reason unrelated to SEO (#338), so `pnpm scan` can't be green before a push.

## Findings by severity

| ID     | Sev | Finding                                                    | Evidence (this run)                                                                                                                                                                                                                                                                                 | Status / owner                                                                     |
| ------ | --- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| SEO-39 | P1  | The TikTok feed says `in stock` for every live listing     | `app/api/catalog/tiktok.csv/route.ts` is unchanged since `46fcd7a` (2026-10-29). The DB has 8 of 8 live listings with empty weekdays. Production Product JSON-LD says `SoldOut`, and the new cards show "Dates soon".                                                                               | Open, #303. The fix is in #305 (`[high-risk]`), waiting for the owner for 3 weeks. |
| SEO-08 | P2  | `/hosts/host` profile data                                 | Live `/llms.txt`: an Arabic name «رحلات وعي» on the EN entry, a bio that opens `We" offers…`, and 0 live experiences                                                                                                                                                                                | Open, host data (admin)                                                            |
| SEO-09 | P2  | AR home lab LCP is above EN                                | **Not comparable this run.** Median `/ar` 4.8 s and `/en` 4.7 s on a sandbox at half last week's CPU                                                                                                                                                                                                | Open, watching                                                                     |
| SEO-26 | P2  | `asiri-coffee-ritual-and-saleeg-lunch` is priced at SAR 5  | Live `/llms.txt`: "Price: SAR 5 per person"                                                                                                                                                                                                                                                         | Open, owner (pricing)                                                              |
| SEO-13 | P3  | Brand hosts are typed `Person`                             | **Partly fixed by #430:** `features/hosts/lib/organization-name.ts:11` now matches شركة/الشركة with Unicode boundaries. Production `/en/hosts/asir-adventures-co` is `Organization`. «AURA\| أورا» (`aura`) and «رحلات وعي» (`host`) carry no company term, so they stay `Person`.                  | Open. The real signal (CR identity) lives in `host_applications`.                  |
| SEO-14 | P3  | Organization has no `sameAs`                               | Absent on production `/ar`                                                                                                                                                                                                                                                                          | Open. Needs the owner to supply profile URLs.                                      |
| SEO-15 | P3  | `/experiences` streams behind a skeleton                   | Unchanged                                                                                                                                                                                                                                                                                           | Open, deferred (caching trade-off)                                                 |
| SEO-16 | P3  | a11y                                                       | Lighthouse a11y: home 96, experience 97, category 100 (unchanged after #426)                                                                                                                                                                                                                        | Open                                                                               |
| SEO-27 | P3  | The AR title mixes grammatical gender                      | `plant-play-and-enjoy-a-barbecue-with-a-chef-dnrp9e` (host data)                                                                                                                                                                                                                                    | Open, host data                                                                    |
| SEO-28 | P3  | The home h1 runs into the rotating word list               | Unchanged (#426 changed one line in `app/[locale]/(site)/page.tsx`, not the hero)                                                                                                                                                                                                                   | Open                                                                               |
| SEO-29 | P3  | The language switcher keeps the query string               | Unchanged                                                                                                                                                                                                                                                                                           | Open                                                                               |
| SEO-31 | P3  | The 404 shell has no `lang`/`dir` and no h1                | Live `/ar/experiences/zzzz-not-a-listing-20261125`: 404, `<html id="__next_error__">`, `noindex`                                                                                                                                                                                                    | Open, tied to the `force-dynamic` decision                                         |
| SEO-33 | P3  | Referrer noise logged as page views                        | This week: `dataslug.com` ×1 on `/` (EN). The Vercel edge IPs from last week are gone.                                                                                                                                                                                                              | Open                                                                               |
| SEO-36 | P3  | `/hosting` links to `/host/apply` (disallowed, 307)        | Local `/en/host/apply` → 307 to sign-in with `noindex, nofollow`                                                                                                                                                                                                                                    | Open, by design                                                                    |
| SEO-37 | P3  | Bare `/` falls back to `/en` without `Accept-Language`     | Unchanged                                                                                                                                                                                                                                                                                           | Open                                                                               |
| SEO-40 | P3  | An Arabic place name in the English feed                   | Live `/llms.txt`: `plant-play-…-dnrp9e` "Place: حي المنسك, Abha"                                                                                                                                                                                                                                    | Open, host data                                                                    |
| SEO-41 | P3  | ISR revalidation of 2 experience pages hit the DB deadline | Vercel runtime errors (7 days): `experiences:detailBySlug:retry exceeded 8000ms deadline` ×2, both at 2026-11-24 10:54 UTC (`juniper-forest-dawn-walk-jabal-sawda`, `women-only-hike-yoga-and-sketching`, `.rsc` background revalidate). The stale copy keeps serving, so there is no crawl impact. | **New**, watching. Escalate if it recurs or reaches an HTML render.                |

**Closed this run:** none. SEO-13 shrinks from a code bug to a data question.

**No new issue opened.** #303 stays the single open `seo` issue. SEO-41 is P3 and stays in the report only.

**Verified healthy this run:**

- **Production robots.txt:**
  - allows `/{ar,en}/hosts` and `/{ar,en}/hosting`
  - disallows the 8 private prefixes in both locales
  - has `Sitemap: https://gharmish.com/sitemap.xml`
- **Production sitemap** (`?cb=20261125`, `x-vercel-cache: MISS`) has 54 URLs, each with en, ar and x-default (→ `/ar`).
  - It lists exactly the 8 `live` slugs and the 4 `verified` hosts.
  - The draft `…-copy-uwb2cp`, the pending `mountain-roots-collective` and the suspended `sarawat-expeditions` are absent.
  - `lastmod` appears only on experiences and hosts.
- **Production `/llms.txt`** returns 200 `text/plain` with 8 experiences and 4 hosts, each with EN and AR URLs.
- **Production `/ar`:**
  - `lang="ar" dir="rtl"`, one h1, a self-canonical, and en/ar/x-default hreflang
  - `og:image` `/ar/opengraph-image`
  - Organization, WebSite and ItemList (8 items) are present
- **Production `/ar/experiences/soudah-cliff-via-ferrata` after the #426 rewrite:**
  - one h1, `ar`/`rtl`, an Arabic title and description, a self-canonical, and hreflang identical to the sitemap
  - Product has `image` and `offers` of 540 `SAR`, `SoldOut` and `url`, with no `aggregateRating` (no reviews)
  - BreadcrumbList has 3 levels
  - `card.png` returns `200 image/png`
  - 9 `<img>`, all with `alt`. Hero gallery tiles use `alt=""` on purpose, because the tap layer carries the label.
- **Production `/en/hosts/asir-adventures-co`:** Organization and BreadcrumbList (3 levels), a self-canonical, and `opengraph-image` returning `200 image/png`
- **Local crawl, 54 of 54 page-locales:**
  - All return 200 with the correct `lang`/`dir` and exactly one h1.
  - Titles are 15–60 characters and descriptions 70–160, with no duplicates.
  - Every page is self-canonical, with 3 hreflang links matching the sitemap.
  - og:title, og:description, og:locale, og:image and `twitter:card` are present.
  - Every JSON-LD block parses, and no `<img>` lacks `alt`.
  - 18 of 18 og:image URLs return `200 image/png`, and 62 of 62 internal links resolve.
- **Private pages:** `/en/me`, `/en/wishlist`, `/en/sign-in`, `/en/dev` and `/ar/me` are `noindex, nofollow`. `/en/host` and `/en/admin` 307 to sign-in. `/en/book/x` returns 404 with `noindex`. All are disallowed in robots.txt.
- **404s and redirects:**
  - 404s are real: live `/ar/experiences/zzzz-not-a-listing-20261125`, and local `/en/experiences/zzzz-nope` and `/en/hosts/zzzz-nope`.
  - The legacy `/en/hosts/faisal-al-qahtani` 308s to `/en/hosts/abdulaziz-alasmari` in one hop.
- **Verification tags:** `app/[locale]/layout.tsx` is unchanged (Facebook and Saudi Business Center tags, no Google).
- **Not checked:** http→https and apex/www redirects. The connector follows same-origin redirects only, and direct `curl` is blocked.

## Regressions since last run

`git log aa96bb5..504f4e3` has 19 commits. The SEO-relevant ones:

| Change                                                                                                                                                                            | Effect                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| #426 (`9b884b9`): photo-led card and listing first screen. 845 lines in `app/[locale]/(site)/experiences/[slug]/page.tsx`, plus card, gallery, host byline and 5 new message keys | **No regression.** The metadata, JSON-LD, single h1, alt text and hreflang are all intact (production and 54-page local crawl). Message key parity holds. The new "Dates soon" chip matches `SoldOut`. |
| #430 (`c592dd5`): `isOrganizationName` with Unicode-aware Arabic boundaries                                                                                                       | Intended. Fixes the dead-code part of SEO-13.                                                                                                                                                          |
| `df0781a`, `ee54610`: the host-apply dashboard link and the admin bio placeholder                                                                                                 | No public SEO surface                                                                                                                                                                                  |

**No regressions.**

## Organic traffic and demand gaps

| Window (rolling, to 04:05 UTC) | AR  | EN  | Total | WoW        |
| ------------------------------ | --- | --- | ----- | ---------- |
| Organic, last 7 days           | 0   | 0   | **0** | −3 (−100%) |
| Organic, previous 7 days       | 0   | 3   | 3     | —          |

- **There were no search-engine referrals at all this week.** The only referrers were `tiktok.com` ×1 (AR, `/`, mobile) and `dataslug.com` ×1 (EN, spam, SEO-33).
- **All page views:** 426, against 391 (+9%).
  - Arabic held its recovery: 115, against 103 (+12%).
  - English rose to 311, against 288.
  - 424 of the 426 have no referrer.
- **Zero-result searches (28 days):** only the bot `q={search_term_string}` ×1 (2026-10-30). There are no free-text zero-result queries, so no new keyword seeds.

## SERP presence (★ = from search excerpts only)

| Keyword              | gharmish.com seen? | Who holds the excerpts                                                                                                   |
| -------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `site:gharmish.com`  | No ★               | Operator not honoured. Unrelated results (GitHub, Hugging Face, krishaweb).                                              |
| «gharmish غارميش»    | Not found ★        | Gharmi people (Wikipedia mirrors), Qurmish (Iran), Kūh-e Garmesh (geonames), Gharm                                       |
| تجارب أبها           | Not found ★        | holafly blog, alwatan, ajsrp blog, platinumlist, sabq, Wikipedia, saudipedia (new)                                       |
| أنشطة في أبها        | Not found ★        | excursionmania, platinumlist, alyaum                                                                                     |
| سياحة عسير تجارب     | Not found ★        | ajel, alwatan, arabic.slowfood.com (Aseer PDF), discoveraseer.com, sayidaty (new), sabq, al-jazirah                      |
| things to do in Abha | Not found ★        | Expedia (many country sites), trip.com, flydubai, smartertravel, Travelocity, mercure.accor.com (new)                    |
| Abha experiences     | Not found ★        | Expedia, trip.com, remotelands, wingie (new), **book.visitsaudi.com** (home visit), expatexchange, **tickets.jarir.com** |
| Aseer tours          | Not found ★        | Expedia, discoveraseer.com, visitsaudi.com, **book.visitsaudi.com**, euronews, ootlah, **peek.com** (new), wego blog     |
| Soudah tours         | Not found ★        | Expedia (many), Travelocity, seyaha.net, AAA tripcanvas (new), **tourhq.com** (new), dailytoursegypt                     |
| رحلات السودة         | Not found ★        | alukah, sabq, excursionmania. Editorial and off-topic (Sudan), no booking platform.                                      |

## Performance signals

| Page (local, Lighthouse 12 mobile, median of 3) | Perf | SEO | A11y | LCP   | CLS   | TBT    | benchmarkIndex |
| ----------------------------------------------- | ---- | --- | ---- | ----- | ----- | ------ | -------------- |
| `/ar`                                           | 72   | 100 | 96   | 4.8 s | 0     | 378 ms | 1,591–1,682    |
| `/en`                                           | 76   | 100 | 96   | 4.7 s | 0     | 327 ms | 1,376–1,735    |
| `/ar/experiences/soudah-cliff-via-ferrata`      | 75   | 100 | 97   | 4.4 s | 0     | 346 ms | 1,491–1,751    |
| `/ar/experiences/nature`                        | 77   | 100 | 100  | 4.2 s | 0.001 | 251 ms | 1,578–1,722    |

- **Held at 75.** The `benchmarkIndex` is about 1,600, against 2,850–3,180 last week, so the sandbox CPU is about half as fast. Higher TBT on every page fits that, so no regression is scored.
  - Even on the slower machine, LCP held or improved: `/ar` went from 5.0 to 4.8 s, the experience page held at 4.4 s after the #426 rewrite, and `/ar/experiences/nature` went from 5.3 to 4.2 s.
  - The AR/EN LCP gap (SEO-09) shrank to 0.1 s.
- **CLS:** ≤ 0.001 in all 12 runs, including the new photo-led experience page. Gallery and card images are `next/image` `fill` inside fixed-aspect frames, and the first gallery tile is `priority`.
- **TTFB, local, median of 5:** `/ar` 35 ms and `/ar/experiences` 30 ms. Production TTFB is not measured because the proxy blocks direct requests.
- **Vercel runtime errors (7 days):** the 2 `DeadlineError`s in SEO-41, and nothing else.
- **Deployments:** the last 6 production deploys are all READY, and production is on HEAD.

## Deferred and accepted items

| Item                                                            | Status                                                                                                                               |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `force-dynamic` locale layout, no root `loading.tsx`            | Owner decision, kept so 404s stay real. Caching is deferred, never a P0 (SEO-15 and SEO-31).                                         |
| Experience photography                                          | Quarantined since 2026-08. The fix is a photo shoot (owner task). #426 makes the photo slot more prominent, which raises the stakes. |
| x-default → Arabic                                              | Owner decision. Verified on 54 of 54.                                                                                                |
| Live but unbookable listings (empty weekdays)                   | Owner decision. JSON-LD (`SoldOut`) and the cards ("Dates soon") are honest. The feed isn't (SEO-39, #303, fix in #305).             |
| `asir-adventures-co` / `asiri-coffee-*` slugs, "Aseer" spelling | Kept on purpose                                                                                                                      |
| `accepted:` list                                                | Empty                                                                                                                                |

## Decisions for the founder

1. **Verify Google Search Console and Bing Webmaster Tools.** `verification` in `app/[locale]/layout.tsx` still has no `google` key. Organic visits reached 0 this week. Without GSC we can't tell an indexing problem from a demand problem. This is a standing item.
2. **Review #305, the fix for #303 (TikTok feed availability).** It has waited since 2026-11-04. Until it lands, the feed advertises 8 listings that have no bookable date, while the site itself now says "Dates soon".
3. **Share the official social profile URLs** (Instagram, X, TikTok). A TikTok referral arrived this week, so at least one profile is live. The URLs let SEO-14 add `sameAs` to the Organization JSON-LD.

## Next-run watchlist

- Lab performance: check `benchmarkIndex` first. Score only when it's back near 3,000.
- SEO-41: if `experiences:detailBySlug` deadline errors recur or hit an HTML render, escalate to P2.
- #385 / #391: the local `pnpm audit --audit-level=high` now passes. Confirm on CI and close the loop. #338 (Next.js bump) still makes the local `pnpm build` red.
- #305: once it merges, confirm `out of stock` for empty-weekday listings and retire SEO-39.
- Organic: 2 weeks of decline (8 → 3 → 0). If it's 0 again, check production `/ar` and `/en` for a crawl block before blaming demand.
- SERP: peek.com, tourhq.com and AAA tripcanvas are new holders for the Aseer and Soudah tour queries.
