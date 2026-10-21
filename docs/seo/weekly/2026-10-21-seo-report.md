# SEO weekly report: 2026-10-21

> **الملخص:** التقييم ثابت عند 79/100. لم يتغيّر على الموقع شيء يخص البحث هذا الأسبوع، ولا تزال إصلاحات الأسبوع الماضي (PR #91) بانتظار الدمج. يضيف PR #161 ثلاثة إصلاحات صغيرة: نطاق الخدمة بالعربية في البيانات المنظمة، ووصف العلامة العام في llms.txt، وعنوان تجربة إنجليزي أطول من 60 حرفًا.
> **العائق الأكبر ما زال خارج الكود:** لم يُفعَّل Google Search Console بعد، ولا يظهر الموقع في نتائج البحث. وصلت 6 زيارات عضوية هذا الأسبوع (مقابل 2)، كلها بالإنجليزية وكلها إلى الصفحة الرئيسية.

**HEAD audited:** `eca727d13740ab8655b78f9d06825fbbd8cb56dc` (`main`). The production deployment `dpl_FsFL3LX1TYymJyhawXuvwb98oSMt` is READY on this SHA.
**Catalog state:** 8 live experiences and 1 draft, unchanged since the 2026-10-14 run. All 4 `verified` hosts are in the sitemap.

| Surface                                                                                                                 | Source                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| robots.txt, sitemap.xml, llms.txt, 2 OG image routes, a 404 probe                                                       | **Production** via the Vercel connector (`web_fetch_vercel_url`). Direct `curl` still fails with `CONNECT tunnel failed, 403`. |
| All 54 sitemap page-locales (status, lang/dir, h1, title, description, canonical, hreflang, OG, JSON-LD, links, images) | **Local production build** in sample-data mode (6 of the 8 live experiences and 2 of the 4 hosts exist in sample data)         |
| Private pages, 404s, 18 OG image URLs, 64 internal links, Lighthouse, TTFB                                              | **Local production build**                                                                                                     |
| Live and verified slugs, organic traffic, searches                                                                      | **Production DB** (read-only SELECT)                                                                                           |
| SERP                                                                                                                    | WebSearch proxy excerpts (★)                                                                                                   |

Since the 2026-10-14 run, the only commit on `main` is `eca727d`, which changes only `public/.well-known/apple-developer-merchantid-domain-association.txt`. The production SEO surface is therefore the same code as last week, so the per-page checks on the local build stand in for production.

---

## Needs the founder today

Nothing. There is no 🔴: the sitemap and robots.txt are healthy, both OG routes return `200 image/png` in production, and unknown slugs return a real 404.

## Scorecard

| Area                 | Score  | Δ     | Deductions                                                                                                                                                                                                                                           |
| -------------------- | ------ | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Crawlability         | 98     | 0     | `/experiences` main content streams in behind a skeleton (SEO-15, −2).                                                                                                                                                                               |
| Indexability         | 95     | 0     | The sitemap has 54 URLs and matches the DB exactly (8 live, 4 verified). No GSC (−5).                                                                                                                                                                |
| Metadata             | 91     | −1    | 11 of 16 experience descriptions still end mid-sentence in production (−4, fix waiting in #91). `/en/hosts/host` has an Arabic-only title and a broken-quote description (−4, SEO-08). New this week: one 65-character EN title (−1, fixed in #161). |
| Structured data      | 91     | 0     | AR pages emit English `reviewBody` (−3, #91). The AR host breadcrumb uses the English name (−1, #91). No `sameAs` (−2). `aura` and `host` are typed `Person` (−2). `areaServed` is in English on `/ar` (−1, fixed in #161).                          |
| Bilingual / hreflang | 95     | 0     | hreflang matches the sitemap on all 54 page-locales. English JSON-LD on AR pages (−3, #91). `/en/hosts/host` shows an Arabic name (−1). One English user review appears on AR pages (−1).                                                            |
| Content              | 74     | 0     | No first-party photos (−10). `/hosts/host` is thin with 0 live experiences (−6). SAR 5 listing price (−5, SEO-26). AR title grammar (−3, SEO-27). No nature Original (−2).                                                                           |
| Performance          | 75     | −1    | Lab only. `/ar` (median of 3 runs) Perf 77, LCP 4.7 s, against 78 and 4.2 s last week. Other pages are within ±2.                                                                                                                                    |
| Visibility           | 14     | +2    | 6 organic visits in 7 days (was 2), all English and all landing on `/`. Not found for any tracked keyword ★. `site:gharmish.com` shows nothing ★. No GSC.                                                                                            |
| **Overall**          | **79** | **0** | Mean of the 8 areas (78.9), compared with 79 on 2026-10-14.                                                                                                                                                                                          |

## Fixed this run: [#161](https://github.com/Gharmish/FWEXMP/pull/161)

| ID     | Sev | Fix                                                                       | Before                                                                                                                                         | After (local build of #161)                                                                       |
| ------ | --- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| SEO-32 | P3  | Organization `areaServed` is now localized on home and about              | `app/[locale]/(site)/page.tsx:148` `'Abha, Aseer, Saudi Arabia'` and `about/page.tsx:73` `'Aseer, Saudi Arabia'`, both on the Arabic pages too | `/ar`, `/ar/about`: `"areaServed":"أبها، عسير، المملكة العربية السعودية"` (`siteMeta.areaServed`) |
| SEO-34 | P3  | Experience titles that would run past 60 characters drop the brand suffix | `/en/experiences/al-qatt-painting-rijal-almaa`: `Al-Qatt Al-Aseeri painting for families in Rijal Almaa · Gharmish` (65)                       | `Al-Qatt Al-Aseeri painting for families in Rijal Almaa` (54). Shorter titles keep `· Gharmish`   |
| SEO-35 | P3  | `SITE_DESCRIPTION` now uses the place-agnostic positioning line           | `lib/site.ts:14` "…who know Aseer best." opens live `/llms.txt` and is the manifest description (against the 2026-08-14 brand mandate)         | "Experiences hosted by the people who know the place best."                                       |

`pnpm scan` passes (lint, typecheck, audit, 2,261 tests, build).

**Still waiting from last week:** [#91](https://github.com/Gharmish/FWEXMP/pull/91) (SEO-22 descriptions, SEO-23 P1 Arabic review JSON-LD, SEO-24, SEO-25) has been open and `mergeable_state: clean` for 7 days. It is the largest open SEO improvement.

## Findings by severity

| ID     | Sev | Finding                                                                    | Evidence (this run)                                                                                                                                                          | Status                                                                                        | Owner           |
| ------ | --- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------- |
| SEO-23 | P1  | English `reviewBody` in the JSON-LD of AR experience pages                 | Local `/ar/experiences/an-evening-with-the-flower-men`: the second Product block's `reviewBody` is English. `main` code is unchanged since last week.                        | Fix in #91, **unmerged for 7 days**                                                           | Founder (merge) |
| SEO-08 | P2  | `/hosts/host` profile data                                                 | Live `/llms.txt`: host name «رحلات وعي» on the EN URL, bio opens `We" offers…`, 0 live experiences                                                                           | Open (admin data)                                                                             | Ops             |
| SEO-09 | P2  | High AR home lab LCP                                                       | `/ar` LCP 5.8 / 4.7 / 4.6 s across 3 runs. The first run overlapped a test suite, so the median (4.7 s) is reported. `/en` 3.7 s.                                            | Open, flat                                                                                    | Eng             |
| SEO-22 | P2  | Meta descriptions end mid-sentence                                         | 8 of 16 experience/host page-locales end in `…` on the local build of `main` (11 of 16 in production last week), e.g. `/en/experiences/soudah-cliff-via-ferrata` (159 chars) | Fix in #91                                                                                    | —               |
| SEO-24 | P2  | English host name in the AR host JSON-LD                                   | As last week                                                                                                                                                                 | Fix in #91                                                                                    | —               |
| SEO-25 | P2  | Category landings have one crawl path                                      | As last week                                                                                                                                                                 | Fix in #91                                                                                    | —               |
| SEO-26 | P2  | `asiri-coffee-ritual-and-saleeg-lunch` priced at SAR 5                     | Live `/llms.txt`: "Price: SAR 5 per person". Other listings are SAR 180–540.                                                                                                 | Open (pricing is outside this routine)                                                        | Founder         |
| SEO-13 | P3  | Brand hosts typed `Person`                                                 | `/hosts/abdulaziz-alasmari` is `Person` (correct). `aura` and `host` are still `Person`.                                                                                     | Partly fixed                                                                                  | Eng             |
| SEO-14 | P3  | Organization has no `sameAs`                                               | Absent on `/ar` and `/en`                                                                                                                                                    | Waiting on social handles                                                                     | Founder         |
| SEO-15 | P3  | `/experiences` streams behind a skeleton                                   | Local `/ar/experiences` and `/en/experiences`: 0 words in `<main>` before hydration                                                                                          | Note only (caching deferred)                                                                  | —               |
| SEO-16 | P3  | a11y                                                                       | Home 96 (contrast), experience page 97                                                                                                                                       | Open                                                                                          | Eng             |
| SEO-21 | P3  | Intermittent AR hero CLS                                                   | CLS 0 to 0.001 in all 7 lab runs this week                                                                                                                                   | Watch. Close next run if it stays clean.                                                      | —               |
| SEO-27 | P3  | AR title mixes grammatical gender                                          | `plant-play-and-enjoy-a-barbecue-with-a-chef-dnrp9e` (host data, unchanged)                                                                                                  | Open                                                                                          | Host / Ops      |
| SEO-28 | P3  | Home h1 runs into the aria-hidden rotating word list                       | Local `/ar` h1 text: «…يعرفونه أكثر.تجارب المغامرةالطبيعةالعافية…» (`app/[locale]/(site)/page.tsx:210`)                                                                      | Open. The fix touches the hero animation, so it is not in a safe-fix PR.                      | Eng             |
| SEO-29 | P3  | Language switcher keeps the query string                                   | Not re-checked                                                                                                                                                               | Open                                                                                          | Eng             |
| SEO-30 | P3  | No `og:locale:alternate`                                                   | 0 of 54 page-locales. Each page declares its own `openGraph`, so the fix touches about 15 files.                                                                             | Open                                                                                          | Eng             |
| SEO-31 | P3  | The 404 shell has no `lang`/`dir`                                          | Live `/ar/experiences/zzzz-not-a-slug`: 404 with `noindex` (correct)                                                                                                         | Open                                                                                          | Eng             |
| SEO-32 | P3  | `areaServed` in English on `/ar`                                           | See "Fixed this run"                                                                                                                                                         | Fixed in #161                                                                                 | —               |
| SEO-33 | P3  | Bot probes logged as page views                                            | 0 rows with a non-`ar`/`en` locale in the last 7 days (17 the week before)                                                                                                   | Quiet this week. Watch.                                                                       | —               |
| SEO-34 | P3  | EN experience title over 60 characters                                     | See "Fixed this run"                                                                                                                                                         | Fixed in #161                                                                                 | —               |
| SEO-35 | P3  | Brand description fixed to Aseer in llms.txt and the manifest              | See "Fixed this run"                                                                                                                                                         | Fixed in #161                                                                                 | —               |
| SEO-36 | P3  | `/hosting` links to `/host/apply`, which is disallowed and redirects       | 4 links on `/en/hosting` and `/ar/hosting`. `/en/host/apply` returns 307 to sign-in (noindex). Google can't crawl it, so the link spends no crawl budget.                    | Note only. A primary CTA should not carry `nofollow`.                                         | —               |
| SEO-37 | P3  | The bare root `/` redirects to `/en` for clients without `Accept-Language` | Local `curl /` returns 307 to `/en`. With `Accept-Language: ar-SA` it goes to `/ar`. `lib/i18n.ts:14` `defaultLocale: 'en'`, while the sitemap's x-default is `/ar`.         | Note only. `/` is not in the sitemap, and changing the routing default is a product decision. | Founder         |

**No new P0 or P1 this run**, so no new issues were opened. SEO-23 (P1) already has a fix in #91.

**Verified healthy this run (no finding):**

- Production robots.txt allows `/{ar,en}/hosts` and `/{ar,en}/hosting`, disallows the 8 private prefixes in both locales, and has a `Sitemap:` line.
- Production sitemap.xml has 54 URLs, each with en, ar and x-default (→ `/ar`). It lists exactly the 8 `live` slugs and the 4 `verified` hosts. The pending (`mountain-roots-collective`) and suspended (`sarawat-expeditions`) hosts are absent. `lastmod` appears only on experiences and hosts.
- Production `/llms.txt` returns 200 `text/plain` and lists 8 experiences and 4 hosts with EN and AR URLs.
- Local, 54 of 54 page-locales: 200, correct `lang`/`dir`, exactly one `<h1>`, self-canonical, hreflang identical to the sitemap, og:title/description/image/locale and twitter:card, no duplicate titles or descriptions, every description 75–159 characters, every JSON-LD block parses, no `<img>` without `alt`.
- All 18 og:image URLs return `200 image/png` locally. Production `/ar/experiences/soudah-cliff-via-ferrata/card.png` and `/ar/hosts/aura/opengraph-image` return `200 image/png`.
- 64 unique internal links: all return 200 except `/{en,ar}/host/apply` (SEO-36).
- Private pages: `/en/me`, `/en/wishlist`, `/en/sign-in`, `/en/dev` and `/ar/me` are `noindex, nofollow`. `/en/host` and `/en/admin` 307 to sign-in. `/en/book/x` returns 404 with noindex. All are disallowed.
- Unknown slugs (`/en/experiences/zzzz-not-a-slug`, `/ar/hosts/zzzz-nope`) return a real 404.
- FAQPage appears only on `/help` and `/hosting`. Product carries `image`, and `offers` has `price`, `SAR` and `url`. `aggregateRating` appears only where reviews exist.

## Regressions since last run

`git log 267b62f..eca727d`: one commit, which touches only the Apple Pay domain-association file. No file on the SEO surface changed. **No regressions.**

## Organic traffic and demand gaps

| Window (rolling, from 04:10 UTC) | AR  | EN  | Total | WoW   |
| -------------------------------- | --- | --- | ----- | ----- |
| Organic, last 7 days             | 0   | 6   | **6** | +200% |
| Organic, previous 7 days         | 0   | 2   | 2     | —     |

- **Sources:** google.com 5, bing.com 1. **Landing page:** `/` for all 6. Organic traffic reached no experience, category or `/abha` page.
- **All page views:** 293, against 313 the week before (−6%). Arabic fell from 65 to 40 and English rose from 231 to 253.
- **Zero-result searches (28 days):** 84 in total. The last 7 days had 11 searches, all zero-result, all on 2026-10-14 between the windows, all identical (`category=nature&originals=1`, `ar`). That looks like one session or a bot repeating a filter. No live nature listing is an Original, so the filter honestly returns 0. Free-text gaps are unchanged: `aura` ×3 (a host name) and `خيل` ×2 (horse riding).

## SERP presence (★ = from search excerpts only)

| Keyword                           | gharmish.com seen?                | Who holds the excerpts                                                                                  |
| --------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `site:gharmish.com`               | No ★                              | Unrelated (ghazali.org, Gharieni)                                                                       |
| تجارب أبها                        | Not found in the first excerpts ★ | platinumlist.net, linkedin                                                                              |
| أنشطة في أبها                     | Not found ★                       | excursionmania.com, okaz, platinumlist.net, saudipedia                                                  |
| سياحة عسير تجارب                  | Not found ★                       | ajel.sa, sabq.org, alwatan, okaz, al-madina (news on the Aseer season and the interactive map)          |
| things to do in Abha              | Not found ★                       | laurewanders.com, Expedia (several country sites), Travelocity                                          |
| Abha experiences                  | Not found ★                       | **book.visitsaudi.com** (Raydah reserve tour, traditional Asiri home visit), Expedia, expatexchange     |
| Aseer tours                       | Not found ★                       | Expedia ("Aseer Wonders"), euronews, listmag, slowfood                                                  |
| Soudah tours                      | Not found ★                       | Expedia, platinumlist (Soudah and Gaithan hikes), rezdy, AAA                                            |
| رحلات السودة                      | Not found ★                       | The engine reads it as Sudan (flights). The keyword is ambiguous, so replace it with «رحلة جبل السودة». |
| ركوب الخيل أبها (new, from `خيل`) | Not found ★                       | Airbnb Experiences (non-Abha), aljazeera. No Abha horse-riding provider ranks, which is an open niche.  |

## Performance signals

| Page (local build, Lighthouse 12 mobile)   | Perf | SEO\* | A11y | LCP   | CLS   | TBT    |
| ------------------------------------------ | ---- | ----- | ---- | ----- | ----- | ------ |
| `/ar` (median of 3)                        | 77   | 92    | 96   | 4.7 s | 0.001 | 310 ms |
| `/en`                                      | 87   | 92    | 96   | 3.7 s | 0.001 | 170 ms |
| `/ar/experiences/soudah-cliff-via-ferrata` | 78   | 92    | 97   | 5.3 s | 0.001 | 150 ms |
| `/ar/experiences/nature`                   | 83   | 92    | 100  | 4.4 s | 0     | 160 ms |

\*The only failing SEO audit is `canonical`, which is expected on localhost because the canonical points at gharmish.com.

- **TTFB, local, median of 5:** `/ar` 37 ms, `/ar/experiences` 35 ms. Production TTFB is not measured, because the sandbox proxy blocks direct requests.
- **Vercel runtime errors (7 days):** 1 group with 1 occurrence: a `CONNECT_TIMEOUT` to the Supabase pooler while revalidating the cached detail of `plant-play-and-enjoy-a-barbecue-with-a-chef-dnrp9e` (route `/[locale]/experiences.rsc`, last seen 2026-10-21 02:14 UTC). It is transient and the same class as last week's pooler drop. **0 failed deployments** in 29 recent deployments.
- **Static checks:** no `<img>` without `alt` on the 54 page-locales, and CLS is ≤ 0.001 everywhere. Field data is unavailable because Speed Insights has no read API here.

## Deferred and accepted items

| Item                                                            | Status                                                                   |
| --------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `force-dynamic` locale layout, no root `loading.tsx`            | Owner decision, kept so 404s stay real. Caching is deferred, never a P0. |
| Experience photography                                          | Quarantined since 2026-08. The fix is a photo shoot (owner task).        |
| x-default → Arabic                                              | Owner decision. Verified on 54 of 54 page-locales.                       |
| `asir-adventures-co` / `asiri-coffee-*` slugs, "Aseer" spelling | Kept on purpose                                                          |
| `accepted:` list                                                | Empty                                                                    |

## Decisions for the founder

1. **Verify Google Search Console and Bing Webmaster Tools.** `verification` in `app/[locale]/layout.tsx` still has no `google` key. Until it's verified, every Visibility number here is a proxy. This is a standing item.
2. **Merge #91, then #161.** #91 holds the only open P1 (English review text in Arabic structured data) and the description fix for 11 pages. It has been clean and mergeable for a week. The two PRs touch different hunks.
3. **Fix the SAR 5 price on `asiri-coffee-ritual-and-saleeg-lunch`** (SEO-26). It is in the Product JSON-LD and llms.txt, so search engines and AI assistants repeat it.

## Next-run watchlist

- After #91 deploys: AR `reviewBody` is Arabic, descriptions end on a sentence, and `/abha` links the 7 categories.
- After #161 deploys: `/ar` `areaServed` is in Arabic, `/llms.txt` opens with "…know the place best.", and the al-qatt EN title is 54 characters.
- Organic: 6 visits, all to `/` in English. Watch for the first Arabic or deep-page organic entry.
- SEO-21: if CLS stays ≤ 0.001 for another run, close it.
- SERP: use «رحلة جبل السودة» instead of «رحلات السودة», and keep «ركوب الخيل أبها» as a demand probe.
