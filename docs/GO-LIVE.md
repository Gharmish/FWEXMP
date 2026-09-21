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

| Journey                                             | Needs login?     | Status                                                                |
| --------------------------------------------------- | ---------------- | --------------------------------------------------------------------- |
| Browse / search / experience detail / host profiles | No               | ✅ Live                                                               |
| **Guest requests a booking** (name + phone)         | **No**           | ✅ Live                                                               |
| Operator confirms/cancels/refunds bookings          | Admin (Test OTP) | ✅ Live                                                               |
| Guest account (`/me`, wishlist, leave review)       | Yes (email OTP)  | ✅ Live via email OTP (§2b); SMS optional (§2)                        |
| Host self-service (apply, manage listings, upload)  | Yes (email OTP)  | ✅ Live via email OTP (§2b); SMS optional (§2)                        |
| Online card/Mada payment                            | — → §3           | 🟡 HyperPay LIVE creds set 2026-09-13; SAR ≥5 settlement test pending |

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

**LIVE SERVER SWITCHED 2026-09-13.** HyperPay sent the production
credentials (entity `8acda4d9a03d17e801a051e63fe24b5d`, Visa/Master/mada,
DB, SAR). Vercel Production now carries the live token + entity and
`HYPERPAY_MODE=live` (redeploy `dpl_98PvYeZi…` of `3465b94`, aliased to
gharmish.com). No code change was needed: `HYPERPAY_MODE` alone selects
`eu-prod.oppwa.com`, drops `testMode=EXTERNAL` + `3DS2_enrolled`, and the
mandatory 3DS2 fields (`merchantTransactionId`, `customer.*`, `billing.*`) were
already sent. `HYPERPAY_APPLEPAY_ENTITY_ID` was REMOVED from Production:
the live entity covers cards only, so Apple Pay is not offered until
HyperPay issues a live Apple Pay entity. Still open: (1) the owner must
pay a real SAR ≥5 booking with a card and confirm the amount settles to the
merchant bank within ~72h, then confirm back to HyperPay; (2) ~~configure
the notification webhook~~ — see the 2026-09-21 note below; (3) rotate the
access token — it was pasted into a chat transcript when it arrived.

**WEBHOOK KEY INSTALLED 2026-09-21.** HyperPay support registered
`https://gharmish.com/api/webhooks/hyperpay` on the live entity (there is
no self-service Webhooks page under our login — it is done by email) and
sent the 64-char hex decryption key. The owner saved it in Vercel
Production as a **Secret** and redeployed (`dpl_HHGmQeJN…`); the endpoint
went from `503 not_configured` to `400 bad_request` on an empty probe,
which is the "key loaded" signal. Things learned the hard way:

- OPPWA webhooks are **inactive until their "Click to Test" gets a 2xx**.
  HyperPay's first test hit the 503, so after installing the key they must
  be asked to **re-test**; no events flow until that passes.
- OPPWA's **Wrapper** setting defaults to **None**: the body is the bare
  hex ciphertext as `text/plain`, not `{ "encryptedBody": … }`. The route
  only spoke JSON until `d150db7`, which accepts both (and no longer pages
  a "secret drift" for a merely malformed body).
- A probe that must not page anyone: POST an empty body with no headers →
  `400`. Anything carrying both `X-Initialization-Vector` and
  `X-Authentication-Tag` that fails to decrypt is a paged `401`.
- Unverified until the first real payload: that `payload.ndc` equals our
  stored checkout id for COPYandPAY (else the superseded-capture alert
  fires falsely), and that HyperPay's "Fields" setting still includes
  `merchantTransactionId`, `ndc`, `result.code`, `id`, `amount`.
- The key travelled by plain email and chat. It cannot mark a booking paid
  (settle re-queries the gateway) but it can forge an alert-triggering
  payload; ask HyperPay to regenerate it once the flow is proven.

**EXPIRED CHECKOUT ≠ UNPAID — settle reads the transaction report (2026-09-21).**
A review inferred, and a read-only probe of the **test** server then
confirmed, that the status GET cannot tell a paid checkout from an
abandoned one once the checkout's session is gone:

- `GET /v1/checkouts/{id}/payment` on three **captured** test checkouts
  (GH-MQZYYP card, GH-TD8FQD Apple Pay, GH-NMFAHH card; 30–45 days old)
  answered HTTP 400 `200.300.404` — byte-identical to the genuinely
  abandoned GH-ZH25EB. The gateway's own description says it: _"No payment
  session found for the requested id - are you mixing test/live servers or
  have you paid more than 30min ago?"_ The COPYandPAY guide agrees ("a
  checkout id expires … not later than 30 minutes").
- Settle read that code as **ABANDONED**: `processing → unpaid`, no alert,
  no email; the release pass then system-cancelled the booking an hour
  later. The reconcile pass only polls rows **past their payment deadline**
  — i.e. almost always after the 30-minute window — so a guest who paid,
  lost the tab during 3DS and whose webhook was missed could be cancelled
  while charged, and charged again on a fresh checkout.
- `GET /v1/query?entityId=…&merchantTransactionId=<bookings.idempotency_key>`
  (Transaction Reports) does not expire. Paid reference → HTTP 200,
  `result.code 000.000.100`, `payments[]` with `id`, `paymentType`,
  `paymentBrand`, `amount`, `currency`, `merchantTransactionId`,
  `result.code`, `timestamp` (+ card/customer detail we never read).
  Nothing for the reference → HTTP 404 `700.400.580` "cannot find
  transaction". One reference carries **several** entries: a declined `DB`
  has no `amount`; a refund is `paymentType RF` whose `referencedId` is the
  debit's `id`. `/v1/query/{paymentId}` returns the single entry.
  `date.from`/`date.to` are not enabled on this account.
- The report is **entity-scoped**: the Apple Pay capture queried on the card
  entity (and the card capture on the Apple Pay entity) answered
  `700.400.580`. Every configured entity must be asked.

What the code does now (`features/payments/settle.ts`, `lib/hyperpay.ts`,
`lib/hyperpay-core.ts`): on `200.300.404` settle asks the report on every
entity **before** abandoning. An unreversed successful `DB` settles the
booking down the ordinary path (same amount/currency guards, same
conditional-UPDATE arbiter, `settle_succeeded` ledger row tagged
`RECOVERED:<code>`); a wrong-amount capture becomes the usual amount-mismatch
anomaly; a capture already refunded at the gateway is ignored; two live
captures settle one and page about the other. Only an explicit "cannot find
transaction" from **every** entity abandons. If the report cannot be read
settle fails **closed** — the booking stays `processing` (the release pass
never touches it) and one `settle_anomaly` page a day says so.
`createCheckout` routes an expired session through settle before it will
supersede anything, and hands settle its one status GET instead of letting
it fetch a second (OPPWA allows two per checkout per minute). `800.120.100`
"Rejected by Throttling" and a bare HTTP 429 are transient (`pending`),
never a decline. The webhook pages once per reference per day when the
payload says success but settle could not confirm, and asks OPPWA to
redeliver only when settle polled the very checkout the payload names.

Not observed, stated plainly: the **throttle code itself** (four rapid GETs
on an expired test session just repeated `200.300.404`; the limit is from
the docs), the **exact 30-minute boundary** (youngest checkout probed was
30 days old), and — the one that matters — **`/v1/query` on the LIVE
entity**. Every probe used the test credentials; the live token exists only
in Vercel. If the live entity refuses the report, abandoned checkouts park
in `processing` and a returning pay-after-approval guest whose checkout is
30+ minutes old gets a "try again" error instead of a new checkout. **After
deploying, confirm it:** the first expired checkout the hourly cron meets
either writes an `ABANDONED:` / `RECOVERED:` ledger row (report works) or
raises the `settle_anomaly` page _"transaction report could not be read"_
(it does not — ask HyperPay to enable Transaction Reports for entity
`8acda4d9…`).

**Hourly self-check (production only):** cron pass `0b-report-check` (`features/maintenance/passes/report-check.ts`) queries the report on every entity for a reference no booking carries, so a live entity that refuses `/v1/query` pages within an hour of deploy instead of on the first blocked guest; its `settle_anomaly` page _"the hourly self-check could not read the HyperPay transaction report"_ (same once-a-day `settle-report-unavailable` fingerprint as settle's) names the entity and the gateway's answer — a permission/auth code means ask HyperPay to enable Transaction Reports, a timeout or 5xx is a blip the next hour re-tests; to confirm after a deploy, check `/admin/alerts` once an hourly run has passed — no such row (paged or `suppressed: quiet-window`) means the live report is readable.

One **live** booking was abandoned by the old reading and cannot be
re-checked from here: **GH-9D5YCM**, SAR 480, checkout created 2026-09-17
18:44 UTC, read as abandoned 20:00, system-cancelled 21:00. It is most
likely a guest who opened the pay page and left (the checkout was
auto-prepared on page load), but that is the same shape as the failure —
search the HyperPay live portal for its `merchantTransactionId` (the
booking's `idempotency_key` — look it up by reference code; it is not
written here because this repository is public) and refund it if a capture
exists.

**APPLE PAY (live) — NOT ENABLED YET.** On 2026-09-21 HyperPay wrote that
Apple Pay "is now enabled on your account", with no entity id and no
certificate detail. `HYPERPAY_APPLEPAY_ENTITY_ID` stays unset until they
confirm which entity carries `APPLEPAY` and which certificate model it
uses. Setting the variable makes Apple Pay the **default** method for every
Apple device at once (there is no canary switch), so flip it only with the
owner on an iPhone and a rollback (remove the variable + redeploy) ready.

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
- HyperPay webhook — built, key installed 2026-09-21 (see the note above); what remains is HyperPay's re-test so the webhook activates, then one closed-tab payment to watch a real notification settle a booking.

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
