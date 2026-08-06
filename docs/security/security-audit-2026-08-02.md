# Gharmish — Security Audit, 2026-08-02

> AI-prepared review (Claude) of the live application. Read-only inspection plus
> Supabase advisors and `pnpm audit`. **No exploitation was attempted against
> production**, and no production data was modified. Findings below are grounded
> in code reading; the one confirmed defect was fixed in the same session.

**Scope:** authentication & authorization, server actions, API routes, webhooks,
injection surfaces, secrets handling, file uploads, storage, database RLS,
rate limiting, security headers, dependencies.

**Headline:** no remotely exploitable authentication bypass, injection, or
data-exfiltration path was found. The payment, webhook, and SQL layers are
genuinely well built. The real risks are concentrated in (1) an authorization
primitive that documents a protection it does not provide, (2) the admin trust
model, and (3) the absence of a real CSP.

---

## Confirmed defect — FIXED this session

### S1. KYC retention sweep was a silent no-op (introduced 2026-08-02, fixed same day)

Cron Pass 8 (the PDPL retention sweep added by the legal audit) called
`getSupabaseUserStorage()`, which gates on a **signed-in user** as its entry
ticket. A cron request carries no auth cookies, so the helper returned `null`
on every run and the pass skipped deletion entirely — silently, with a success
response and `kycDocumentsPurged: 0`.

Effect: rejected applicants' national IDs and IBAN letters would have been
retained **forever** while the privacy policy promised deletion. No data harm
yet — no rejected application is older than 90 days (verified: 1 rejected app,
0 past the cutoff) — so the sweep had nothing to delete regardless.

**Fix:** new `getSupabaseServiceStorage()` in `lib/supabase/server.ts` — a
service-role storage client for trusted server contexts with no user session.
Authorization for the pass is the `CRON_SECRET` check at the top of the route;
the helper's doc comment states that the caller is the entire authorization
story and it must never be reached from a visitor-facing path.

---

## High — both REMEDIATED (see the note under each)

### S2. The last-booking cookie is forgeable, so the "second proof" is self-asserted

> **FIXED.** `features/account/cookie.ts` now emits
> `<uuid>:<slug>.<tag>` where the tag is a truncated HMAC-SHA256 over the
> payload, verified with `timingSafeEqual` before any shape check. The tag
> binds reference AND slug, so a valid cookie can't be re-pointed at
> another booking. Key derives from `COOKIE_SIGNING_SECRET` or, unset,
> from the service-role key (always present in production); production
> with neither fails closed. Legacy unsigned cookies are rejected — a hard
> cutover affecting at most the single in-flight anonymous booking that
> existed at audit time. Covered by 12 tests including forgery, tag
> re-use, slug swap, and truncation.

`bookingViewerCanAccess()` (`features/bookings/lib/access.ts`) authorizes booking
access by either (a) a signed-in owner, or (b) the browser holding the booking
reference in `gharmish_last_booking`. Its doc comment states the intent plainly:
the raw URL "must not be enough on its own" because it may leak via a shared
link, screenshot, or referrer.

But `features/account/cookie.ts` serializes that cookie as **unsigned plaintext**
(`<uuid>:<slug>`) and parses it with regex validation only — no HMAC, no
signature, no server-side binding. `httpOnly` stops browser JavaScript from
reading it; it does **not** stop an HTTP client from sending an arbitrary
`Cookie:` header. Anyone who learns a booking reference can therefore mint the
matching cookie and satisfy proof (b).

The effective model is thus **pure capability-URL**: knowledge of the 122-bit
reference UUID is sufficient. That is a legitimate design, but it is not the
design the code claims, and the gap matters precisely in the leaked-URL scenario
the comment was written to defend against.

Reached through this primitive: read the booking (guest name, email, phone),
create a checkout, cancel, reschedule, submit a review, open a dispute, apply a
promo code. **Money movement out of the wallet is not** — `refund-out-actions.ts`
and the wallet checkout actions use `getSessionGuestId()`, which is strictly
session-bound. That separation is correct and worth preserving.

**Recommendation:** either sign the cookie (HMAC over `reference:slug` with a
server secret, verified on read) so the stated two-proof model becomes true, or
drop the claim and document the reference as a bearer capability — and then
treat every surface it unlocks accordingly. Signing is the small change.

### S3. Admin trust model: env-var phone allowlist, no roles table, no 2FA

> **FIXED.** Two parts:
>
> **Roles.** New `user_roles` table (live, RLS-on) — revocable, auditable
> grants keyed on the auth user id, with `granted_by`/`revoked_by` and a
> partial unique index so re-granting after revocation is a new row.
> `ADMIN_PHONES` survives only as a bootstrap fallback so an empty table
> can't lock the owner out. The resolution happens once per request in
> `getSession()` and is stamped on `user.isAdmin`, so `isAdminUser()`
> stays **synchronous** at all 61 call sites — deliberately, because an
> async version would make a single missed `await` read
> `if (!Promise)`, which is always false and would admit every visitor.
>
> **Second factor.** TOTP, enforced by the admin layout rendering a gate
> **in place of** the admin app (no route to forget, no exempt-path list)
> and by `adminGuard()` returning `mfa_required` for actions and queries.
> Supabase's own MFA could not be used: GoTrue derives the TOTP account
> name from `user.GetEmail()` and fails enrolment outright for phone-only
> accounts, which is every admin here. So the factor is in-app:
> `lib/totp.ts` (RFC 6238, verified against the published Appendix-B
> vectors), secret encrypted at rest via `lib/pii-crypto`, replay blocked
> by a `last_used_step` conditional UPDATE, verification recorded as a
> signed 12-hour cookie (user id and expiry inside the signature,
> `sameSite: strict`), and attempts throttled per admin on the existing
> auth-throttle table.

`features/admin/auth.ts` resolves admin status by comparing the session phone
against a comma-separated `ADMIN_PHONES` env var. Consequences:

- **No second factor.** A single compromised WhatsApp/SIM (OTP is the only
  factor) yields full admin: all guest PII, decrypted national IDs and IBANs,
  refunds, payouts, wallet issuance, host suspension.
- **No audit of admin identity changes** — membership changes by editing an env
  var and redeploying; there is no record of who was admin when.
- **Cleartext-PII CSV exports** (`/api/admin/export/users`, `/…/bookings`) are
  reachable by any admin session; the users export's own comment notes it
  includes phone/email in cleartext.

This is a known, deliberate deferral (`docs/audit-remediation-plan.md` lists a
`user_roles` table + 2FA + an admin-action audit table as pending). Flagging it
here because it is now the **largest single-point compromise** in the system,
and it compounds S2's PII exposure. Given the KYC data at stake (national IDs,
IBANs), 2FA on admin accounts is the highest-value security investment
available.

---

## Medium

### S4. No CSP beyond `frame-ancestors` — any XSS would be unmitigated

`next.config.ts` sets HSTS, `X-Content-Type-Options`, `Referrer-Policy`,
`Permissions-Policy`, and `Content-Security-Policy: frame-ancestors 'none'`.
There is no `script-src`/`default-src`, so there is no second line of defence
if a XSS sink is ever introduced — and the payment page is the highest-value
target on the site.

The deferral is documented and the reasoning is sound (a broken CSP on the pay
page is worse than none, and the OPPWA widget complicates it). No XSS sink was
found in this audit — the single `dangerouslySetInnerHTML` is the JSON-LD block,
which correctly escapes `<`, `>`, `&` to `\uXXXX`. Recommendation: introduce CSP
in report-only mode first, tune against the OPPWA widget origins, then enforce.

### S5. All storage writes run with the service-role key

`getSupabaseUserStorage()` returns a **service-role** client (documented: storage
RLS rejected the user-token path in production). The signed-in-user check is the
entry ticket, but the calling server action is the real gatekeeper for *which*
object may be written. Ownership is enforced by constructing keys from
session-derived ids (`${user.id}/…`), which is done correctly everywhere
inspected — but there is no defence-in-depth if a future action forgets.

Note the `kyc-documents` bucket's RLS policies are **not in the repo**
(`db/storage/` contains only `avatars-bucket.sql`) — an unversioned control that
cannot be reviewed or restored from source.

### S6. IP-based throttles trust the first `x-forwarded-for` hop

`authClientIp()` and the booking-creation throttle take the leftmost
`x-forwarded-for` value. On Vercel this is platform-set and trustworthy; behind
any other fronting, or if the app is ever reachable directly, it is
client-controlled and the per-IP limits become bypassable. The per-identifier
limits (5 sends / 15 min, 10 failed verifies / 15 min) are the meaningful
control and are not affected — OTP brute force stays bounded regardless.

### S7. Unescaped LIKE wildcards in admin search

`features/admin/guests/queries.ts` interpolates the query into
`ilike(col, '%' + q + '%')`. Drizzle parameterizes the value, so this is **not**
SQL injection, but `%` and `_` in user input are treated as wildcards — a
pathological pattern against a large table is a cheap CPU burn (admin-only).
Escape `%`, `_`, `\` in the needle.

### S8. `pg_net` extension installed in the `public` schema

Supabase advisor WARN. Move to a dedicated schema
([remediation](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public)).

---

## Low / informational

- **Dependency vulnerabilities are dev-only.** `pnpm audit` reports 5 high /
  3 moderate / 2 low, all in `vitest→vite`, `eslint→minimatch→brace-expansion`,
  and `@commitlint→cosmiconfig→js-yaml`. None reach the production runtime.
  Worth clearing on the next lockfile refresh; not a production exposure.
- **Twilio webhook has no replay protection** — inherent to Twilio's signature
  scheme (no timestamp). Handled operations (status upgrades, STOP/START) are
  idempotent, so replay is inert. Resend's Svix verification *does* enforce a
  5-minute timestamp window.
- **`requestOrigin()` host-header fallback** (`features/payments/actions.ts`)
  would let a poisoned `Host` shape the 3DS return URL — but
  `NEXT_PUBLIC_SITE_URL` **is set in production**, which pins it, and settlement
  never trusts the redirect. Already documented as 2026-07 audit L1.
- **Browser-reported MIME** is trusted for the extension mapping on uploads, but
  gated by an allow-list and the stored `content-type` is taken from that
  allow-list, not the file — SVG is not accepted, so no stored-XSS vector.
- **Supabase advisor: RLS enabled with no policies** on 26 tables is INFO-level
  and **intentional** — deny-by-default, with the app connecting via a
  `BYPASSRLS` role. Correct posture for this architecture; it does mean the
  application layer is the whole access-control story.
- **Leaked-password protection disabled** — not applicable, the project is
  OTP-only with no passwords.

---

## Verified strong (no action)

- **Webhook authentication.** All three verify: HyperPay AES-256-GCM auth tag,
  Twilio HMAC-SHA1, Resend/Svix HMAC-SHA256 + replay window — every one using
  `timingSafeEqual` with a length check first. Cron routes use a timing-safe
  `CRON_SECRET` comparison and reject when unset.
- **Payment integrity.** The webhook payload is used for *routing only*;
  `settleBooking` re-queries HyperPay server-side, checks exact amount and
  currency, and re-asserts the amount in the `UPDATE … WHERE`. A forged payload
  cannot mark a booking paid.
- **No SQL injection.** Zero `sql.raw`, zero string-built SQL; every `sql``
  template interpolates through drizzle's parameter binding. No dynamic
  identifiers or ORDER BY from user input.
- **No XSS sinks.** One `dangerouslySetInnerHTML` (JSON-LD), correctly escaped.
  No `eval`, `new Function`, or `child_process`.
- **Session verification.** `getSession()` uses `supabase.auth.getUser()`, which
  validates against the auth server — not the forgeable `getSession()` cookie
  read. Stub auth is fail-closed in production (`stubAuthAllowed()`).
- **Open-redirect guard.** `sanitizeNextPath()` rejects absolute,
  protocol-relative, and backslash-trick targets, and re-checks after stripping
  the locale segment. Unit-tested.
- **CSV injection defused** — `lib/csv.ts` prefixes `= + - @ TAB CR` cells.
- **PII scrubbing** — `lib/sentry-scrub.ts` redacts emails/phones from messages,
  breadcrumbs, request bodies, and `event.user`, on both the Sentry and console
  rails, with `sendDefaultPii: false`.
- **Authorization coverage.** Every admin server action goes through an admin
  guard (including via delegated helpers); every host action scopes writes with
  `eq(experiences.hostId, session.hostId)`; KYC documents are admin-gated behind
  `adminGuard()` and served as 1-hour signed URLs from a private bucket.
- **Storage keys are never user-controlled** — built from session ids, enum
  document types, and an extension from a MIME allow-list. No path traversal.
- **Secrets hygiene** — no env files tracked (`.env*` ignored, `.env.example`
  only), no hardcoded credentials found in source.

---

## Recommended order of work

| # | Action | Severity | Status |
|---|--------|----------|--------|
| 1 | 2FA for admin accounts + `user_roles` table | High | **DONE** (admin-action audit log still open) |
| 2 | Sign the last-booking cookie | High | **DONE** |
| 3 | CSP in report-only → enforce | Medium | Open |
| 4 | Version the `kyc-documents` bucket policy into `db/storage/` | Medium | Open |
| 5 | Escape LIKE wildcards in admin search; move `pg_net` out of `public` | Medium/Low | Open |
| 6 | Clear dev-only dependency advisories on the next lockfile refresh | Low | Open |

### First-run note for the owner (admin 2FA)

On the first `/admin` visit after deploy you'll get an enrolment screen:
scan the QR with an authenticator app (Google Authenticator, 1Password,
Authy) and enter the 6-digit code. That's a one-off; afterwards you'll be
asked for a code every 12 hours.

No factor is pre-enrolled — the one created while testing this feature was
deleted deliberately, because its secret was generated in a dev session
and never reached your authenticator. **Recovery** if you lose the device:
delete your row from `admin_totp_factors` (Supabase SQL editor) and the
next visit starts a fresh enrolment. Access can't be silently swapped
either: a *confirmed* factor is never overwritten by a new enrolment.
