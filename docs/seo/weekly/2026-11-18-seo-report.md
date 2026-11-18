# SEO weekly report: 2026-11-18

> **الملخص:** التقييم 80/100 (دون تغيير). لا تراجعات هذا الأسبوع: الإنتاج يعمل على أحدث نسخة، وخريطة الموقع مطابقة لقاعدة البيانات، ووسم `og:locale:alternate` (#342) يعمل الآن على الإنتاج. تعافت مشاهدات الصفحات العربية (103 مقابل 60)، لكن الزيارات العضوية تراجعت إلى 3 (مقابل 8)، كلها على الصفحات الإنجليزية.
> **لا إصلاحات هذا الأسبوع:** لم تُرصد مشكلة آمنة للإصلاح، وفحص `pnpm scan` أحمر حاليًا في كل الفروع بسبب ثغرة picomatch (#385). وما زال تفعيل Google Search Console هو العائق الأكبر، وما زالت خلاصة TikTok تصف التجارب بأنها «متوفرة» (#303، والإصلاح جاهز في #305).

**HEAD audited:** `aa96bb574fce6a76dcea8047f690a9e0ed4af932` (`main`). Production deployment `dpl_AaeokKRcsppx1ZBUu6Dsx1ogkR3s` is READY on this exact SHA.
**Catalog state:** unchanged since 2026-10-12. There are 8 `live` experiences, all with an empty `availability_weekdays` (live but unbookable, an owner decision), and 1 draft. Hosts: 4 `verified`, 1 `pending` and 1 `suspended`.

| Surface                                                                                                                                                                            | Source                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| robots.txt, sitemap.xml (cache-busted), llms.txt, `/ar`, `/en/experiences/soudah-cliff-via-ferrata`, `/ar/opengraph-image`, an experience 404 probe, the legacy host-slug redirect | **Production** via the Vercel connector. Direct `curl` still fails with `CONNECT tunnel failed, response 403`. |
| All 54 sitemap page-locales, 62 internal links, 18 og:image URLs, private pages, Lighthouse, TTFB                                                                                  | **Local** production build (`pnpm start`, sample-data mode)                                                    |
| Traffic, search demand, catalog                                                                                                                                                    | Production DB (read-only SELECT)                                                                               |

**Local build note:** `pnpm build` compiled, type-checked and wrote the full route table, then exited 1 with a `SecurityFatalError` flagging Next.js 16.4.3. The finished `.next` output served normally under `pnpm start`. The Next.js bump is already open as #338 (`[high-risk]`, not SEO-owned). CI on this SHA was green on 2026-11-17.

## Needs the founder today

Nothing is 🔴.

## Scorecard

| Area                 | Score  | Δ     | Deductions                                                                                                                                                  |
| -------------------- | ------ | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Crawlability         | 98     | 0     | `/experiences` main content streams in behind a skeleton (SEO-15, −2).                                                                                      |
| Indexability         | 95     | 0     | No GSC (−5). The sitemap regenerated (`last-modified` 2026-11-17 04:17 UTC) and matches the DB.                                                             |
| Metadata             | 97     | +1    | SEO-30 is live on production (`og:locale:alternate`). `/en/hosts/host` data (−3, SEO-08).                                                                   |
| Structured data      | 93     | 0     | The TikTok feed says `in stock` (−3, SEO-39 / #303). No `sameAs` (−2, SEO-14). `aura` and `host` are typed `Person` (−2, SEO-13).                           |
| Bilingual / hreflang | 98     | 0     | hreflang matches the sitemap on 54 of 54. `/en/hosts/host` shows an Arabic name (−1). English-only reviews appear on AR host pages (−1).                    |
| Content              | 74     | 0     | No first-party photos (−10). `/hosts/host` is thin (−6). SAR 5 price (−5, SEO-26). AR title grammar (−3, SEO-27). No nature Original (−2).                  |
| Performance          | 75     | 0     | **Held.** Lab LCP is worse, but no rendering code, font, CSS or dependency changed since `fe7578a` (`git diff`), so it isn't scored. See Performance below. |
| Visibility           | 12     | −2    | **3 organic visits**, against 8. Still not found for any tracked keyword ★. No GSC.                                                                         |
| **Overall**          | **80** | **0** | Mean of the 8 areas is 80.25, against 80.4 on 2026-11-11.                                                                                                   |

## Fixed this run

**No fix PR this run.**

- No new P0 to P2 finding has a safe code fix. The open P2s are host data, pricing or lab noise.
- The repo-wide `pnpm scan` audit step is red on every branch because of a new high-severity picomatch advisory that has no patched release (#385). Any fix PR would fail the scan.

There's no HIGH-risk PR this run either.

## Findings by severity

| ID     | Sev | Finding                                                   | Evidence (this run)                                                                                                                                                                                                                                | Status / owner                                                                                 |
| ------ | --- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| SEO-39 | P1  | The TikTok feed says `in stock` for every live listing    | `app/api/catalog/tiktok.csv/route.ts` is unchanged since 2026-10-29 (`git log`). The DB has 8 of 8 live listings with empty weekdays. Production Product JSON-LD says `SoldOut`.                                                                   | Open, #303. The fix is in #305 (`[high-risk]`, mergeable), waiting for the owner.              |
| SEO-08 | P2  | `/hosts/host` profile data                                | Live `/llms.txt`: an Arabic name «رحلات وعي» on the EN entry, a bio that opens `We" offers…`, and 0 live experiences                                                                                                                               | Open, host data (admin)                                                                        |
| SEO-09 | P2  | AR home lab LCP is above EN                               | Median `/ar` 5.0 s against `/en` 4.0 s. The gap is 1.0 s (0.2 s last week). The LCP element on both is the hero intro `<p>` inside `RiseIn` (delay 0.2).                                                                                           | Open, watching (lab only, see Performance)                                                     |
| SEO-26 | P2  | `asiri-coffee-ritual-and-saleeg-lunch` is priced at SAR 5 | Live `/llms.txt`: "Price: SAR 5 per person"                                                                                                                                                                                                        | Open, owner (pricing)                                                                          |
| SEO-13 | P3  | Brand hosts are typed `Person`                            | `app/[locale]/(site)/hosts/[slug]/page.tsx:158`: the heuristic is `/\b(co\.?\|company\|…\|الشركة\|شركة)\b/i`. In JavaScript, `\b` never matches next to Arabic letters, so the Arabic alternatives are dead code. `aura` and `host` stay `Person`. | Open. The real signal (CR identity) lives in `host_applications`, which is outside this scope. |
| SEO-14 | P3  | Organization has no `sameAs`                              | Absent on production `/ar`                                                                                                                                                                                                                         | Open. Needs the owner to supply profile URLs.                                                  |
| SEO-15 | P3  | `/experiences` streams behind a skeleton                  | Unchanged                                                                                                                                                                                                                                          | Open, deferred (caching trade-off)                                                             |
| SEO-16 | P3  | a11y                                                      | Lighthouse a11y: home 96, experience 97, category 100                                                                                                                                                                                              | Open                                                                                           |
| SEO-27 | P3  | The AR title mixes grammatical gender                     | `plant-play-and-enjoy-a-barbecue-with-a-chef-dnrp9e` (host data)                                                                                                                                                                                   | Open, host data                                                                                |
| SEO-28 | P3  | The home h1 runs into the rotating word list              | Production `/ar` h1 text: the sr-only headline, then the aria-hidden words «تجارب … المغامرة الطبيعة العافية العائلة التراث الطعام … تعيشها مع أهل المكان»                                                                                         | Open                                                                                           |
| SEO-29 | P3  | The language switcher keeps the query string              | Unchanged                                                                                                                                                                                                                                          | Open                                                                                           |
| SEO-31 | P3  | The 404 shell has no `lang`/`dir` and no h1               | Live `/ar/experiences/zzzz-not-a-listing-20261118`: 404 with `noindex`                                                                                                                                                                             | Open, tied to the `force-dynamic` decision                                                     |
| SEO-33 | P3  | Referrer noise logged as page views                       | This week: bare Vercel edge IPs `216.198.79.1` ×2 and `64.29.17.1` ×2 as `referrer_host`. The spam domains from last week are gone.                                                                                                                | Open                                                                                           |
| SEO-36 | P3  | `/hosting` links to `/host/apply` (disallowed, 307)       | Local: `/{en,ar}/host/apply` → 307. These are the only 2 non-200s among 62 internal links.                                                                                                                                                         | Open, by design                                                                                |
| SEO-37 | P3  | Bare `/` falls back to `/en` without `Accept-Language`    | Unchanged                                                                                                                                                                                                                                          | Open                                                                                           |
| SEO-40 | P3  | An Arabic place name in the English feed                  | Live `/llms.txt`: `plant-play-…-dnrp9e` "Place: حي المنسك, Abha"                                                                                                                                                                                   | Open, host data                                                                                |

**Closed this run:** SEO-30. Production `/ar` serves `og:locale:alternate` = `en_US`, and production `/en/experiences/soudah-cliff-via-ferrata` serves `ar_SA`. Locally, 54 of 54 page-locales carry it.

**No new findings.** No new issue was opened, and #303 stays the single open `seo` issue.

**Verified healthy this run:**

- **Production robots.txt:**
  - allows `/{ar,en}/hosts` and `/{ar,en}/hosting`
  - disallows the 8 private prefixes in both locales
  - has `Sitemap: https://gharmish.com/sitemap.xml`
- **Production sitemap** (cache-busted) has 54 URLs, each with en, ar and x-default (→ `/ar`).
  - It lists exactly the 8 `live` slugs and the 4 `verified` hosts.
  - The draft `…-copy-uwb2cp`, the pending `mountain-roots-collective` and the suspended `sarawat-expeditions` are absent.
  - `lastmod` appears only on experiences and hosts.
- **Production `/llms.txt`** returns 200 `text/plain` with 8 experiences and 4 hosts, each with EN and AR URLs.
- **Production `/ar`:**
  - `lang="ar" dir="rtl"`, one h1, a self-canonical, and en/ar/x-default hreflang
  - `og:image` `/ar/opengraph-image` returns `200 image/png`
  - Organization, WebSite and ItemList (8 items) are present
- **Production `/en/experiences/soudah-cliff-via-ferrata`:**
  - a self-canonical and hreflang identical to the sitemap
  - Product `offers` has `SAR` 540, `SoldOut` and `url`
  - BreadcrumbList has 3 levels
  - `card.png` og:image
- **Local crawl, 54 of 54 page-locales:**
  - All return 200 with the correct `lang`/`dir` and exactly one h1.
  - Titles are 15–60 characters and descriptions 70–160, with no duplicates.
  - Every page is self-canonical, with 3 hreflang links.
  - og:image is present, every JSON-LD block parses, and no `<img>` lacks `alt`.
  - 18 of 18 og:image URLs return `200 image/png`.
- **Private pages:** `/en/me`, `/en/wishlist`, `/en/sign-in`, `/en/dev` and `/ar/me` are `noindex, nofollow`. `/en/host` and `/en/admin` 307 to sign-in. `/en/book/x` returns 404 with `noindex`. All are disallowed in robots.txt.
- **404s and redirects:**
  - 404s are real: live `/ar/experiences/zzzz-not-a-listing-20261118`, and local `/en/experiences/zzzz-nope` and `/en/hosts/zzzz-nope`.
  - The legacy `/en/hosts/faisal-al-qahtani` resolves to `/en/hosts/abdulaziz-alasmari`, which is self-canonical.
- **Verification tags:** `app/[locale]/layout.tsx` is unchanged since `fe7578a` (Facebook and Saudi Business Center tags, no Google).
- **Not checked:** http→https and apex/www redirects. The connector follows same-origin redirects only, and direct `curl` is blocked.

## Regressions since last run

`git log fe7578a..aa96bb5` has 22 commits (10 merged PRs). The SEO-relevant ones:

| Change                                                                                                                                    | Effect                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| #342: `og:locale:alternate` on 14 public pages                                                                                            | Intended. Verified live (SEO-30 closed).                                             |
| #356: catalog filter chips and the filter sheet show the Arabic city name on `/ar` (`features/experiences/components/active-filters.tsx`) | Client-side filter UI only. It improves Arabic consistency, with no metadata impact. |
| #384: admin listing links point to the owner preview for non-live listings                                                                | Admin only. It stops admins hitting 404s on public URLs; no public surface changes.  |
| #379, #380, #381: host listing guard, booking `.ics`, admin ticket messages                                                               | No public SEO surface                                                                |
| #343, #348, #357, #372: docs only                                                                                                         | None                                                                                 |

**No regressions.**

## Organic traffic and demand gaps

| Window (rolling, to 04:05 UTC) | AR  | EN  | Total | WoW       |
| ------------------------------ | --- | --- | ----- | --------- |
| Organic, last 7 days           | 0   | 3   | **3** | −5 (−63%) |
| Organic, previous 7 days       | 0   | 8   | 8     | —         |

- **Sources:** google.com ×3. Bing and DuckDuckGo had none. 2 visits landed on `/` and 1 on a host profile (`/hosts/[slug]`). There is still no Arabic organic visit.
- **All page views:** 391, against 346 (+13%).
  - **Arabic recovered from 60 to 103 (+72%).** English held at 288 (286 last week).
  - 384 of the 391 have no referrer.
- **Zero-result searches (28 days):** only the bot `q={search_term_string}` ×1 (2026-10-30). The `category=nature&originals=1` cluster has aged out. There are no free-text zero-result queries, so no new keyword seeds.

## SERP presence (★ = from search excerpts only)

| Keyword              | gharmish.com seen? | Who holds the excerpts                                                                                                                                                                |
| -------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `site:gharmish.com`  | No ★               | Operator not honoured. Unrelated results (Hugging Face, GitHub, semrush harmash.com).                                                                                                 |
| «gharmish غارميش»    | Not found ★        | Gharmi people (Wikipedia mirrors), Qurmish (Iran), Gharm, Kūh-e Garmesh (geonames)                                                                                                    |
| تجارب أبها           | Not found ★        | holafly blog, alwatan, sabq, saudiauto (karting), platinumlist, wanderlustmagazine (new)                                                                                              |
| أنشطة في أبها        | Not found ★        | excursionmania, alyaum, sabq, platinumlist                                                                                                                                            |
| سياحة عسير تجارب     | Not found ★        | alwatan, ajel, arabic.slowfood.com (Aseer PDF), sabq, al-jazirah                                                                                                                      |
| things to do in Abha | Not found ★        | Expedia (many country sites), smartertravel, laurewanders, Travelocity, hotelscombined, listmag, thrillophilia, flydubai                                                              |
| Abha experiences     | Not found ★        | remotelands, experiencesbyroam.com, **book.visitsaudi.com** (home visit), **tickets.jarir.com**, trip.com, **localadventures.travel** (new), **lokalee.app** (new), discoveraseer.com |
| Aseer tours          | Not found ★        | Expedia, ootlah, book.visitsaudi.com, euronews, discoveraseer.com, listmag                                                                                                            |
| Soudah tours         | Not found ★        | Expedia, discoveraseer.com, seyaha.net, platinumlist, rezdy, lokalee                                                                                                                  |
| رحلات السودة         | Not found ★        | alukah, sabq, excursionmania. Editorial and off-topic (Sudan), no booking platform.                                                                                                   |

## Performance signals

| Page (local, Lighthouse 12.8 mobile, median of 3) | Perf | SEO | A11y | LCP   | CLS   | TBT    | benchmarkIndex |
| ------------------------------------------------- | ---- | --- | ---- | ----- | ----- | ------ | -------------- |
| `/ar`                                             | 78   | 100 | 96   | 5.0 s | 0     | 212 ms | 3,070–3,174    |
| `/en`                                             | 86   | 100 | 96   | 4.0 s | 0.001 | 134 ms | 2,851–2,966    |
| `/ar/experiences/soudah-cliff-via-ferrata`        | 82   | 100 | 97   | 4.4 s | 0.001 | 182 ms | 2,963–3,169    |
| `/ar/experiences/nature`                          | 80   | 100 | 100  | 5.3 s | 0     | 144 ms | 3,102–3,179    |

- **Held at 75.**
  - TBT improved everywhere: the experience page went from 616 to 182 ms, and the category page from 503 to 144 ms.
  - LCP is worse on all four pages, by 0.4 to 1.2 s.
  - `git diff fe7578a..HEAD` touches no layout, CSS, font, component, `public/`, config or dependency file, so code can't explain the LCP change.
  - The LCP element on both home pages is the hero intro `<p>` (FCP about 1.1–1.2 s). Its value depends on when the animation and font settle.
  - A first `/ar` run against a cold server hit 6.4 s TBT and was discarded and re-run warm. The sandbox had been up for 3 minutes.
  - Re-measure next run before scoring a regression.
- **TTFB, local, median of 5:** `/ar` 33 ms and `/ar/experiences` 26 ms. Production TTFB is not measured because the proxy blocks direct requests.
- **Static checks:** CLS is ≤ 0.001 in all 12 runs. No rendering code changed, so last week's static checks still hold.
- **Vercel runtime errors (7 days): none.**
- **Deployments:** the last 6 production deploys are all READY, and production is on HEAD.

## Deferred and accepted items

| Item                                                            | Status                                                                                       |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `force-dynamic` locale layout, no root `loading.tsx`            | Owner decision, kept so 404s stay real. Caching is deferred, never a P0 (SEO-15 and SEO-31). |
| Experience photography                                          | Quarantined since 2026-08. The fix is a photo shoot (owner task).                            |
| x-default → Arabic                                              | Owner decision. Verified on 54 of 54.                                                        |
| Live but unbookable listings (empty weekdays)                   | Owner decision. JSON-LD is honest (`SoldOut`). The feed isn't (SEO-39, #303, fix in #305).   |
| `asir-adventures-co` / `asiri-coffee-*` slugs, "Aseer" spelling | Kept on purpose                                                                              |
| `accepted:` list                                                | Empty                                                                                        |

## Decisions for the founder

1. **Verify Google Search Console and Bing Webmaster Tools.** `verification` in `app/[locale]/layout.tsx` still has no `google` key. Organic visits fell from 8 to 3 this week, and the queries behind them are invisible. This is a standing item.
2. **Review #305, the fix for #303 (TikTok feed availability).** It has been mergeable and waiting since 2026-11-04. Until it lands, the feed advertises 8 listings that have no bookable date.
3. **Share the official social profile URLs** (Instagram, X, TikTok, if they exist). That lets SEO-14 add `sameAs` to the Organization JSON-LD. The brand query still returns unrelated pages ★.

## Next-run watchlist

- Lab LCP: re-measure `/ar`, `/en` and `/ar/experiences/nature` with a warm server. If `/ar` is still ≥ 4.5 s with no code change, look at the hero `RiseIn` timing on the intro paragraph.
- #385 (picomatch audit) and #338 (the Next.js bump): until #385 is resolved, `pnpm scan` is red, so no SEO fix PR can go green.
- #305: once it merges, confirm `out of stock` for empty-weekday listings and retire SEO-39.
- Arabic page views (103): check whether the recovery holds.
- SERP: localadventures.travel and lokalee.app are new holders for "Abha experiences".
