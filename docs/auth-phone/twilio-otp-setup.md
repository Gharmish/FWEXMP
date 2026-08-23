# Real phone OTP sign-in — Twilio Verify over WhatsApp

> Runbook for replacing the Supabase **Test OTP** stub with real one-time
> codes. Written — and then EXECUTED — 2026-07-31, right after the
> WhatsApp notification channel went live (see
> `docs/notifications/twilio-setup.md`). Steps 1–3 are all DONE via API:
> Messaging Service `gharmish-otp` (MGc2dc92d197c91369431a4af01ae88102)
> with the WhatsApp sender attached, Verify service "Gharmish"
> (VAddd1ac343aaa52673338c45deea5f91a) with the BYO WhatsApp channel
> wired, Supabase phone provider switched to `twilio_verify` via the
> Management API (Test OTPs preserved), and the `channel: 'whatsapp'`
> code change shipped. Kept below as reference for how it was set up and
> for the SMS-fallback path.

## Current state

- Phone sign-in works ONLY for numbers registered as Supabase **Test
  OTPs** (e.g. +966541104000 / 000000). Real users cannot sign in by
  phone; the email-OTP branch (Resend) is their only path.
- The Twilio account is live and upgraded, with a registered, ONLINE
  WhatsApp sender: **+966 55 900 2592, display name "Gharmish"** — the
  same sender the booking notifications use.
- `features/auth/actions.ts` already calls
  `supabase.auth.signInWithOtp({ phone })` when no stub applies, and
  server-side send throttles (`otpSendAllowed`) are in place. The code
  path is ready; only the provider behind it is missing.

## Why Twilio Verify + WhatsApp (and not SMS)

|                  | WhatsApp via Twilio Verify                                                        | SMS to KSA                                                                    |
| ---------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Regulatory setup | none — sender already registered                                                  | CITC-registered sender ID via a Twilio regulatory bundle; typically **weeks** |
| Templates        | Meta auth templates **auto-created by Verify** (Copy-Code button, multi-language) | n/a                                                                           |
| Branding         | "Gharmish" thread the guest already knows                                         | generic long code until registration                                          |
| Reach            | ~universal on Saudi smartphones                                                   | universal incl. feature phones                                                |

Meta policy now requires OTPs over WhatsApp to be sent as Authentication
Templates **from your own WABA sender** — Twilio Verify handles the
templates automatically once our sender is attached (docs:
`twilio.com/docs/verify/whatsapp/byo`). The plain "Twilio" (Programmable
Messaging) provider would send free-form bodies, which Meta rejects
outside a 24h session — **do not** pick it for the WhatsApp channel.

Guests without WhatsApp still have email OTP; add real SMS later only if
support tickets show a need (see "Later: SMS fallback").

## Step 1 — Twilio console (~15 min)

1. **Messaging Service**: Messaging → Services → create (or reuse) a
   service, e.g. `gharmish-otp`; note its **MG… SID**. Add the WhatsApp
   sender `whatsapp:+966559002592` to its Sender Pool.
   - Twilio's best practice is a _separate_ sender for OTP vs
     notifications (a blocked marketing sender can't receive OTPs). At
     our volume, sharing the one Gharmish sender is fine — revisit if we
     ever send marketing.
2. **Verify Service**: Verify → Services → create, e.g. `gharmish-auth`;
   note its **VA… SID**. In the service settings:
   - Code length 6 (matches the UI copy).
   - **WhatsApp tab → select the `gharmish-otp` Messaging Service** —
     this is the BYO-sender hookup; Verify then auto-creates the
     Meta-approved auth templates (Arabic + English included).
3. Sanity-check from the CLI (sends a real WhatsApp to the owner phone):

   ```bash
   curl -s -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \
     -X POST "https://verify.twilio.com/v2/Services/<VA_SID>/Verifications" \
     --data-urlencode "To=+9665XXXXXXXX" \
     --data-urlencode "Channel=whatsapp"
   ```

   Expect `"status": "pending"` and a branded Copy-Code message on the
   phone. (Error 63008 = Messaging Service not attached; 63018 = Meta
   messaging limit.)

## Step 2 — Supabase dashboard (~5 min)

Auth → Providers → **Phone**:

1. Enable phone provider.
2. SMS provider: **Twilio Verify** (not "Twilio").
3. Fill: Account SID, Auth Token (same values as the app's
   `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` in `.env.local`), and the
   **Verify Service SID (VA…)** from Step 1.
4. **Test OTPs — LOCAL/STAGING ONLY. Remove them from the PRODUCTION
   auth project.** (Corrected 2026-08-01, ninth audit.) A Test OTP is a
   permanent static credential: the number bypasses the provider
   entirely and the code never rotates. Because `+966541104000` is also
   listed in `ADMIN_PHONES`, leaving that pair enabled in production
   means **anyone who can read this repository can sign in as an
   admin** — the code is written down two lines above.

   This was defensible while phone sign-in was stub-only and no real
   channel existed. It is not defensible now that Verify works.

   If you want a break-glass admin login that does not depend on
   WhatsApp, use a number that is NOT in `ADMIN_PHONES`, or keep the
   Test OTP only in a non-production project.

5. Leave OTP expiry at 60s+ default; our UI already says "6-digit code".

## Step 3 — Code changes (one small PR)

1. `features/auth/actions.ts`, phone branch: request the WhatsApp
   channel —

   ```ts
   const { error } = await supabase.auth.signInWithOtp({
     phone,
     options: { channel: 'whatsapp' },
   });
   ```

   `verifyOtp({ phone, token, type: 'sms' })` is **unchanged** — the
   channel only affects the send (per Supabase phone-login docs).

2. Sign-in copy: "We'll send a 6-digit code by SMS" → "…by WhatsApp" in
   `messages/en.json` + `messages/ar.json` (search for the SMS string in
   the auth namespace).
3. Optional hardening: read the channel from an env var
   (`AUTH_OTP_CHANNEL`, default `whatsapp`) so a future SMS fallback is
   config-only. Skip if YAGNI wins.

## Step 4 — Test sequence

1. In LOCAL/STAGING only, with a Test OTP configured there: sign in
   with it → works, no message sent (provider bypassed). Do not rely on
   this path in production — see the warning in Step 2.4.
2. With a real second number (not in Test OTPs): request code → branded
   WhatsApp arrives with Copy-Code button → enter code → session
   created, guest row linked by verified phone (the identity rule in
   `features/account/profile/guest-identity.ts` applies).
3. Wrong code 3× → Supabase error surfaces as the existing `invalid_code`
   failure state.
4. Throttle: request codes rapidly → `rate_limited` from our
   `otpSendAllowed` before Twilio ever bills.

## Later: SMS fallback (only if needed)

Real SMS to KSA requires a CITC-registered alphanumeric sender ID
(Twilio: Regulatory Compliance → Bundles, allow ~2–6 weeks) or a Saudi
long/short code. Once approved, add the SMS-capable sender to the same
`gharmish-otp` Messaging Service, and Verify can fall back
per-verification (`Channel=sms`). Do not start this paperwork until
there's evidence of guests who can't receive WhatsApp.

## Costs & ops

- Twilio Verify bills **per verification** (plus the WhatsApp
  authentication-conversation fee) — only on real sends; Test OTPs are
  free. Our send throttle caps abuse.
- Delivery/quality: the sender's Meta quality rating and messaging
  limits are shared with booking notifications — a rating drop on one
  affects both. Watch Twilio Console → Senders if OTP volume grows.
- Suppressions do NOT apply here: a guest who WhatsApp-STOPped our
  notifications still receives Verify OTPs (different pipeline —
  Verify, not the Content API dispatcher). That's correct behavior:
  opting out of notifications must not lock a user out of sign-in.

## Reused for host contact-phone changes (2026-08-22)

The same Verify service now proves a host's NEW notification number on
`/host/profile` before it replaces the old one. The app calls the Verify
REST API directly (`lib/twilio-verify.ts`, `Channel=whatsapp`) with the
existing `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN` plus one new variable:

```
TWILIO_VERIFY_SERVICE_SID=VAddd1ac343aaa52673338c45deea5f91a
```

Set in Vercel Production (Sensitive) and `.env.local`. Empty → phone
changes are refused with a clear message; nothing is ever saved
unverified. The flow parks the number in `hosts.pending_contact_phone`,
keeps notifications on the old number until the code checks out, emails
the previous address about every change, audits it in
`user_profile_events`, and drops the old number's WhatsApp host identity
(`conversations.host_id`). Send/verify throttles are the sign-in ones
(`features/auth/lib/throttle`). Local dev with stub auth accepts `000000`.
