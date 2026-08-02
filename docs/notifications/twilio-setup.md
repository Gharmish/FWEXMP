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
  "host_payment_received.en": "HX…",
  "booking_rescheduled.ar": "HX…",
  "booking_rescheduled.en": "HX…",
  "host_booking_rescheduled.ar": "HX…",
  "host_booking_rescheduled.en": "HX…"
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

## Template catalog — variable contracts (v2, 2026-07-31 comms audit)

### Brand voice rules for FUTURE template versions (locked 2026-08-02, brand audit)

The approved v1/v2 bodies below are historical records — Meta-approved bodies
cannot be edited, and slots are additive-only (never renumber). Do not rewrite
them here. But every template authored from v3 onward follows the brand voice
(BRIEF.md §2 — calm, restrained, never loud):

- **No emoji.** The `✅` / `🎉` in v2 bodies are grandfathered, not precedent;
  no other brand channel (email, product, SMS) uses them.
- **No exclamation marks.** "your booking is confirmed." carries the same news
  as "confirmed!" — the register is a host, not a promoter.
- **Close with the brand, not a bare URL.** End on branded copy or a labelled
  link ("Your booking: {{n}}"), never a naked `https://gharmish.com`.
- **Arabic bodies carry غارميش in text** at least once (the sender display
  name alone is not a brand impression inside a forwarded message).

The variable numbers below are what the code sends
(`features/bookings/lib/booking-email.ts`). Author each template's body around
them; both language bodies below are ready to paste (owner has approved
AI-written Arabic). Dates/times arrive pre-formatted in the recipient's locale
and KSA time. URL and reference variables arrive wrapped in invisible FSI/PDI
bidi-isolate marks, so they render intact inside Arabic bodies.

**Migration note (v1 → v2).** The live approved templates are v1. The code now
sends EXTRA trailing variables (marked ★ below) that v1 bodies simply ignore —
nothing breaks. To ship v2: create new Content templates with the bodies
below, submit for Meta approval, then swap the SIDs in
`TWILIO_WHATSAPP_CONTENT_SIDS`. Never renumber an existing variable slot — the
first 5 (guest) / first positional (host) meanings are frozen; v2 only appends.
Meta requires body placeholders to be sequential (`{{1}}…{{n}}`, no gaps, no
out-of-order first appearance) — the bodies below comply; the v1 suggested
bodies for `booking_cancelled` and `booking_reminder_3h` did not, so whatever
was actually approved may differ. Check the live bodies in the Twilio console
before assuming.

### Guest templates

| Template                   | Variables                                                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `booking_confirmed`        | 1 name · 2 experience · 3 date · 4 time · 5 booking ref · **6 invoice URL ★ · 7 total paid ★**                    |
| `booking_reminder_24h`     | 1 name · 2 experience · 3 date · 4 time · 5 meeting point · 6 map/booking URL                                     |
| `booking_reminder_3h`      | 1 name · 2 meeting point · 3 time · 4 map/booking URL                                                             |
| `booking_request_received` | 1 name · 2 experience · 3 date · 4 time · 5 ref                                                                   |
| `booking_approved`         | 1 name · 2 experience · 3 date · 4 time · 5 action URL (payment page while payment is due, else booking page)     |
| `booking_declined`         | 1 name · 2 experience · 3 date · 4 time · 5 ref                                                                   |
| `booking_cancelled`        | 1 name · 2 experience · 3 date · 4 time · 5 ref · **6 refund outcome line ★ · 7 document/booking URL ★**          |
| `booking_rescheduled`      | 1 name · 2 experience · 3 new date · 4 time · 5 ref · 6 booking URL — **no template exists yet; author + submit** |

**v2 bodies — English:**

- `booking_confirmed`: Hi {{1}}, your booking is confirmed! ✅ {{2}} on {{3}}
  at {{4}}. Reference: {{5}}. Your receipt and tax invoice: {{6}}. Total paid:
  {{7}}.
- `booking_reminder_24h`: Hi {{1}}, get ready — {{2}} is on {{3}} at {{4}}.
  Meeting point: {{5}}. Directions: {{6}} — To stop these messages, reply
  STOP.
- `booking_reminder_3h`: See you soon, {{1}}! We meet at {{2}} at {{3}}.
  Please arrive a little early. Directions: {{4}} — To stop these messages,
  reply STOP.
- `booking_request_received`: Hi {{1}}, we've sent your request for {{2}}
  ({{3}}, {{4}}) to the host. You won't be charged unless they confirm.
  Reference: {{5}}.
- `booking_approved`: Good news {{1}} — the host confirmed {{2}} on {{3}} at
  {{4}}. Details and next steps: {{5}}
- `booking_declined`: Hi {{1}}, unfortunately the host couldn't accept your
  request for {{2}} on {{3}}. Nothing was charged. Browse more experiences at
  https://gharmish.com
- `booking_cancelled`: Hi {{1}}, your booking for {{2}} on {{3}} at {{4}} has
  been cancelled. Reference: {{5}}. {{6}}. Details: {{7}}
- `booking_rescheduled`: Hi {{1}}, your booking has moved — {{2}} is now on
  {{3}} at {{4}}. Your payment and reference ({{5}}) stay the same. Details:
  {{6}}

**v2 bodies — Arabic:**

- `booking_confirmed`: مرحبًا {{1}}، تم تأكيد حجزك! ✅ {{2}} يوم {{3}} الساعة {{4}}. الرقم المرجعي: {{5}}. الإيصال والفاتورة: {{6}}. الإجمالي المدفوع: {{7}}.
- `booking_reminder_24h`: مرحبًا {{1}}، استعدّ — تجربتك {{2}} يوم {{3}} الساعة {{4}}. نقطة اللقاء: {{5}}. الاتجاهات: {{6}} — لإيقاف هذه الرسائل أرسل «إيقاف».
- `booking_reminder_3h`: نراك قريبًا يا {{1}}! نلتقي في {{2}} الساعة {{3}}. نرجو الحضور قبل الموعد بقليل. الاتجاهات: {{4}} — لإيقاف هذه الرسائل أرسل «إيقاف».
- `booking_request_received`: مرحبًا {{1}}، أرسلنا طلبك لتجربة {{2}} ({{3}}، {{4}}) إلى المضيف. لن يُخصم منك أي مبلغ ما لم يقبل الطلب. الرقم المرجعي: {{5}}.
- `booking_approved`: خبر سار يا {{1}} — قبل المضيف حجزك لتجربة {{2}} يوم {{3}} الساعة {{4}}. التفاصيل والخطوات التالية: {{5}}
- `booking_declined`: مرحبًا {{1}}، للأسف لم يتمكن المضيف من قبول طلبك لتجربة {{2}} يوم {{3}}. لم يُخصم منك أي مبلغ. تصفّح تجارب أخرى: https://gharmish.com
- `booking_cancelled`: مرحبًا {{1}}، تم إلغاء حجزك لتجربة {{2}} يوم {{3}} الساعة {{4}}. الرقم المرجعي: {{5}}. {{6}}. التفاصيل: {{7}}
- `booking_rescheduled`: مرحبًا {{1}}، انتقل حجزك — تجربتك {{2}} أصبحت يوم {{3}} الساعة {{4}}. يبقى مبلغك ورقمك المرجعي ({{5}}) كما هما. التفاصيل: {{6}}

### Media-header variants (photos in WhatsApp)

`booking_confirmed_media` and `booking_reminder_24h_media` are
`twilio/media` templates: SAME body and variable slots as their plain
twins, plus one trailing media variable carrying the experience's
branded OG card PNG (`/{locale}/experiences/{slug}/card.png` — a
`.png`-suffixed alias of the opengraph-image route, because Twilio
validates media URLs by extension). Confirmed: media var **8**; 24h
reminder: media var **7**. The senders prefer the media key and pass the
plain key as `fallbackTemplate`, so messages keep flowing while the
media variant awaits approval — and forever for bookings whose listing
is gone. Env keys: `booking_confirmed_media.{ar,en}`,
`booking_reminder_24h_media.{ar,en}`.

### Host templates

| Template                   | Variables                                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| `host_new_booking`         | 1 experience · 2 date · 3 time · 4 party · 5 payout · **6 dashboard URL ★**                        |
| `host_new_request`         | same as above                                                                                      |
| `host_guest_cancelled`     | 1 experience · 2 date · 3 time · **4 dashboard URL ★**                                             |
| `host_payment_received`    | 1 experience · 2 date · 3 time · 4 payout · **5 dashboard URL ★**                                  |
| `host_booking_rescheduled` | 1 experience · 2 new date · 3 time · 4 dashboard URL — **no template exists yet; author + submit** |

**v2 bodies — English:**

- `host_new_booking`: New booking 🎉 {{1}} — {{2}} at {{3}}. Guests: {{4}}.
  Your payout: {{5}}. Manage: {{6}}
- `host_new_request`: New booking request: {{1}} — {{2}} at {{3}}. Guests:
  {{4}}. Payout: {{5}}. Please approve or decline before the deadline in your
  dashboard: {{6}}
- `host_guest_cancelled`: A guest cancelled: {{1}} on {{2}} at {{3}}. The
  spots are back on your calendar. Details: {{4}}
- `host_payment_received`: Payment received for {{1}} on {{2}} at {{3}} — this
  booking is fully secured. Your payout: {{4}}. Details: {{5}}
- `host_booking_rescheduled`: A booking moved: {{1}} is now on {{2}} at {{3}}.
  The previous date has its spots back. Details: {{4}}

**v2 bodies — Arabic:**

- `host_new_booking`: حجز جديد 🎉 {{1}} — {{2}} الساعة {{3}}. عدد الضيوف: {{4}}. مستحقاتك: {{5}}. الإدارة: {{6}}
- `host_new_request`: طلب حجز جديد: {{1}} — {{2}} الساعة {{3}}. عدد الضيوف: {{4}}. المستحقات: {{5}}. نرجو القبول أو الرفض قبل الموعد النهائي في لوحتك: {{6}}
- `host_guest_cancelled`: ألغى ضيف حجزه: {{1}} يوم {{2}} الساعة {{3}}. عادت المقاعد إلى تقويمك. التفاصيل: {{4}}
- `host_payment_received`: اكتمل الدفع لتجربة {{1}} يوم {{2}} الساعة {{3}} — أصبح الحجز مؤكّدًا بالكامل. مستحقاتك: {{4}}. التفاصيل: {{5}}
- `host_booking_rescheduled`: انتقل حجز: تجربتك {{1}} أصبحت يوم {{2}} الساعة {{3}}. عادت المقاعد إلى التاريخ السابق. التفاصيل: {{4}}

Email-only types that are ledgered but have no WhatsApp template by design:
`booking_expired`, `booking_payment_lapsed`, `booking_payment_failed`,
`booking_completed_review`, `host_booking_completed`,
`host_booking_cancelled`, `host_hold_lapsed`, `host_new_review`,
`host_dispute_opened`, `dispute_received`, `dispute_resolved`,
`review_replied`, `application_received`, `application_approved`,
`application_rejected`, `host_suspended`, `host_reinstated`,
`host_payout_paid`, `experience_approved`, `experience_rejected`,
`experience_changes_requested`. Add a template key in
`lib/notifications/types.ts` + a `whatsapp:` payload in the sender if any of
these should gain the channel later.

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

- **Failures are ledgered and re-driven.** A failed send is ledgered `failed`
  and the hourly cron's retry sweep re-fires retryable types (capped
  attempts, 48h window — see `lib/notifications/ledger.ts`). Failures are
  visible: `SELECT * FROM notification_deliveries WHERE
status = 'failed' ORDER BY created_at DESC;`
- **A missing Content SID is a `failed` row, not a silent skip** (2026-07-31
  audit): dispatching a template whose key isn't in the SID map ledgers
  `failed` with reason `no approved content SID for template/locale`. When
  the SID later lands in the env map, the retry sweep delivers the backlog.
  Blank template variables fail the same visible way.
- **Suppression applies to transactional sends too** — a STOP is a legal
  opt-out, not a preference. The guest keeps email notifications if they have
  an email on file.
- **24h window / template rule:** every outbound message uses a pre-approved
  Content template, so sends are valid at any time. Free-form replies are
  deliberately not implemented.
- Marketing campaigns are a separate later phase (consent capture first) —
  nothing here sends marketing.
