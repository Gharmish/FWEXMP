# Gharmish — Pitch Deck

_The experiences marketplace for Saudi Arabia_
غرميش — سوق التجارب في المملكة

---

## Slide 1 — Title

# Gharmish (غرميش)

### Book the real Saudi Arabia.

The marketplace where local hosts sell unique experiences — desert nights,
Aseeri coffee rituals, coastal dives, cooking classes — and travelers book
them in two taps, in Arabic or English, paying with mada or Apple Pay.

_[Founder name] · [email] · gharmish.com_

---

## Slide 2 — The Problem

**Saudi Arabia opened to tourism. The supply of _experiences_ didn't come with it.**

- 100M+ visitors targeted by 2030 under Vision 2030 — but "things to do"
  are scattered across Instagram DMs, WhatsApp groups, and word of mouth.
- Local hosts (guides, activity companies, freelancers) have **no trusted
  channel** to reach guests, get paid online, or build a reputation.
- Travelers — nationals, expats, and tourists — **can't discover, compare,
  or book** authentic activities in one place, in their language, with a card
  they actually own (mada).
- Global players (Airbnb Experiences, GetYourGuide) are **not localized**:
  no Arabic-first RTL, no mada, thin Saudi inventory, no cultural fit.

> The demand exists. The trusted, local rails don't.

---

## Slide 3 — The Solution

**Gharmish is the Arabic-first marketplace for booking experiences in the Kingdom.**

- **For guests:** discover → book → pay online in minutes. Full Arabic/English
  with true RTL, prices in SAR, mada + Apple Pay + cards at checkout.
- **For hosts:** list an experience, set availability and price, get verified
  (KYC), receive bookings and payouts — a real storefront, not a DM inbox.
- **For the platform:** every booking is instrumented, reviewed, and
  reputation-scored, so trust compounds on both sides.

One place. Two taps. Built for how Saudi actually pays and reads.

---

## Slide 4 — Why Now

- **Vision 2030 tourism push** — Saudi is spending at scale to become a global
  destination; "experiences" is the highest-margin, most under-supplied layer.
- **Payments matured** — mada, Apple Pay, and local gateways (HyperPay) make
  online booking frictionless for the domestic majority.
- **Digital-native, mobile-first population** — among the world's highest
  smartphone and social penetration; discovery already happens online.
- **Domestic + inbound tourism both rising** — nationals rediscovering the
  Kingdom (AlUla, Aseer, the coast) and inbound visitors arriving with e-visas.

> The market, the payments, and the audience arrived at the same time. The
> localized marketplace to serve them hasn't been built — yet.

---

## Slide 5 — Product

**Live today at gharmish-weld.vercel.app**

- **Discovery** — home, category browse, search, city coverage, map view (keyless OSM/Leaflet).
- **Experience detail** — gallery, AR/EN toggle, host card, reviews, availability, price calculator.
- **Booking flow** — date/slot → guests → details → pay (HyperPay: card + Apple Pay) → confirmation.
- **Host dashboard** — create/edit experiences, photo upload, availability, earnings rollups, KYC onboarding.
- **Admin panel** — approval queue, catalog & city management, marketplace-health metrics, funnel analytics.
- **Trust & tax** — verified-only host surfaces, ZATCA-ready receipts/QR, VAT-toggle for when the threshold is crossed.

Fully bilingual, mobile-first, on the Saudi-sand brand palette.

---

## Slide 6 — How It Works

1. **Host lists** an experience — title, photos, location (map pin), duration,
   group size, price in SAR — and passes KYC verification.
2. **Guest discovers** by city, category, price, or date; compares by rating.
3. **Guest books & pays** online — mada / Apple Pay / card — and gets an
   instant confirmation + receipt.
4. **Host delivers** the experience; guest **leaves a review**.
5. **Gharmish takes a commission** on each booking and settles payout to the host.

Reputation, availability, and payments all live on one set of rails.

---

## Slide 7 — Business Model

**Marketplace commission — we make money when hosts do.**

- **Take rate:** commission on each confirmed booking (target ~15–20% blended).
- **VAT-inclusive pricing** already built; VAT collection switches on at the
  ZATCA registration threshold (SAR 375K), with per-booking tax snapshots.
- **Future lines:** featured/placement for hosts, service fees, upsells
  (insurance-free by design — hosts carry liability), and expansion SKUs.

Zero inventory risk. Revenue scales directly with GMV.

_(Illustrative — insert real take-rate and pricing assumptions.)_

---

## Slide 8 — Market

- **TAM** — Saudi tourism spend under Vision 2030, targeting 100M+ annual
  visitors and tourism as a double-digit share of GDP.
- **SAM** — the bookable _experiences & activities_ slice of that spend,
  domestic + inbound.
- **SOM (3-yr wedge)** — commission on experiences booked through Gharmish
  in a focused set of launch cities (Riyadh, Jeddah, Aseer, AlUla, the coast).

> We don't need a large share of tourism — a small share of _experience
> bookings_ is a large, high-margin business.

_(Insert sourced figures from SCTH / Ministry of Tourism for the raise.)_

---

## Slide 9 — Competition

|                       | Arabic-first RTL | mada / Apple Pay | Saudi inventory depth |   Local host tools   |
| --------------------- | :--------------: | :--------------: | :-------------------: | :------------------: |
| **Gharmish**          |        ✅        |        ✅        |   ✅ (built for it)   |   ✅ KYC + payouts   |
| Airbnb Experiences    |    ⚠️ partial    |        ❌        |        ⚠️ thin        |      ⚠️ generic      |
| GetYourGuide / Viator |        ❌        |        ❌        |        ⚠️ thin        |          ❌          |
| Instagram / WhatsApp  |       n/a        |        ❌        |           —           | ❌ no trust/payments |

**Our moat:** localization done right (language, payments, culture, tax),
a two-sided reputation graph, and host tooling the global players won't
bother to localize.

---

## Slide 10 — Traction / Status

**Product is live and real, not a mockup.**

- Sprints 1–4 shipped to production (gharmish-weld.vercel.app).
- Real auth (Supabase, OTP), real Postgres, real host/admin dashboards.
- Payments integrated on HyperPay (card + Apple Pay); domain registration
  with the gateway is the last step before live charges.
- Full AR/EN, ZATCA-ready invoicing, verified-host trust surfaces, funnel
  analytics instrumented end-to-end.

**Remaining pre-launch (human-gated):** SMS provider, live payment go-live,
CR/VAT registration, legal review of terms/privacy.

_(Insert live metrics as you gather them: listings, bookings, GMV, hosts.)_

---

## Slide 11 — Go-to-Market

- **Supply first, city by city** — recruit a critical mass of hosts in one
  city (e.g., Aseer or AlUla, where experiences are the whole reason to visit)
  before opening the next.
- **Seed with hero categories** — desert, coffee/culture, coast, food,
  women-only experiences (a differentiated, culturally-fit category we ship).
- **Demand via** consent-based social pixels (Snap/TikTok), SEO/structured
  data (already built), and partnerships with tourism bodies and hotels.
- **Trust flywheel** — verified hosts + reviews → higher conversion → more
  hosts. Repeat per city.

---

## Slide 12 — Roadmap

- **Now (MVP live):** discovery, booking, payments, host + admin dashboards, AR/EN.
- **Phase 2 — Growth:** reviews at scale, in-app host↔guest messaging, email/SMS
  notifications, advanced search + map, payout tracking.
- **Phase 3 — Scale:** deeper admin analytics, native mobile app, loyalty/referral,
  expansion to other GCC/MENA cities.

Each phase deepens the moat before widening the map.

---

## Slide 13 — Team

_[To complete]_

- **[Founder / CEO]** — [background: product, marketplace, Saudi market].
- **[CTO / Eng]** — [background].
- **[Growth / Ops]** — [background: host supply, local partnerships].
- **Advisors** — [tourism, payments, regulatory].

> Built lean: a modern Next.js/Supabase stack, shipped to production by a
> small team — capital-efficient by design.

---

## Slide 14 — The Ask

_[To complete]_

**Raising [SAR / $ amount] to:**

- Go live on payments and launch the first city end-to-end.
- Fund host supply acquisition (the hard side of the marketplace).
- Build Phase 2 (messaging, notifications, reviews at scale).
- Hire [key roles: growth, ops, 1–2 engineers].

**18-month goal:** [X hosts, Y bookings, Z GMV] across [N] cities, with a
proven, repeatable city-launch playbook.

---

## Slide 15 — Closing

# Gharmish

### Saudi Arabia is now a destination. We're how you experience it.

Local hosts. Real bookings. mada and Apple Pay. Arabic-first.
The trusted rails for the Kingdom's experience economy.

_gharmish.com · [contact]_
