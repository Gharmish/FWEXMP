# SEO weekly report: 2026-10-11 (second run)

> **الملخص:** ارتفع التقييم إلى 76/100 (+4)، وكل إصلاحات الصباح ظاهرة الآن على الموقع المباشر: صورة المشاركة، والعناوين، والأوصاف، وog:locale، وملف robots. يضيف PR #53 أربعة إصلاحات للعناوين ومسار التنقل العربي.
> **العائق الأكبر ما زال خارج الكود:** لا توجد أي تجربة منشورة، ولم يُفعَّل Google Search Console، والزيارات العضوية 3 فقط في 7 أيام، كلها بالإنجليزية.

**Run:** second run on 2026-10-11. The first run was at 09:30 UTC and is in `2026-10-11-seo-report.md`. This run re-audits after PR #50 merged and the owner's follow-up commit `e7273a5`.
**HEAD audited:** `e7273a5fc8015629f339fe3a78cfb11723101146` (`main`). The production deployment `dpl_78Z7qPgBXXZMaAiFRWiVzBN69EQ8` is READY on this SHA.
**Catalog state:** 0 live experiences (8 paused). This is a known business condition and is not paged again.

| Surface                                                                                                                             | Source                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| robots.txt, sitemap.xml, llms.txt, 17 public page-locales, 2 OG image routes, a 404 probe                                           | **Production** via the Vercel connector (`web_fetch_vercel_url`). Direct `curl` from the sandbox still fails with `CONNECT tunnel failed, 403`. |
| All 38 static public page-locales (title and description uniqueness and length), private pages, 404s, 4 OG routes, Lighthouse, TTFB | **Local production build** in sample-data mode                                                                                                  |
| Live and verified slugs, organic traffic, zero-result searches                                                                      | **Production DB** (read-only SELECT)                                                                                                            |
| SERP                                                                                                                                | WebSearch proxy excerpts (★)                                                                                                                    |

---

## Needs the founder today

None. No 🔴: every fetched public page returns 200, the sitemap is healthy, and the OG routes return `200 image/png`.

## Scorecard

| Area                 | Score  | Δ      | Deductions                                                                                                                                                                                                                                                                 |
| -------------------- | ------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Crawlability         | 98     | +6     | The robots `LLM:` line is now a comment and the review links to 404s are gone. `/experiences` main content still streams in behind a skeleton (SEO-15, −2).                                                                                                                |
| Indexability         | 85     | 0      | 0 live listings, so no experience pages exist (−10). No GSC (−5).                                                                                                                                                                                                          |
| Metadata             | 90     | +14    | Fixes for SEO-01, 03, 05, 07, 10 and 12 are verified live. Remaining: brand repeated in host-profile and `/hosting` titles (−4, fixed in #53). Two EN titles run 62 and 66 chars (−2, fixed in #53). `/en/hosts/host` description starts with a broken quote (−4, SEO-08). |
| Structured data      | 93     | +3     | Organization now has contactPoint and address, and hasCredential is localized. Remaining: brand hosts typed `Person` (−2). Latin breadcrumb root on `/ar` (−2, fixed in #53). No `sameAs` (−3).                                                                            |
| Bilingual / hreflang | 97     | +2     | hreflang matches the sitemap on all 17 fetched pages. The breadcrumb root reads "Gharmish" on Arabic pages (−2, fixed in #53). `/en/hosts/host` shows an Arabic-only display name (−1, host data).                                                                         |
| Content              | 62     | +7     | Category landings are now 150–176 words and no longer thin. All grids are still empty (0 live) and there are no first-party photos.                                                                                                                                        |
| Performance          | 68     | +3     | Lab only. `/ar`: Perf 62, LCP 4.8 s (was 5.9 s). `/en`: Perf 87, LCP 3.7 s. One cold run of `/ar` hit CLS 0.225 (SEO-21).                                                                                                                                                  |
| Visibility           | 12     | −3     | 3 organic visits in 7 days (−67% WoW), 0 of them Arabic. No presence on any tracked keyword ★. No GSC.                                                                                                                                                                     |
| **Overall**          | **76** | **+4** | Mean of the 8 areas. Compared with the 72 baseline from this morning's run.                                                                                                                                                                                                |

## Fixed this run

PR: **[#53 SEO fixes – 2026-10-11 (second run)](https://github.com/Gharmish/FWEXMP/pull/53)**. `pnpm scan` passes (lint, typecheck, audit, 2,215 tests, build). Each fix was verified on a local build of the branch.

| ID     | Fix                                             | Before (production)                                                                                   | After (local build)                                                                            |
| ------ | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| SEO-17 | Host-profile titles stop repeating the brand    | `/ar/hosts/aura`: `… · مضيف على غارميش · غارميش`. `/en/hosts/host`: `… · Host on Gharmish · Gharmish` | `{name} · مضيف محلي في أبها وعسير · غارميش` / `{name} · Local host in Abha & Aseer · Gharmish` |
| SEO-18 | `/hosting` gets a keyword title                 | `استضِف مع غارميش · غارميش`, `Host with Gharmish · Gharmish`                                          | `كن مضيفًا في أبها وعسير · غارميش`, `Become a host in Abha & Aseer · Gharmish`                 |
| SEO-19 | The Arabic BreadcrumbList root is now localized | `/ar/abha`, `/ar/experiences/nature`, `/ar/hosts/aura`: position 1 `"name":"Gharmish"`                | `"name":"غارميش"`, from `siteMeta.name`                                                        |
| SEO-20 | Two EN titles brought under 60 characters       | `/en/abha` was 62 chars and `/en/how-it-works` was 66                                                 | 50 and 57 chars                                                                                |

## Findings by severity

| ID     | Sev | Finding                                                                                                                        | Evidence                                                                                                                                                                 | Status                                                                                               | Owner              |
| ------ | --- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------ |
| SEO-01 | P1  | Home page had no og:image                                                                                                      | Live `/ar`, `/en` now `og:image=…/{ar,en}/opengraph-image`, `200 image/png`                                                                                              | **Fixed, verified live** (#50)                                                                       | —                  |
| SEO-02 | P1  | Review cards linked to paused listings, which return 404                                                                       | The 52 unique internal links on 17 live pages all point to known routes. None link to `/experiences/{paused-slug}`.                                                      | **Fixed, verified live** (#50)                                                                       | —                  |
| SEO-06 | P2  | Thin landings and empty grids                                                                                                  | Live main-content words: `/ar/experiences/nature` 176, `/en/experiences/women-only` 171, `/ar/abha` 150, `/en/abha` 195. Grids are still empty.                          | **Partly fixed** (`e7273a5` adds editorial). Fully fixed once listings go live.                      | Founder (listings) |
| SEO-07 | P2  | Slogan-only titles                                                                                                             | Live `/ar/help`: «المساعدة والأسئلة الشائعة — الحجز والدفع والاستضافة · غارميش» (60)                                                                                     | **Fixed, verified live** (`e7273a5`)                                                                 | —                  |
| SEO-08 | P2  | `/hosts/host` has a generic slug. Its English bio opens `We" offers…`, and the EN title shows the Arabic-only name «رحلات وعي» | Live `/en/hosts/host` description and `/llms.txt`                                                                                                                        | Open. This is host data, so admin needs to set a real slug, an English display name and a fixed bio. | Ops                |
| SEO-09 | P2  | AR home lab LCP is high                                                                                                        | Lighthouse mobile, local build: `/ar` LCP 4.8 s (was 5.9 s) and Perf 62, against `/en` at 3.7 s and 87                                                                   | Open. Speed Insights, mounted in `64f6f74`, will give field LCP next week.                           | Eng                |
| SEO-10 | P2  | Catalog descriptions under 70 chars                                                                                            | Live `/ar/experiences` 125, `/en/experiences` 154                                                                                                                        | **Fixed, verified live**                                                                             | —                  |
| SEO-17 | P2  | Brand repeated in host-profile titles                                                                                          | See "Fixed this run"                                                                                                                                                     | Fixed in #53                                                                                         | —                  |
| SEO-18 | P2  | Brand repeated in `/hosting` title                                                                                             | See "Fixed this run"                                                                                                                                                     | Fixed in #53                                                                                         | —                  |
| SEO-11 | P3  | Non-standard `LLM:` directive in robots.txt                                                                                    | Live robots.txt now has `# LLM: https://gharmish.com/llms.txt`. Lighthouse no longer flags robots-txt.                                                                   | **Fixed, verified live**                                                                             | —                  |
| SEO-12 | P3  | og:locale missing below home                                                                                                   | Present (`ar_SA` / `en_US`) on all 17 fetched pages                                                                                                                      | **Fixed, verified live**                                                                             | —                  |
| SEO-13 | P3  | Host JSON-LD                                                                                                                   | `hasCredential` reads «مضيف موثوق» on `/ar/hosts/aura`. Brand hosts (`aura`, `host`, `asir-adventures-co`) are still `@type: Person`.                                    | Partly fixed. The type needs a `hosts.kind` signal; until then this is a note.                       | Eng                |
| SEO-14 | P3  | Organization has no sameAs                                                                                                     | contactPoint and address are live. `sameAs` is absent.                                                                                                                   | Waiting on the owner's official social handles                                                       | Founder            |
| SEO-15 | P3  | `/experiences` streams in behind a skeleton                                                                                    | Live `<main>` word count is 0 before hydration (template block)                                                                                                          | Note only. Caching and streaming changes are deferred.                                               | —                  |
| SEO-16 | P3  | a11y issues                                                                                                                    | Heading order is fixed (`/ar/experiences/nature` a11y 100). Home a11y is 96 (color contrast).                                                                            | Partly fixed                                                                                         | Eng                |
| SEO-19 | P3  | Latin "Gharmish" breadcrumb root on Arabic pages                                                                               | See "Fixed this run"                                                                                                                                                     | Fixed in #53                                                                                         | —                  |
| SEO-20 | P3  | EN titles over 60 characters                                                                                                   | See "Fixed this run"                                                                                                                                                     | Fixed in #53                                                                                         | —                  |
| SEO-21 | P3  | Intermittent layout shift on the AR home hero                                                                                  | 1 of 3 local Lighthouse runs: CLS 0.225 from `HeroHighlands` (`components/marketing/hero-highlands.tsx:77`, the ridge layers animate in). The other runs measured 0.001. | Watch. Confirm with Speed Insights field CLS before changing anything.                               | Eng                |

**Verified healthy this run (no finding):**

- robots.txt allows `/{ar,en}/hosts` and `/{ar,en}/hosting`, disallows the 8 private prefixes, and its `Sitemap:` line resolves.
- sitemap.xml has 44 URLs, all with en/ar/x-default. It contains 0 experiences, matching 0 `live` rows, and all 4 `verified` hosts. Pending (`mountain-roots-collective`) and suspended (`sarawat-expeditions`) hosts are absent.
- llms.txt returns 200 `text/plain` and lists 4 hosts and 0 live experiences.
- 38 static page-locales on the local build: 0 duplicate titles, 0 duplicate descriptions, every description between 70 and 160 chars, exactly one `<h1>` each, og:image and og:locale on all of them.
- Private pages: `/en/me`, `/en/wishlist`, `/en/sign-in` and `/ar/me` are `noindex, nofollow`. `/en/host` and `/en/admin` 307 to sign-in. All are disallowed.
- Unknown slugs return a real 404 with `noindex`, both live (`/ar/experiences/zzzz-not-a-slug`) and local.
- OG images return `200 image/png`: live `/en/opengraph-image` and `/ar/hosts/aura/opengraph-image`, plus 4 routes locally.
- The Organization, WebSite+SearchAction, ItemList, BreadcrumbList (3 levels), Person and FAQPage blocks all parse. FAQPage appears only on `/help` and `/hosting`.

## Regressions since last run

`git log b341775..e7273a5` touched 19 SEO-surface files (`e7273a5`) plus `app/[locale]/layout.tsx` (`64f6f74`, Speed Insights). **No regressions found.** Every page touched by `e7273a5` returns 200 with one `<h1>`, a self-canonical and matching hreflang. The verification tags in the layout are unchanged. The only new signal is SEO-21, which is intermittent and in a file neither commit touched.

## Organic traffic and demand gaps

| Window (rolling, from 14:20 UTC) | AR  | EN  | Total | WoW  |
| -------------------------------- | --- | --- | ----- | ---- |
| Last 7 days                      | 0   | 3   | **3** | −67% |
| Previous 7 days                  | 3   | 6   | 9     | —    |

This morning's run counted 4 and 8. The window has rolled forward 5 hours since then, so the numbers are not comparable one to one.

**Zero-result searches (28 days):** unchanged since this morning. Almost all are category filters (`category=nature&originals=1` ×22, `women_only` ×5, `adventure` ×4) caused by 0 live listings. The free-text gaps are `aura` ×3 (a host name) and `خيل` ×2.

## SERP presence (★ = from search excerpts only)

| Keyword                                   | gharmish.com seen?                | Who holds the excerpts                                                       |
| ----------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------- |
| `site:gharmish.com`                       | No ★                              | Unrelated (Garmisch, Gharieni)                                               |
| تجارب أبها                                | Not found in the first excerpts ★ | platinumlist.net, sabq.org                                                   |
| things to do in Abha                      | Not found ★                       | laurewanders.com, Expedia, listmag, hotelscombined                           |
| جبل السودة رحلة (replaces «رحلات السودة») | Not found ★                       | mawdoo3, excursionmania, saudipedia, aawsat                                  |
| Abha experiences local host               | Not found ★                       | **book.visitsaudi.com** (two hosted Asiri-home experiences), Expedia, Airbnb |
| غارميش أبها (brand)                       | Not found ★                       | Wikipedia (Abha), kupi, saudipedia                                           |

The other tracked keywords (أنشطة في أبها, سياحة عسير تجارب, Aseer tours, Soudah tours) were checked 5 hours ago in the first run and were not re-queried. No new keywords were added, because the zero-result searches have not changed.

## Performance signals

| Page (local build, Lighthouse mobile) | Perf | SEO\* | A11y | LCP   | CLS                    | TBT    |
| ------------------------------------- | ---- | ----- | ---- | ----- | ---------------------- | ------ |
| `/ar`                                 | 62   | 92    | 96   | 4.8 s | 0.225 / 0.001 (2 runs) | 400 ms |
| `/en`                                 | 87   | 92    | 96   | 3.7 s | 0.001                  | 170 ms |
| `/ar/experiences/nature`              | 75   | 92    | 100  | 4.4 s | 0                      | 390 ms |

\*SEO went from 85 to 92 because robots.txt is now valid. The remaining failure is the canonical audit, which is expected on localhost because the canonical points at gharmish.com.

- **TTFB, local, median of 5:** `/ar` 36 ms, `/ar/experiences` 32 ms. Production TTFB is not measured, because the sandbox proxy blocks direct requests.
- **Vercel runtime errors (7 days):** 2 admin `DeadlineError` groups (a known nuisance) and 1 transient pooler drop on `/[locale]/experiences/[slug]` on 2026-10-05. None affect public SEO. 0 failed deployments.
- **Speed Insights** was mounted in `64f6f74`. The first field LCP, INP and CLS by route should be available next run.

## Deferred and accepted items

| Item                                                            | Status                                                                   |
| --------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `force-dynamic` locale layout, no root `loading.tsx`            | Owner decision, kept so 404s stay real. Caching is deferred, never a P0. |
| Experience photography                                          | Quarantined since 2026-08. The fix is a photo shoot (owner task).        |
| x-default → Arabic                                              | Owner decision. Verified on 17 of 17 fetched pages.                      |
| `asir-adventures-co` / `asiri-coffee-*` slugs, "Aseer" spelling | Kept on purpose                                                          |
| `accepted:` list                                                | Empty                                                                    |

## Decisions for the founder

1. **Verify Google Search Console and Bing Webmaster Tools.** `verification` in `app/[locale]/layout.tsx` still has no `google` key. Until it's verified, Visibility is a proxy, and the 3 Google visits a week are the only signal. Add the token and submit `https://gharmish.com/sitemap.xml`. This is a standing item.
2. **Bring one listing back to `live`.** The 9 landing pages now carry real editorial copy, but every grid is empty, and there is still no experience page to index. This is the same item as [#9](https://github.com/Gharmish/FWEXMP/issues/9).
3. **Fix the `/hosts/host` profile** (SEO-08). It needs a real Latin slug, an English display name and a corrected English bio. This is admin data, not code.

## Next-run watchlist

- Merge and deploy #53, then re-check live host-profile and `/hosting` titles and the `/ar` breadcrumb root.
- Speed Insights field data: AR home LCP (SEO-09) and CLS (SEO-21) on real devices.
- The first listing back to `live`: confirm it reaches the sitemap, gets Product JSON-LD with `priceCurrency SAR`, and `card.png` returns 200.
- Organic: 3 visits a week, 0 Arabic. Watch whether the new landing copy earns any Arabic organic entry.
- SEO-13: decide whether `hosts` has a reliable business/person signal before typing brand hosts as `Organization`.
