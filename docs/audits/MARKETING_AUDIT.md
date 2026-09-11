# Gharmish — Full Marketing Audit

> **Remediation addendum (same day, 2026-08-15):** every code-level P0/P1 and most
> P2s below were FIXED in the working tree the same afternoon (typecheck, lint, and
> all 813 tests green; smoke-tested on a local server). Shipped: robots `/hosts`
> unblock · keyworded home titles · OG images on the money pages · alternates +
> x-default everywhere · real sitemap lastmod + empty-guard · description clamps ·
> 3-level breadcrumbs · positioning line locked · marketing-consent capture (new
> DB columns, live) · click-id capture/persistence (gclid/ttclid/fbclid) ·
> event_id + items on all pixel events · gross purchase value · server-side TikTok
> CompletePayment from settlement · GA4 MP refund reversal · add_payment_info ·
> consent-mode ordering + honest banner copy + footer "Cookie settings" · AR
> catalog feed + imageless-row guard · rating above the fold · wishlist + payment
> marks on the detail page · scarcity threshold · sticky-CTA first-tap fix ·
> party-size 50 cap · promo field collapse · related-experiences cross-sell
> (detail, sold-out, confirmation) · honest sold-out copy · instant-booking
> "spot held" message + T-2h payment nudge cron pass · review invite deep link +
> WhatsApp payload · wallet `promo` reason.
>
> **Second pass (same evening):** the larger builds shipped too — indexable
> **category landing pages** at `/experiences/{category}` (7 categories, editorial
> EN/AR intros, ItemList/Breadcrumb markup, linked from home tiles + sitemap) ·
> **/abha** city landing ("things to do in Abha") · **/about** with a real contact
> block, footer-linked · **post-trip series**: suppression `scope` column (live,
> so a campaign unsubscribe can never block receipts), signed one-tap unsubscribe
> endpoint, and consent-gated D+7 rebook + D+90 win-back emails on the hourly cron.
> **Third pass:** the referral mechanic is now BUILT and dormant — per-guest codes
> (minted lazily, unguessable), `?ref=` first-touch capture, attribution on the
> booking row, and a two-sided `promo` wallet credit issued idempotently at the
> referred guest's first paid settlement (self-referral and repeat bookings
> excluded). It pays nothing until the owner sets
> `platform_settings.referral_reward_sar` (default 0), so the only referral
> decision left is the amount. ISR migration: closed as WON'T-DO-as-specified —
> public pages now read the wishlist cookie, which makes them request-dynamic
> regardless of `force-dynamic`; the real fix is a wishlist-read restructure, a
> separate project.
>
> Still open — human-only, not codeable: the two env secret values (TikTok
> Events token, GA4 API secret — obtained from those consoles), Meta approval of
> the two WhatsApp templates, the photo shoot, commission disclosure copy, the
> referral reward amount, and whether Google/Meta spend is planned.

**Date:** 2026-08-15 · **Lens:** senior digital-marketing review (Airbnb marketplace playbook) · **Method:** five parallel code audits (SEO, analytics, conversion funnel, lifecycle/CRM, content & brand) + live checks against gharmish.com (rendered head, robots.txt, sitemap.xml, JSON-LD, /api/catalog/tiktok.csv). Findings are code-verified with file:line evidence; nothing here was changed — report only.

---

## Executive summary

Gharmish's **engineering foundation for marketing is better than most funded marketplaces** — consent-gated pixels done correctly, real JSON-LD with honest availability, a disciplined noindex/404 posture, a ledgered bilingual transactional-comms rail, genuinely senior copy in both languages, and best-in-class Arabic OG rendering. The problems are almost all in what's *missing on top* of that foundation, and they cluster into five headlines:

1. **The growth loop has no second act.** After the (email-only) review invite, no code path ever touches a past guest again. No rebook nudge, no win-back, no referral, and — most damaging — **no marketing-consent capture**, so every booking taken today is a contact that can never legally be marketed to.
2. **Conversions are measured only in the happy-path browser.** No server-side conversion API exists; a purchase that settles via webhook or watchdog cron (guest closed the 3DS tab) fires **no conversion event on any ad platform, ever**. Google Ads and Meta have zero wiring. Consent Mode v2 has no default-denied state, so GA4 silently undercounts everyone who didn't click "Accept all."
3. **Organic acquisition surface is near zero.** One line in robots.txt (`Disallow: /en/host`) prefix-blocks every `/hosts/…` profile page while the sitemap submits them; the homepage `<title>` is just the brand word; and there are **no crawlable category/city landing pages** — nothing can ever rank for "things to do in Abha" / "تجارب أبها".
4. **The funnel converts well but never recovers anyone.** Abandoned instant-bookings get no message until a cron fires up to ~24h later; sold-out listings dead-end with copy promising a messaging feature that doesn't exist; ratings exist but are invisible above the fold on the detail page.
5. **The brand sells invisible product.** Zero first-party photography anywhere; every gap has an elegant engineered fallback, which hides the urgency. The seed script fills galleries with *other listings'* photos — verify that never reached prod. Story fields (the entire positioning promise) are empty on all launch listings.

**Domain scores** (marketplace-standard bar):

| Domain | Foundation | Growth readiness |
|---|---|---|
| SEO | 8/10 | 3/10 |
| Analytics & measurement | 7/10 (browser) | 3/10 (full-stack) |
| Conversion funnel / CRO | 8/10 (trust & friction) | 4/10 (persuasion & recovery) |
| Lifecycle / CRM | 9/10 (transactional) | 1/10 (marketing lifecycle) |
| Content & brand | 9/10 (copy craft) | 2/10 (content supply) |

---

## What is genuinely strong — protect it

- **Consent gating is real, not theater.** No tracker script renders until explicit accept (`components/layout/marketing-pixels.tsx:41,66`); pixels mount instantly on consent via `useSyncExternalStore` — no reload needed.
- **Purchase event integrity.** Fires only on DB-verified `paymentStatus === 'paid'` with two-layer dedupe (`app/[locale]/book/confirmed/[ref]/page.tsx:655-659`, `features/bookings/components/purchase-conversion.tsx:32-39`). No fake conversions from spoofed URLs.
- **content_id ↔ catalog matching is correct** (slug as `sku_id` in the feed and `content_id` on events) — the thing most marketplaces get wrong.
- **Structured data is thoughtful.** `Product` + offers + conditional `aggregateRating` + honest `SoldOut` availability on detail pages; `FAQPage` generated from the same translation keys the page renders; XSS-escaped JSON-LD component. Verified live.
- **Indexability discipline.** 19 pages explicitly noindexed; real 404s (no soft-404s) via a deliberate no-`loading.tsx` architecture; legacy host slugs 308-redirect.
- **Trust stack above market standard.** Tappable "Verified by Gharmish" receipt at the money moment; per-date cancellation deadlines computed as the guest picks a day; VAT-inclusive pricing with a hard charge cap; payment marks + PCI language at checkout.
- **Friction engineering.** True guest checkout (no forced OTP), returning-guest prefill, Apple Pay skips billing address, idempotency-keyed submits, error-scroll-and-focus recovery.
- **Transactional comms rail.** ~30 ledgered, deduped, suppression-aware, bilingual, dual-channel (email + WhatsApp) touchpoints through one dispatcher (`lib/notifications/dispatch.ts:48`).
- **Copy and Arabic quality.** Benefit-led, disciplined voice; AR is authored (not translated), 100% key parity, zero `TODO(ar)`; hand-built Arabic-in-Satori OG engine (`lib/og/satori-arabic.ts`) that almost nobody ships correctly.
- **First-party analytics hygiene.** `after()`-isolated capture that can't slow guest pages; zero-result search logging; a strong admin KPI dashboard (`viewToRequestPct`, `checkoutAbandonPct`, `bookingsBySource`, `zeroResultQueries`).
- **`/llms.txt`** generated live from data — a real AI-discovery asset.

---

## P0 — fix now (days, not weeks)

| # | Finding | Evidence | Fix |
|---|---|---|---|
| P0-1 | **robots.txt blocks every host profile.** `Disallow: /en/host` prefix-matches `/en/hosts/…`; only `/hosting` got a rescuing `Allow`. Sitemap submits the same URLs → Search Console conflict, entire E-E-A-T surface dark. Confirmed live. | `app/robots.txt/route.ts:26-44` | Add `Allow: /{locale}/hosts` (or change disallow to `/{locale}/host/`). One line. |
| P0-2 | **Webhook/cron-settled purchases never fire a conversion.** `PurchaseConversion` mounts only on the confirmation page; bookings settled by the HyperPay webhook or watchdog cron emit nothing on any platform. | `features/payments/settle.ts:230`, `confirmed/[ref]/page.tsx:655` | Emit conversion server-side from the single `paid` transition in `settle.ts`. |
| P0-3 | **No server-side conversion API at all.** Every conversion is browser-only — behind consent, ad blockers, ITP. Largest reported-conversion loss for a TikTok-led KSA funnel. | no `business-api.tiktok`/MP/CAPI refs anywhere | TikTok Events API `CompletePayment` from `settle.ts`, sharing an `event_id` with the client pixel (see P1-4). |
| P0-4 | **No marketing-consent capture anywhere.** Checkout collects only the terms checkbox. Every guest acquired today is permanently unaddressable for marketing. | `features/bookings/components/booking-request-form.tsx:856-867`, `docs/notifications/twilio-setup.md:266` | Add an unchecked, separately-stored marketing-consent field to the booking form **before more volume accrues**. |
| P0-5 | **Post-experience lifecycle ends at an email-only review invite** — in a phone-primary market where `guests.email` is nullable. Phone-only guests get zero post-trip contact; no rebook/win-back/anniversary path exists at all. | `booking-email.ts:1613-1690`, `db/schema.ts:364-381` | Approve a WhatsApp review template + payload; then D+7 rebook and D+90 win-back messages. |
| P0-6 | **Zero first-party photography; seed galleries borrow sibling photos.** Every surface has an engineered fallback (SVG hero, tonal cards, typography-only OG) that masks the urgency. Mismatched gallery photos in prod would be the most trust-destroying state possible for an authenticity brand. | `db/seed.ts:52-69`, `public/images/` (4 logo files), `experience-card.tsx:141-145` | Verify prod `experiences.images` today (null borrowed heroes if present); book the shoot for all 6 launch listings as a launch dependency. |
| P0-7 | **No referral mechanic at the peak-intent moment.** The confirmation-page ShareButton is generic UTM-tagged sharing — no per-guest code, no reward, no attribution to the sharer. | `components/ui/share-button.tsx:57`, `confirmed/[ref]/page.tsx:838` | Attach a per-guest referral code to the confirmation share; pay both sides in wallet credit (blocked by P1-11 enum). |

---

## P1 — material loss (fix within 30 days)

**Measurement**

| # | Finding | Evidence | Fix |
|---|---|---|---|
| P1-1 | Consent Mode v2 in name only: consent defaults only run *after* accept; "Essential only" users are 100% invisible — no modeled conversions, no baseline. | `marketing-pixels.tsx:66,83-88` | Load gtag with default-denied, then `gtag('consent','update')` on accept. |
| P1-2 | Google Ads + Meta: zero measurement wiring (no `AW-` tag, no `fbq`); GA4 runs `ad_storage: denied` so even conversion import is crippled. | `lib/env-client.ts:40-42` | Add both IDs to the existing env/consent chassis; fire on the existing purchase path. |
| P1-3 | No hashed advanced matching on any pixel (`ttq.identify` absent) — Event Match Quality at the floor despite collecting email+phone at booking. | `booking-request-form.tsx` | SHA-256 email/phone at submit → `ttq.identify()`. |
| P1-4 | No `event_id` on any event — browser/server dedup impossible; hard blocker for P0-3. | `lib/funnel-tracking.ts:64-152` | Deterministic `event_id` (e.g. `purchase:${reference}`). |
| P1-5 | Purchase `value` is the net card charge — wallet-credit bookings underreport (or report 0), so ROAS bidding underweights your best repeat cohort. | `confirmed/[ref]/page.tsx:657`, gross computed at `:559` | Send `totalAmountSar + walletAppliedSar`. |
| P1-6 | Catalog feed: English-only titles/links in an Arabic-majority market; `availability` hardcoded `in stock`; empty/relative `image_link` rows silently rejected by TikTok. | `app/api/catalog/tiktok.csv/route.ts:31-37` | Ship an `ar` feed variant; derive availability from live capacity; skip/absolutize imageless rows. |
| P1-7 | UTM capture is click-id-blind: gated on `utm_source` presence, so `?gclid=`/`?ttclid=`-only landings (what auto-tagging actually sends) capture nothing; offline conversion import impossible. | `features/analytics/utm-capture.tsx:22`, `db/schema.ts:715-717` | Capture gclid/ttclid/fbclid + landing page alongside the triplet. |

**Funnel**

| # | Finding | Evidence | Fix |
|---|---|---|---|
| P1-8 | Abandoned instant-booking = zero recovery until a cron up to ~24h later, framed as "your hold lapsed." Highest-intent abandonment in the funnel, unworked. | `features/bookings/actions.ts:749-767`, `booking-email.ts:977,1184` | Immediate "we're holding your spot until HH:MM" email/WhatsApp with the tokenized pay link; T-2h nudge in the cron. |
| P1-9 | Rating/review count invisible above the fold on the detail page — catalog cards show stars, then the guest *loses* social proof on click-through (inverse of Airbnb's pattern). | `[slug]/page.tsx:570-590,800-877` | `4.9 · 23 reviews` anchor under the H1 and in the booking panel. |
| P1-10 | No WhatsApp contact before booking anywhere; sold-out copy says "message the host" but no messaging feature exists — a dead end with false copy. | `supportWhatsappE164` used only on confirmation; `messages/en.json:2522` | WhatsApp affordance on detail/pay pages; sold-out → notify-me email capture + similar-experience cards. |
| P1-11 | Wallet credit structurally blocked from marketing use: issuance hard-locked to `reason: 'goodwill'` though the DB enum already supports `promo`; promo codes have no distribution channel (never appear in any message). | `features/wallet/schemas.ts:46`, `db/schema.ts:1384-1392` | Widen enum to `promo`/`referral`; embed a first-booking code in recovery/win-back messages. |
| P1-12 | Latent booking-blocker: server schema caps `partySize` at 20 while listings allow `maxGroupSize` up to 50 — first large-group listing becomes unbookable with a generic "Required" error. | `features/bookings/schemas.ts:38` vs `host-experiences/schemas.ts:60` | Raise cap to 50; map the `too_large` zod code. |

**SEO & content**

| # | Finding | Evidence | Fix |
|---|---|---|---|
| P1-13 | Homepage has no `<title>` of its own — falls through to bare "Gharmish/غارميش." Zero keywords on your highest-authority page. Confirmed live. | `app/[locale]/page.tsx:44-63` | `Gharmish — Experiences in Abha & Aseer / غارميش — تجارب في أبها وعسير`. |
| P1-14 | `/experiences` and `/hosts` (the two money pages) lost their OG image to Next's shallow-merge trap — the seven low-value legal pages fixed it, the commercial pages were missed. WhatsApp shares render as bare text links. | `(catalog)/page.tsx:46-56`, `hosts/page.tsx:40-46`; fix pattern documented at `hosting/page.tsx:33-45` | Re-attach `images:` on both; add a test asserting every `openGraph` block sets images. |
| P1-15 | No category/city landing pages — filtered URLs self-canonicalize away; nothing can rank for any category × city head term. **The single largest organic-growth project.** | `(catalog)/page.tsx:43`; filters navigate via `router.replace` | Ship `/experiences/[category]` + `/abha` with editorial intros, self-canonicals, crawlable links, sitemap entries. |
| P1-16 | Seven indexable pages (incl. `/hosting`) have no canonical/hreflang while the sitemap claims alternates — unconfirmed hreflang is discarded. | e.g. `hosting/page.tsx` (no `alternates` key) | Copy the `alternates` block from `/experiences`. |
| P1-17 | Master positioning line drifts across three EN variants; the one wrong variant ("their place") is `siteMeta.description` — the SERP description and default OG card tagline. AR is consistent in all four spots. | `messages/en.json:4` vs `:2341,:3080,:2372` | Lock to "the place best" + a consistency test. |
| P1-18 | `/hosting` answers zero commercial questions — no commission %, no earnings range, no payout timeline, no host faces/quotes. Airbnb publishes all of these on the equivalent page. | `messages/en.json:1431`, `hosting/page.tsx:98-295` | Earnings block + payout SLA + a 3-host proof strip from existing host records. |
| P1-19 | `force-dynamic` on the locale layout puts 100% of anonymous traffic on the SSR hot path (no ISR/CDN caching) to solve a status-code problem that only exists on gated routes. TTFB → LCP → crawl budget. | `app/[locale]/layout.tsx:28` | Move `force-dynamic` to gated segments; ISR public pages. |

---

## P2 — meaningful (60-day window)

- **Refunds never reported to any ad platform** — ROAS permanently inflated (`features/admin/bookings/actions.ts:86`). Fire GA4 `refund` with the same `transaction_id`.
- **Missing events:** `view_item_list`/`select_item`, GA4 `search`, `sign_up`/CompleteRegistration (host acquisition has zero conversion signal), `add_payment_info` (widget drop-off unmeasurable), `add_to_wishlist`.
- **Consent is a one-way door:** no settings link to change it, 365-day cookie, no re-ask. Also banner copy names Snap/TikTok even when only GA4 is configured — depressing accept-rate for nothing (`messages/en.json:3109`).
- **Wishlist is captured intent with zero consumers** (`saved_experiences` referenced by no sender). "Dates opened on your saved experience" is the obvious first trigger.
- **Suppression is all-or-nothing:** one marketing STOP will kill a guest's booking confirmations too. Add a `transactional`/`marketing` category column **before** the first campaign (`db/schema.ts:1798-1810`).
- **Segmentation readiness:** `analytics_events` is deliberately anonymous, guests carry no RFM columns, first-touch UTM dies with the tab (sessionStorage). Fine pre-consent; becomes the ceiling the day CRM starts.
- **Confirmation page cross-sell absent** — highest-intent surface offers one text link. Add 3 same-city/category cards.
- **Story fields empty on every listing** (`hosts.storyEn/Ar`, `experiences.storyEn/Ar` all null in seed) — the positioning promise is asserted at the brand layer, never redeemed at the listing layer. `reviews.photos` is dead schema — the only photo source that scales without a shoot budget. `moments.photoUrl` dropped in the query mapper.
- **No About page, no contact surface anywhere** (footer has no email/WhatsApp; `hello@gharmish.com` appears once, in an error state). No press path.
- **Host lifecycle stops at approval** — no first-listing nudge, no earnings digest. Supply activation left to self-motivation.
- **Arabic detail pages can serve English body copy** under `lang="ar"` for host-created listings (`TODO(ar)` placeholder → EN fallback) — wrong-language hreflang signal in the primary market. Gate publish on real Arabic or noindex until translated.
- **Structured-data depth:** no `x-default` hreflang (confirmed live), region-less `ar`/`en` codes, breadcrumbs skip the middle level (and no visible breadcrumb UI), `Organization` lacks `sameAs`/address/contact, sitemap `lastModified` is uniformly "now," sitemap silently empties on a transient DB error.
- **Scarcity backfires at high inventory:** "14 spots left" is an abundance signal — threshold the pill at ≤4. Double clickwrap (booking + pay) is measurable drop-off — carry the first acceptance forward. Cancellation flow has no reschedule deflection and captures no reason.

## P3 — polish

Review-invite CTA lands on `/me` instead of deep-linking the review form; promo field always expanded (invites off-site code-hunting); `add_to_cart` fires before server confirm; purchase dedupe keys never expire; both font families preload in both locales; footer links to noindexed pages; `/dev` lacks meta noindex; meta descriptions unclamped; two AR variants of the "Apply to host" CTA; EN/AR home headlines carry different propositions (pick one deliberately); FAQ covers booking mechanics only — no what-to-wear/weather/women-only/gifting questions (which double as long-tail SEO).

---

## Roadmap

**This week — one-line fixes with outsized impact**
1. robots.txt `Allow /hosts` (P0-1) · 2. Homepage title (P1-13) · 3. OG images on `/experiences` + `/hosts` (P1-14) · 4. `siteMeta` positioning line (P1-17) · 5. Verify prod galleries aren't borrowed (P0-6) · 6. Purchase value incl. wallet credit (P1-5) · 7. Sold-out copy honesty (P1-10) · 8. Scarcity threshold · 9. Marketing-consent checkbox (P0-4 — the clock is running on every booking).

**30 days — measurement + recovery**
`event_id` → server-side purchase from `settle.ts` (TikTok Events API) → Consent Mode v2 default-denied → hashed advanced matching → click-id capture → AR catalog feed + real availability → WhatsApp review template → instant-booking hold message + T-2h nudge → rating above the fold → WhatsApp pre-purchase contact → party-size cap fix → hreflang/canonical on the seven pages.

**60 days — content + loops**
Photography shoot (6 listings: hero + gallery + host portrait) → photo OG variant → review-photo upload → write 6 experience stories + host stories required at onboarding → category/city landing pages (`/experiences/[category]`, `/abha`) → referral codes with two-sided wallet credit → D+7 rebook + D+90 win-back series → suppression category column → promo distribution in messages → confirmation cross-sell → `/hosting` earnings block + host proof.

**90 days — scale**
Google Ads + Meta wiring (consider a tag manager before channel #4) → refund reporting → `view_item_list`/`sign_up`/`add_payment_info` events → host lifecycle (D+3 activation nudge, monthly digest) → `/about` + contact surface → editorial city guides → guest RFM columns + consent-gated identified events → wishlist-triggered messages → ISR migration for public pages.

**Owner decisions needed (not engineering):** shoot budget & date; commission % public disclosure on `/hosting`; referral incentive size; marketing-consent copy (counsel review alongside the pending legal items); whether Google Ads/Meta spend is planned (determines P1-2 priority).

---

*Full per-domain findings with complete evidence trails are preserved in the five audit agents' reports; this document is the deduplicated, prioritized synthesis.*
