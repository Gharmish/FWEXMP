# Gharmish — Go-Live Runbook

> Turnkey checklist to take Gharmish from "deployed & feature-complete" to
> "open to real users." Everything in §1 is **done**; §2–§4 are the
> credential/account tasks that can only be completed by a human with the
> relevant accounts. The codebase is built so each integration **flips on
> when its environment variables arrive — no code change required.**

Live URL: https://gharmish.com (primary; `gharmish-weld.vercel.app` still
works) · Vercel project `gharmish` · Supabase `gharmish-experiences`
(`xjgpflzkpydfpuomqhuq`, eu-central-1).

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
- DB security: RLS deny-by-default across all `public` tables. (2026-05-31:
  closed three audit tables — `experience_moderation_events`,
  `host_status_events`, `host_application_events` — that were reachable by
  the anon key; Supabase security advisor now clean of `rls_disabled` errors.)

### What works **without** any further credentials (soft-launch surface)

| Journey                                             | Needs login?     | Status                                          |
| --------------------------------------------------- | ---------------- | ----------------------------------------------- |
| Browse / search / experience detail / host profiles | No               | ✅ Live                                         |
| **Guest requests a booking** (name + phone)         | **No**           | ✅ Live                                         |
| Operator confirms/cancels/refunds bookings          | Admin (Test OTP) | ✅ Live                                         |
| Guest account (`/me`, wishlist, leave review)       | Yes (email OTP)  | ✅ Live via email OTP (§2b); SMS optional (§2)  |
| Host self-service (apply, manage listings, upload)  | Yes (email OTP)  | ✅ Live via email OTP (§2b); SMS optional (§2)  |
| Online card/Mada payment                            | — → §3           | 🟡 HyperPay wired (test); needs token + go-live |

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

## 2b. Email sign-in (email OTP) — Resend + Supabase Auth

The app ships a **fully-built email OTP** path alongside phone OTP
(`features/auth/actions.ts`, email branch). This unlocks guest + host
**self-service sign-in without an SMS provider** — the cheaper alternative
to §2. Email is delivered via **Resend → Supabase custom SMTP** (already
wired: sender `hello@gharmish.com`, domain `gharmish.com`).

**Status: ✅ LIVE & verified (2026-05-31).** Email OTP sign-in is production-
ready and was wired end-to-end:

- Branded templates installed — both render the **6-digit `{{ .Token }}`** the
  UI requires (verified by reading the live Supabase config back).
- Custom SMTP confirmed pointing at `smtp.resend.com` (`hello@gharmish.com`).
- Email OTP length pinned to **6** (Supabase was defaulting to 8 — would have
  broken the 6-digit UI).
- Duplicate **SPF record removed** — a single `v=spf1 include:amazonses.com`
  is live at the authoritative NS and Cloudflare (no more RFC 7208 permerror).
- A real OTP send returned **HTTP 200**, logged status 200, **no SMTP errors**.

This unlocks guest + host self-service sign-in **without an SMS provider**.
Re-check DNS anytime with `pnpm auth:emails:doctor`. Full runbook + how it was
done: **`docs/auth-emails/README.md`**.

Remaining (optional): point DMARC `rua` at a monitored inbox (README §2b);
localize emails to AR/EN via a Send Email Hook (needs human Arabic copy).

---

## 3. Real payments — HyperPay (OPPWA COPYandPAY)

**Gateway changed:** after a 2026-06-02 meeting with HyperPay we are
integrating **HyperPay / OPPWA** (not Moyasar — see the dated decision at
the bottom). This supersedes the original BRIEF §5 choice; BRIEF §5 should
be updated to match once confirmed.

Default flow stays **request-to-book** until HyperPay env vars arrive —
the integration is gated behind `hasHyperpay()` (`lib/env.ts`), exactly
like `hasSupabaseAuth()`.

### Built + verified against the live test server (2026-06-02)

- Env boundary + `hasHyperpay()` (`lib/env.ts`).
- DB columns `payment_status` / `checkout_id` / `payment_brand` / `paid_at`
  on `bookings` — migration **`0014` APPLIED to the prod DB** (additive,
  nullable/defaulted; was required so the schema matches what the code
  selects).
- Server client `features/payments/lib/hyperpay.ts` (+ pure, unit-tested
  `hyperpay-core.ts`): `prepareCheckout` → `getPaymentStatus`, OPPWA
  result-code classification, `xx.00` amount formatting, and **test-only
  flag gating** (`testMode=EXTERNAL`, `customParameters[3DS2_enrolled]`
  added only when `HYPERPAY_MODE=test`).
- Payment-details step UI + 3DS2 zod schema + COPYandPAY widget
  (Mada-first, `paymentTarget:"_top"`), `shopperResultUrl` route with
  **server-side status verification + amount check** (source of truth —
  never trusts the redirect), and `requestBooking` wired to route through
  payment when `hasHyperpay()`. AR/EN strings complete.
- **Verified:** `POST /v1/checkouts` → `000.200.100`; `GET …/payment` →
  `000.200.000`; full booking → details → checkout → widget render with
  **mada shown first + logo** confirmed in-browser.

> The access token is the base64-blob string **verbatim** (do NOT decode
> it). Token lives in gitignored `.env.local` locally.

### Remaining

- Live click-through with a test card (3DS fields are cross-origin
  iframes) + the Mada asset pack from HyperPay's quickconnect share.
- Optional HyperPay webhook (belt-and-suspenders settlement).

### Go-live steps

1. Finish KYC; obtain **live** access token + entity id (test creds in hand).
2. Add env vars in Vercel (Production + Preview):
   - `HYPERPAY_ACCESS_TOKEN` (server-only, **Sensitive**)
   - `HYPERPAY_ENTITY_ID`
   - `HYPERPAY_MODE` (`test` until live-certified, then `live`)
   - `HYPERPAY_WEBHOOK_SECRET` (when the webhook is enabled)
3. Add the Mada scripts/logo from HyperPay's asset share (the `0014`
   migration is already applied to the DB).
4. **Verify (test server):** complete a booking with the test cards — Mada
   `4464040000000007` (11/26, CVV 850), Visa `4012000033330026` (01/39,
   CVV 100) — confirm the server status check flips the booking to paid and
   the confirmation page reflects it. Amounts must be `xx.00` on test.

---

## 4. Custom domain — `gharmish.com` (✅ LIVE 2026-05-31)

`gharmish.com` is now the **primary domain** for the Vercel `gharmish`
project. No code change was needed — `SITE_URL` in `lib/site.ts` already
defaults to `https://gharmish.com`; `NEXT_PUBLIC_SITE_URL` stays unset.

What was done (Vercel + GoDaddy + Supabase APIs):

1. **Vercel** — `gharmish.com` and `www.gharmish.com` attached to the
   `gharmish` project and verified. `www` → **308 redirect** to the apex, so
   `gharmish.com` is canonical.
2. **GoDaddy DNS** — apex `A @` set to Vercel's pair **`216.198.79.1` +
   `64.29.17.1`**; removed the stale **GoDaddy WebsiteBuilder** A record that
   was hijacking ~2/3 of apex hits. `www` CNAME → apex. MX (`send`), SPF,
   DKIM, DMARC, and the Apple verification TXT were left untouched. Vercel
   now reports `conflicts: []`, `misconfigured: false`; HTTPS cert auto-issues.
3. **Supabase Auth** — `site_url` set to `https://gharmish.com` (was the dev
   default `http://localhost:3000`, which would have broken the magic-link
   fallback in auth emails); `uri_allow_list` =
   `https://gharmish.com/**, https://www.gharmish.com/**, http://localhost:3000/**`.

The old `gharmish-weld.vercel.app` URL still works as a fallback.

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

## Decisions made (2026-05-29)

> **Superseded 2026-06-02 (payments):** gateway is now **HyperPay/OPPWA**,
> not Moyasar, and payment code is being built (§3). Decision 1 below
> stands only as the _fallback_ posture (request-to-book) until HyperPay
> env vars are set.

1. **Launch model: soft launch.** Ship as a request-to-book marketplace —
   no online payment for now. Moyasar deferred; revisit when card payment
   is wanted. **No payment code to build.**
2. **Domain: owner holds `gharmish.com`.** Code is already correct (§4);
   only the Vercel domain add + DNS records remain (owner task).
3. **SMS provider: TBD.** Both Twilio and Messagebird paths are documented
   in §2; choose at provisioning time.

### Therefore: no remaining engineering work for the soft launch.

The app is **soft-launch ready** now. The only steps left are owner
account actions:

- [ ] Point `gharmish.com` DNS at Vercel (§4).
- [ ] (When self-service sign-in is wanted) configure an SMS provider (§2).
- [ ] (Optional) move Functions region to `fra1` (§4); rotate DB password;
      swap demo photos for real ones.

Guests can already browse and **request bookings without an account**; the
operator manages confirmations from the admin panel via Test-OTP sign-in.
