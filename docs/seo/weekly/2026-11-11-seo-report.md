# SEO weekly report: 2026-11-11

> **الملخص:** التقييم 80/100 (دون تغيير). لا تراجعات هذا الأسبوع: الإنتاج يعمل على أحدث نسخة، وخريطة الموقع مطابقة لقاعدة البيانات، ولا أخطاء تشغيل منذ 7 أيام. تضاعفت الزيارات العضوية إلى 8 (مقابل 4)، لكنها كلها على الصفحات الإنجليزية.
> **الجديد:** إصلاح واحد آمن (#342) يضيف وسم اللغة البديلة `og:locale:alternate` إلى الصفحات العامة كلها. وما زال تفعيل Google Search Console هو العائق الأكبر، وما زالت خلاصة TikTok تصف التجارب بأنها «متوفرة» (#303).

**HEAD audited:** `fe7578a3c27a35a58994e48915b8549b971f57a3` (`main`). Production deployment `dpl_6SGqjvkMMtrhyWspcNctah7deYMe` is READY on this exact SHA.
**Catalog state:** unchanged since 2026-10-12. There are 8 `live` experiences, all with an empty `availability_weekdays` (live but unbookable, an owner decision), and 1 draft. Hosts: 4 `verified`, 1 `pending` and 1 `suspended`.

| Surface                                                                                                                                                                           | Source                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| robots.txt, sitemap.xml (cache-busted), llms.txt, `/ar`, `/ar/experiences/an-evening-with-the-flower-men`, a `card.png` OG image, a host 404 probe, the legacy host-slug redirect | **Production** via the Vercel connector. Direct `curl` still fails with `CONNECT tunnel failed, response 403`. |
| All 54 sitemap page-locales, 62 internal links, 18 og:image URLs, private pages, Lighthouse, TTFB                                                                                 | **Local** production build (`pnpm build && pnpm start`, sample-data mode)                                      |
| Traffic, search demand, catalog                                                                                                                                                   | Production DB (read-only SELECT)                                                                               |

## Needs the founder today

Nothing is 🔴.

## Scorecard

| Area                 | Score  | Δ     | Deductions                                                                                                                                               |
| -------------------- | ------ | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Crawlability         | 98     | 0     | `/experiences` main content streams in behind a skeleton (SEO-15, −2).                                                                                   |
| Indexability         | 95     | 0     | No GSC (−5). The sitemap regenerated (`last-modified` 2026-11-10 14:34 UTC) and matches the DB.                                                          |
| Metadata             | 96     | 0     | `/en/hosts/host` data (−4, SEO-08). SEO-30 is fixed in #342, but the score only rises once it's live.                                                    |
| Structured data      | 93     | 0     | The TikTok feed says `in stock` (−3, SEO-39 / #303). No `sameAs` (−2, SEO-14). `aura` and `host` are typed `Person` (−2).                                |
| Bilingual / hreflang | 98     | 0     | hreflang matches the sitemap on 54 of 54. `/en/hosts/host` shows an Arabic name (−1). English-only reviews appear on AR host pages (−1).                 |
| Content              | 74     | 0     | No first-party photos (−10). `/hosts/host` is thin (−6). SAR 5 price (−5, SEO-26). AR title grammar (−3, SEO-27). No nature Original (−2).               |
| Performance          | 75     | 0     | **Held.** `benchmarkIndex` was 2,339–2,936, against 2,171–2,546 last week, so the lab numbers aren't comparable. No code change touched rendering.       |
| Visibility           | 14     | +2    | **8 organic visits** against 4. Still not found for any tracked keyword ★, and the brand query returns unrelated "Gharmi" and "Qurmish" pages ★. No GSC. |
| **Overall**          | **80** | **0** | Mean of the 8 areas is 80.4, against 80 on 2026-11-04.                                                                                                   |

## Fixed this run

**PR #342 "SEO fixes – 2026-11-11"** (NORMAL risk, `pnpm scan` green, 2,535 tests).

| ID     | Fix                                                                                                                                                       | Before                       | After (local build)                             |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ----------------------------------------------- |
| SEO-30 | `ogAlternateLocaleFor()` in `lib/i18n.ts`, and `alternateLocale` on 14 public `page.tsx` files. The structural test is `app/og-locale-alternate.test.ts`. | 0 of 54 page-locales have it | **54 of 54** (`/ar` → `en_US`, `/en` → `ar_SA`) |

There's no HIGH-risk PR this run. Nothing in robots, the sitemap, the layout or config needed changing.

## Findings by severity

| ID     | Sev | Finding                                                   | Evidence (this run)                                                                                                                                                              | Status / owner                                |
| ------ | --- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| SEO-39 | P1  | The TikTok feed says `in stock` for every live listing    | `app/api/catalog/tiktok.csv/route.ts` is unchanged since 2026-10-29 (`git log`). The DB has 8 of 8 live listings with empty weekdays. Production Product JSON-LD says `SoldOut`. | Open, #303 (HIGH-risk, engineering)           |
| SEO-08 | P2  | `/hosts/host` profile data                                | Live `/llms.txt`: an Arabic name «رحلات وعي» on the EN entry, a bio that opens `We" offers…`, and 0 live experiences                                                             | Open, host data (admin)                       |
| SEO-09 | P2  | AR home lab LCP is above EN                               | Median `/ar` 3.8 s against `/en` 3.6 s. The gap is 0.2 s (0.4 s last week).                                                                                                      | Open, watching                                |
| SEO-26 | P2  | `asiri-coffee-ritual-and-saleeg-lunch` is priced at SAR 5 | Live `/llms.txt`: "Price: SAR 5 per person"                                                                                                                                      | Open, owner (pricing)                         |
| SEO-30 | P3  | No `og:locale:alternate`                                  | Production `/ar` has `og:locale` only                                                                                                                                            | **Fixed in #342**, verify live next run       |
| SEO-13 | P3  | Brand hosts are typed `Person`                            | `app/[locale]/(site)/hosts/[slug]/page.tsx`, unchanged                                                                                                                           | Open                                          |
| SEO-14 | P3  | Organization has no `sameAs`                              | Absent on production `/ar`. The repository has no official social profile URL to cite.                                                                                           | Open. Needs the owner to supply profile URLs. |
| SEO-15 | P3  | `/experiences` streams behind a skeleton                  | Local: 0 words in `<main>` in the initial HTML on both locales                                                                                                                   | Open, deferred (caching trade-off)            |
| SEO-16 | P3  | a11y                                                      | Lighthouse a11y: home 96, experience 97, category 100                                                                                                                            | Open                                          |
| SEO-27 | P3  | The AR title mixes grammatical gender                     | `plant-play-and-enjoy-a-barbecue-with-a-chef-dnrp9e` (host data)                                                                                                                 | Open, host data                               |
| SEO-28 | P3  | The home h1 runs into the rotating word list              | `app/[locale]/(site)/page.tsx`, unchanged                                                                                                                                        | Open                                          |
| SEO-29 | P3  | The language switcher keeps the query string              | Unchanged                                                                                                                                                                        | Open                                          |
| SEO-31 | P3  | The 404 shell has no `lang`/`dir` and no h1               | Live `/ar/hosts/zzzz-not-a-host`: 404 with `noindex`, `<html id="__next_error__">`, 0 h1                                                                                         | Open, tied to the `force-dynamic` decision    |
| SEO-33 | P3  | Referrer spam logged as page views                        | This week: `lorentius.com` and `vagonite.com` ×1 each, down from 16 spam views last week                                                                                         | Open                                          |
| SEO-36 | P3  | `/hosting` links to `/host/apply` (disallowed, 307)       | Local: `/{en,ar}/host/apply` → 307. These are the only 2 non-200s among 62 internal links.                                                                                       | Open, by design                               |
| SEO-37 | P3  | Bare `/` falls back to `/en` without `Accept-Language`    | Unchanged                                                                                                                                                                        | Open                                          |
| SEO-40 | P3  | An Arabic place name in the English feed                  | Live `/llms.txt`: `plant-play-…-dnrp9e` "Place: حي المنسك, Abha"                                                                                                                 | Open, host data                               |

**No new findings this run.** No new issue was opened, and #303 stays the single open `seo` issue.

**Verified healthy this run:**

- **Production robots.txt** allows `/{ar,en}/hosts` and `/{ar,en}/hosting`, disallows the 8 private prefixes in both locales, and has `Sitemap: https://gharmish.com/sitemap.xml`.
- **Production sitemap** (cache-busted) has 54 URLs, each with en, ar and x-default (→ `/ar`). It lists exactly the 8 `live` slugs and the 4 `verified` hosts. The draft `…-copy-uwb2cp`, the pending `mountain-roots-collective` and the suspended `sarawat-expeditions` are absent. `lastmod` appears only on experiences and hosts.
- **Production `/llms.txt`** returns 200 `text/plain` with 8 experiences and 4 hosts, each with EN and AR URLs.
- **Production `/ar/experiences/an-evening-with-the-flower-men`:**
  - `lang="ar" dir="rtl"`, one h1, a self-canonical, and hreflang identical to the sitemap.
  - Product `offers` has `SAR`, `SoldOut` and `url`.
  - `aggregateRating` shows 1 review, with an Arabic `reviewBody`.
  - BreadcrumbList has 3 levels.
- **Review dates (#311):** the review `datePublished` is now the Riyadh day (`2026-05-13`).
- **Production `/ar`:** Organization (`contactPoint`, `address`, Arabic `areaServed`), WebSite and ItemList (8 items) are all present.
- **Production `card.png`** for `soudah-cliff-via-ferrata` returns `200 image/png`. Locally, 18 of 18 og:image URLs return `200 image/png`.
- **Local crawl, 54 of 54 page-locales:**
  - All return 200 with the correct `lang`/`dir` and exactly one h1.
  - Titles and descriptions are within length, with no duplicates and no truncated descriptions.
  - Every page is self-canonical, and hreflang matches the sitemap.
  - OG and twitter tags are present, every JSON-LD block parses, and no `<img>` lacks `alt`.
- **Private pages:** `/en/me`, `/en/wishlist`, `/en/sign-in`, `/en/dev` and `/ar/me` are `noindex, nofollow`. `/en/host` and `/en/admin` 307 to sign-in. `/en/book/x` returns 404 with `noindex`. All are disallowed in robots.txt.
- **404s and redirects:** 404s are real (live `/ar/hosts/zzzz-not-a-host`, local `/en/experiences/zzzz-nope`). The legacy `/en/hosts/faisal-al-qahtani` resolves to `/en/hosts/abdulaziz-alasmari` (200, self-canonical).
- **Verification tags:** `app/[locale]/layout.tsx:76-85` is unchanged (Facebook and Saudi Business Center tags, no Google).
- **Not checked:** http→https and apex/www redirects. The connector follows same-origin redirects only, and direct `curl` is blocked.

## Regressions since last run

`git log 8b89113..fe7578a` has 14 commits (5 merged PRs). The SEO-relevant ones:

| Change                                                                                                          | Effect                                         |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| #311: review JSON-LD `datePublished` uses the Riyadh day, extracted to `features/reviews/lib/review-json-ld.ts` | Intended. Verified live. Same shape as before. |
| #310 and #319: host-experiences read and duplicate guards                                                       | Host dashboard only. No public surface.        |
| #304, #312, #321: docs only                                                                                     | None                                           |

**No regressions.**

## Organic traffic and demand gaps

| Window (rolling, to 04:05 UTC) | AR  | EN  | Total | WoW     |
| ------------------------------ | --- | --- | ----- | ------- |
| Organic, last 7 days           | 0   | 8   | **8** | +4 (×2) |
| Organic, previous 7 days       | 0   | 4   | 4     | —       |

- **Sources:** google.com ×6, bing.com ×1 and duckduckgo.com ×1 (new). 7 landed on `/` and 1 on a host profile (`/hosts/[slug]`, the first organic landing below the home page). There is still no Arabic organic visit.
- **All page views:** 346, against 427 (−19%). **Arabic fell from 114 to 60 (−47%)**, and English fell from 313 to 286. 335 of the 346 have no referrer, so the cause of the Arabic drop is not visible here. It's probably the end of a direct or social push rather than search. Watch it next run.
- **Zero-result searches (28 days):** `category=nature&originals=1` ×11 (last seen 2026-10-14, now ageing out) and the bot `q={search_term_string}` ×1. There are no free-text zero-result queries, so no new keyword seeds.

## SERP presence (★ = from search excerpts only)

| Keyword              | gharmish.com seen? | Who holds the excerpts                                                                                                                 |
| -------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `site:gharmish.com`  | No ★               | Operator not honoured. Unrelated results (Hugging Face, GitHub, semrush harmash.com).                                                  |
| «gharmish غارميش»    | Not found ★        | Gharmi people (Wikipedia mirrors), Qurmish (Iran), Gharm. Garmisch-Partenkirchen has dropped out.                                      |
| تجارب أبها           | Not found ★        | holafly blog, sabq, alwatan, saudiauto (karting), platinumlist                                                                         |
| أنشطة في أبها        | Not found ★        | excursionmania, alyaum, sabq, platinumlist                                                                                             |
| سياحة عسير تجارب     | Not found ★        | alwatan, ajel, arabic.slowfood.com (Aseer food route PDF), sabq                                                                        |
| things to do in Abha | Not found ★        | Expedia (many country sites), smartertravel, laurewanders, Travelocity, listmag, thrillophilia, flydubai                               |
| Abha experiences     | Not found ★        | **book.visitsaudi.com** (home visit), **tickets.jarir.com**, remotelands, **experiencesbyroam.com** (new), trip.com, discoveraseer.com |
| Aseer tours          | Not found ★        | Expedia, ootlah, book.visitsaudi.com, discoveraseer.com, euronews, listmag                                                             |
| Soudah tours         | Not found ★        | Expedia, **seyaha.net** (new), platinumlist, rezdy, lokalee                                                                            |
| رحلات السودة         | Not found ★        | alukah, sabq, excursionmania. Editorial and off-topic (Sudan), no booking platform.                                                    |

## Performance signals

| Page (local, Lighthouse 12 mobile, median of 3) | Perf | SEO | A11y | LCP   | CLS   | TBT    | benchmarkIndex |
| ----------------------------------------------- | ---- | --- | ---- | ----- | ----- | ------ | -------------- |
| `/ar`                                           | 80   | 100 | 96   | 3.8 s | 0     | 371 ms | 2,616–2,936    |
| `/en`                                           | 83   | 100 | 96   | 3.6 s | 0     | 326 ms | 2,347–2,680    |
| `/ar/experiences/soudah-cliff-via-ferrata`      | 73   | 100 | 97   | 4.0 s | 0.001 | 616 ms | 2,339–2,683    |
| `/ar/experiences/nature`                        | 74   | 100 | 100  | 4.2 s | 0     | 503 ms | 2,462–2,764    |

- **Held at 75.** The sandbox was faster again (`benchmarkIndex` up to 2,936 against 2,546). LCP is flat to slightly better. TBT on the experience page rose from 379 to 616 ms and on the category page from 212 to 503 ms. No rendering code changed (`git log`), so this is treated as lab noise. It goes on the watchlist, not in the score.
- **TTFB, local, median of 5:** `/ar` 32 ms and `/ar/experiences` 28 ms. Production TTFB is not measured because the proxy blocks direct requests.
- **Static checks:** there's no third-party `<script src>` in the initial HTML, and the marketing pixels stay consent-gated. CLS is ≤ 0.001 in all 12 runs.
- **Vercel runtime errors (7 days): none.** The `ADMIN_ALERT_WHATSAPP` config-check flood from last week (#247) has not recurred.
- **Deployments:** the last 6 production deploys are all READY, and production is on HEAD.

## Deferred and accepted items

| Item                                                            | Status                                                                                       |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `force-dynamic` locale layout, no root `loading.tsx`            | Owner decision, kept so 404s stay real. Caching is deferred, never a P0 (SEO-15 and SEO-31). |
| Experience photography                                          | Quarantined since 2026-08. The fix is a photo shoot (owner task).                            |
| x-default → Arabic                                              | Owner decision. Verified on 54 of 54.                                                        |
| Live but unbookable listings (empty weekdays)                   | Owner decision. JSON-LD is honest (`SoldOut`). The feed isn't (SEO-39, #303).                |
| `asir-adventures-co` / `asiri-coffee-*` slugs, "Aseer" spelling | Kept on purpose                                                                              |
| `accepted:` list                                                | Empty                                                                                        |

## Decisions for the founder

1. **Verify Google Search Console and Bing Webmaster Tools.** `verification` in `app/[locale]/layout.tsx:76` still has no `google` key. Organic visits doubled to 8, and one now lands below the home page, but the queries behind them are invisible. This is a standing item.
2. **Review #303 (TikTok feed availability).** Until it lands, the feed advertises 8 listings that have no bookable date. If no TikTok catalog ads are running, pausing the catalog sync is the zero-code alternative.
3. **Share the official social profile URLs** (Instagram, X, TikTok, if they exist). That lets SEO-14 add `sameAs` to the Organization JSON-LD, which helps Google tie the brand name to the site. The brand query still returns unrelated pages ★.

## Next-run watchlist

- #342: confirm `og:locale:alternate` is live on production `/ar` and `/en`, then close SEO-30.
- Arabic page views fell 47% week over week. Check whether it recovers, and what the referrer mix looks like.
- Lab TBT on experience and category pages (616 and 503 ms). Re-measure at a similar `benchmarkIndex`.
- #303: once the route changes, confirm `out of stock` for empty-weekday listings and retire SEO-39.
- SERP: experiencesbyroam.com and seyaha.net are new holders for "Abha experiences" and "Soudah tours".
