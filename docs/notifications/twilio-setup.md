# Twilio WhatsApp — go-live runbook

The WhatsApp notification channel is **fully built and env-gated**: until the
env vars below are set, every WhatsApp send is a silent skip and all flows are
email-only, exactly as before. Going live is configuration only — no deploy of
new code is needed (beyond setting env vars, which triggers a redeploy).

## What's already in place

- `lib/notifications/dispatch.ts` — dispatcher: every booking/host/application
  notification goes through it. Email + WhatsApp fan-out, per-channel
  idempotency (`notification_deliveries` unique on dedupe key + channel),
  suppression checks, delivery ledger.
- `lib/notifications/whatsapp.ts` — Twilio Content API adapter (no SDK).
- `app/api/webhooks/twilio/route.ts` — status callbacks (sent → delivered →
  read / failed) update the ledger; inbound STOP/إيقاف suppresses the phone,
  START/ابدأ lifts it. Signature-validated.
- DB: `notification_deliveries`, `notification_suppressions`,
  `hosts.contact_phone` (copied from the application at approval) — all live.
- Phone-only guests (no email) are already included in the reminder cron scan;
  they start receiving reminders the moment the channel goes live.

## Human prerequisites (start early — weeks of wall-clock)

1. **Meta Business verification** for Gharmish (needs the CR number — same
   blocker as the footer registration line).
2. **A dedicated phone number** for the WhatsApp sender. Registering a number
   with the Business API takes it over for API use — do NOT use a number
   anyone uses in the WhatsApp app (e.g. the owner's personal line).
3. Twilio account with WhatsApp enabled; register the sender (Twilio console →
   Messaging → Senders → WhatsApp senders) with display name "Gharmish".
4. Submit the message templates below for Meta approval (Twilio console →
   Content Template Builder). All are **Utility** category. Approval is
   per-template, usually minutes-to-days.

## Environment variables (Vercel, production)

| Var                            | Value                                        |
| ------------------------------ | -------------------------------------------- |
| `TWILIO_ACCOUNT_SID`           | `AC…` (Sensitive)                            |
| `TWILIO_AUTH_TOKEN`            | auth token (Sensitive)                       |
| `TWILIO_WHATSAPP_FROM`         | sender number, E.164, e.g. `+9665XXXXXXXX`   |
| `TWILIO_WHATSAPP_CONTENT_SIDS` | JSON map of approved Content SIDs, see below |

The first three flip the channel on (`hasWhatsApp()`); the SID map controls
which templates actually send. Templates can go live one at a time — a key
missing from the map just skips that message's WhatsApp copy (email still
goes out).

```json
{
  "booking_confirmed.ar": "HX…",
  "booking_confirmed.en": "HX…",
  "booking_reminder_24h.ar": "HX…",
  "booking_reminder_24h.en": "HX…",
  "booking_reminder_3h.ar": "HX…",
  "booking_reminder_3h.en": "HX…",
  "booking_request_received.ar": "HX…",
  "booking_request_received.en": "HX…",
  "booking_approved.ar": "HX…",
  "booking_approved.en": "HX…",
  "booking_declined.ar": "HX…",
  "booking_declined.en": "HX…",
  "booking_cancelled.ar": "HX…",
  "booking_cancelled.en": "HX…",
  "host_new_booking.ar": "HX…",
  "host_new_booking.en": "HX…",
  "host_new_request.ar": "HX…",
  "host_new_request.en": "HX…",
  "host_guest_cancelled.ar": "HX…",
  "host_guest_cancelled.en": "HX…",
  "host_payment_received.ar": "HX…",
  "host_payment_received.en": "HX…"
}
```

A locale-less key (e.g. `"booking_confirmed"`) works as a shared fallback for
both languages if a template is authored bilingually.

## Webhooks (Twilio console)

- **Incoming messages** for the WhatsApp sender → `https://gharmish.com/api/webhooks/twilio`
  (method POST). Must be EXACTLY this URL — no trailing slash, no query
  string — or signature validation rejects with 401.
- **Status callbacks** need no console config: every outbound send passes
  `StatusCallback` pointing at the same URL.

## Template catalog — variable contracts

The variable numbers below are what the code sends
(`features/bookings/lib/booking-email.ts`). Author each template's body around
them; suggested copy is a starting point (owner has approved AI-written
Arabic). Dates/times arrive pre-formatted in the recipient's locale and KSA
time. Rollout priority: top of the list first.

### Guest templates

| Template                   | Variables                                                                     | Suggested EN body                                                                                                                               |
| -------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `booking_confirmed`        | 1 name · 2 experience · 3 date · 4 time · 5 booking ref                       | Hi {{1}}, your booking is confirmed! ✅ {{2}} on {{3}} at {{4}}. Reference: {{5}}. We've sent your receipt by email if you have one on file.    |
| `booking_reminder_24h`     | 1 name · 2 experience · 3 date · 4 time · 5 meeting point · 6 map/booking URL | Hi {{1}}, get ready — {{2}} is {{3}} at {{4}}. Meeting point: {{5}}. Directions: {{6}}                                                          |
| `booking_reminder_3h`      | 1 name · 2 meeting point · 3 time · 4 map/booking URL                         | See you soon, {{1}}! Today at {{3}}, meeting at {{2}}. Please arrive a little early. Directions: {{4}}                                          |
| `booking_request_received` | 1 name · 2 experience · 3 date · 4 time · 5 ref                               | Hi {{1}}, we've sent your request for {{2}} ({{3}}, {{4}}) to the host. You won't be charged unless they confirm. Reference: {{5}}.             |
| `booking_approved`         | 1 name · 2 experience · 3 date · 4 time · 5 action URL                        | Good news {{1}} — the host confirmed {{2}} on {{3}} at {{4}}. View your booking / complete payment: {{5}}                                       |
| `booking_declined`         | 1 name · 2 experience · 3 date · 4 time · 5 ref                               | Hi {{1}}, unfortunately the host couldn't accept your request for {{2}} on {{3}}. Nothing was charged. Browse more experiences at gharmish.com. |
| `booking_cancelled`        | 1 name · 2 experience · 3 date · 4 time · 5 ref                               | Hi {{1}}, your booking {{5}} for {{2}} on {{3}} has been cancelled. If a refund is due, details are in your booking page / email.               |

### Host templates

| Template                | Variables                                           | Suggested EN body                                                                                                                           |
| ----------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `host_new_booking`      | 1 experience · 2 date · 3 time · 4 party · 5 payout | New booking 🎉 {{1}} — {{2}} at {{3}}, {{4}} guest(s). Your payout: {{5}}. Manage: gharmish.com/host/bookings                               |
| `host_new_request`      | same as above                                       | New booking request: {{1}} — {{2}} at {{3}}, {{4}} guest(s), payout {{5}}. Please approve or decline within 24h: gharmish.com/host/bookings |
| `host_guest_cancelled`  | 1 experience · 2 date · 3 time                      | A guest cancelled: {{1}} on {{2}} at {{3}}. The spots are back on your calendar.                                                            |
| `host_payment_received` | 1 experience · 2 date · 3 time · 4 payout           | Payment received for {{1}} on {{2}} at {{3}} — this booking is fully secured. Your payout: {{4}}.                                           |

Arabic variants: author the same variable order; keep `{{n}}` placeholders
identical. (Hint: the equivalent email copy in `messages/ar.json` under
`bookingEmail` is the approved tone reference.)

Email-only types that are ledgered but have no WhatsApp template by design:
`booking_expired`, `booking_payment_lapsed`, `host_hold_lapsed`,
`application_approved`, `application_rejected`, `review_replied`. Add a
template key in `lib/notifications/types.ts` + a `whatsapp:` payload in the
sender if any of these should gain the channel later.

## Testing sequence

1. Set the three core env vars in a **preview** deployment first, with the SID
   map containing only `booking_confirmed.*`.
2. Make a test booking with your own phone (+966 test flow), pay on the
   HyperPay test server → expect the WhatsApp confirmation.
3. Check `notification_deliveries`: row should move `queued → sent →
delivered/read` as the callbacks land.
4. Reply `stop` → next send to that phone must land as `suppressed` in the
   ledger, with a row in `notification_suppressions`. Reply `start` to lift.
5. Roll the remaining templates into the SID map as Meta approves them.

## Ops notes

- **One attempt per (message, channel).** A failed send is ledgered `failed`
  and not auto-retried (same best-effort posture the email channel always
  had). Failures are visible: `SELECT * FROM notification_deliveries WHERE
status = 'failed' ORDER BY created_at DESC;`
- **Suppression applies to transactional sends too** — a STOP is a legal
  opt-out, not a preference. The guest keeps email notifications if they have
  an email on file.
- **24h window / template rule:** every outbound message uses a pre-approved
  Content template, so sends are valid at any time. Free-form replies are
  deliberately not implemented.
- Marketing campaigns are a separate later phase (consent capture first) —
  nothing here sends marketing.
