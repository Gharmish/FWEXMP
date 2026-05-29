# Gharmish — Go-Live Runbook

> Turnkey checklist to take Gharmish from "deployed & feature-complete" to
> "open to real users." Everything in §1 is **done**; §2–§4 are the
> credential/account tasks that can only be completed by a human with the
> relevant accounts. The codebase is built so each integration **flips on
> when its environment variables arrive — no code change required.**

Live URL: https://gharmish-weld.vercel.app · Vercel project `gharmish` ·
Supabase `gharmish-experiences` (`xjgpflzkpydfpuomqhuq`, eu-central-1).

---

## 1. Done and deployed

- Bilingual storefront (AR default + EN, full RTL), home, search/browse,
  experience detail, host profiles.
- Booking **request** flow (guest enters name + phone — **no login
  required**), confirmation page, "your last request" on `/me`.
- Booking lifecycle: admin can confirm / cancel / complete / refund.
- Guest review submission (gated by a completed booking).
- Host onboarding (apply) + host experience CRUD + hero photo upload.
- Admin panel: moderation, host management, bookings, analytics, audit
  logs, **admin hero-photo replacement on any listing**.
- SEO: sitemap, robots, `/llms.txt`, Schema.org structured data.
- i18n catalogs complete — `messages/ar.json` has **zero `TODO(ar)`** and
  full key parity with `en.json`.
- Quality gates: `pnpm typecheck`, `pnpm lint`, **177 unit tests**, and
  `pnpm build` all green. Sentry wired (no-op until DSN set).

### What works **without** any further credentials (soft-launch surface)

| Journey                                             | Needs login?     | Status           |
| --------------------------------------------------- | ---------------- | ---------------- |
| Browse / search / experience detail / host profiles | No               | ✅ Live          |
| **Guest requests a booking** (name + phone)         | **No**           | ✅ Live          |
| Operator confirms/cancels/refunds bookings          | Admin (Test OTP) | ✅ Live          |
| Guest account (`/me`, wishlist, leave review)       | Yes → §2         | ⛔ Needs SMS     |
| Host self-service (apply, manage listings, upload)  | Yes → §2         | ⛔ Needs SMS     |
| Online card/Mada payment                            | — → §3           | ⛔ Needs Moyasar |

**Implication:** Gharmish can soft-launch today as a _request-to-book_
marketplace — guests request, the operator confirms and arranges payment
off-platform — with no further setup. §2–§4 unlock full self-service.

---

## 2. Real SMS (phone OTP sign-in) — Supabase Auth

Today only phones in Supabase's **Test OTP** table can sign in. Real users
need a live SMS provider.

1. Create an account with **Twilio** (Verify or Messaging) **or**
   **Messagebird** — both are supported by Supabase Auth out of the box.
   For KSA delivery, confirm the provider has a registered Sender ID / is
   approved for Saudi Arabia.
2. Supabase Dashboard → **Authentication → Providers → Phone** → enable,
   pick the provider, paste its credentials (Twilio: Account SID, Auth
   Token, Message Service SID).
3. Turn **off** "Enable phone confirmations via test OTP" (or leave test
   numbers for QA).
4. **Verify:** sign in at `/sign-in` with a real KSA number, receive the
   SMS code, land on `/me`.

No code change: the app already runs real Supabase Auth in production
(`hasSupabaseAuth()` is true). This is purely a dashboard configuration.

---

## 3. Real payments — Moyasar

The booking flow is currently **request-to-book** (no card is charged).
There is **no payment code yet** — see the decision note at the bottom.

When ready to take payment online:

1. Create a **Moyasar** merchant account (Mada, Apple Pay, STC Pay, Visa,
   Mastercard). Complete KYC. Obtain **test** then **live** keys.
2. Add env vars in Vercel (Production + Preview):
   - `MOYASAR_SECRET_KEY` (server-only, Sensitive)
   - `NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY`
   - `MOYASAR_WEBHOOK_SECRET`
3. Build/enable the Moyasar integration (hosted payment + webhook →
   booking `paymentStatus`/`status`). Recommend building against the
   **sandbox** first (BRIEF §10 explicitly permits "Moyasar sandbox at
   most" pre-launch), then flipping keys to live.
4. **Verify:** in sandbox, complete a booking with a Moyasar test card;
   confirm the webhook moves the booking to `confirmed`/paid and the
   confirmation page reflects it.

---

## 4. Custom domain

`gharmish.com` is **not available for purchase** (registered to someone —
confirm whether that's you).

- **If you own `gharmish.com`:** Vercel → project `gharmish` → Settings →
  Domains → add `gharmish.com` + `www`, then point DNS (A/ALIAS or
  Vercel nameservers) per the instructions Vercel shows. Add `ar`/`en`
  are path-based, so no extra domains needed.
- **If you don't:** alternatives checked available — `gharmish.app`
  ($9.99/yr), `gharmish.co` ($17.99/yr). Decide the brand domain before
  buying.
- After the domain is live, update `NEXT_PUBLIC_SITE_URL` (if introduced)
  / canonical URLs, the sitemap base, and Supabase Auth's allowed redirect
  URLs.

### Recommended while configuring infra

- Move Vercel **Functions region to `fra1`** (Frankfurt) to sit next to
  the eu-central-1 database — currently `iad1` (US East), which adds a
  transatlantic hop per query. Vercel → Settings → Functions → Region.

---

## 5. Pre-launch verification (once §2–§4 are in)

- [ ] Real SMS: sign in with a live KSA number end-to-end.
- [ ] Host path: apply → admin approves → create + publish a listing →
      upload a real photo.
- [ ] Guest path: browse → request booking → (if §3) pay sandbox card →
      booking shows confirmed.
- [ ] Review: complete a booking → leave a review → appears on listing.
- [ ] Admin: confirm/cancel/refund a booking; replace a listing photo.
- [ ] Lighthouse mobile ≥ 95 on home + a detail page (BRIEF §6 budget).
- [ ] Rotate the DB password one final time; confirm Vercel `DATABASE_URL` + `DIRECT_URL` updated.
- [ ] Swap the AI demo hero images for real photographer output.

---

## Decision needed (blocks a _full_ launch, not a soft launch)

1. **Domain:** do you own `gharmish.com`, or should we go with
   `gharmish.app` / `gharmish.co` / another name?
2. **Payments:** build the Moyasar **sandbox** integration now (real,
   env-gated code), or soft-launch with request-to-book and add payments
   later?
3. **SMS provider:** Twilio or Messagebird? (Drives the dashboard steps in
   §2; the provider account itself is yours to create.)

The first two are the only remaining _engineering_ levers; SMS and the
domain purchase are account tasks only the owner can perform.
