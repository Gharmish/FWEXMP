# WhatsApp communication — audit & redesign (2026-08-21)

> Every WhatsApp message Gharmish sends, before and after. Companion to
> `docs/notifications/twilio-setup.md` (operations) and
> `lib/notifications/whatsapp/` (the code). Status at the end of the day:
> code deployed with legacy fallback; 56 new Meta templates submitted.

## 1. Architecture before

- Copy lived in **Twilio Content templates** (plain `twilio/text`, no buttons),
  32 live keys in `TWILIO_WHATSAPP_CONTENT_SIDS`; the code only filled numbered
  slots. Formatting was ad hoc per call site in
  `features/bookings/lib/booking-email.ts` (10 guest + 4 host senders),
  `lib/admin-alerts.ts`, `features/support/actions.ts`, and the support agent.
- Every message: full guest name in the greeting, a dashboard/booking URL
  inside Arabic prose, dates with the year, "عدد الضيوف: 1", "مستحقاتك
  المتوقعة: 221 ر.س.." (double period), one paragraph.
- 4 keys the code sent **with no template at all** (`booking_payment_reminder`
  / `booking_awaiting_payment`, `booking_completed_review`, `admin_alert` —
  the admin WhatsApp rail had never fired). `admin_alert` bypassed the ledger.
  `booking_approved` overwrote the reference slot with a URL. Host dates
  rendered numerically while guest dates were long-form.
- 14 lifecycle events were email-only (payout paid, new review, moderation,
  application approved, completion, payment failed, ops cancel, on-hold…).
- ~24 orphaned v1 templates on the account; 70 Twilio-Verify auto OTP
  templates.
- **OTP** is not in the repo: Supabase Auth → Twilio Verify (channel
  `whatsapp`), Verify's own "{{1}} is your verification code" + Copy-code.

## 2. Architecture after

```
lib/notifications/whatsapp/
  types.ts        WhatsAppTemplate / VariableSpec / Button / RenderedWhatsApp
  templates/      guest.ts · host.ts · internal.ts (support + admin)
  registry.ts     WHATSAPP_TEMPLATES, providerKey('v3/<id>'), friendly names
  format.ts       waDate · waTime · waDateTime · waMoney · waGuests · waHours …
  links.ts        deep-link paths for buttons (locale-aware)
  render.ts       validation → positional vars + preview + Twilio payload
  provider.ts     Twilio REST adapter (moved from lib/notifications/whatsapp.ts)
  index.ts        whatsappPayload(id, locale, vars) → dispatcher payload
scripts/whatsapp-templates.ts   status · create · submit · sids
app/[locale]/admin/dev/whatsapp-preview   admin-only preview, AR + EN
```

Dispatcher (`lib/notifications/dispatch.ts`): resolves `v3/<id>` → legacy
fallback (own positional mapping) → ledgers `failed` with a reason when the
renderer refused (missing/unusable variable) or no SID exists. Dedupe is
unchanged: `(dedupeKey, channel)` unique; every send site keeps its key.

## 3. Templates discovered (live before today)

Guest: booking_confirmed (+media), booking_request_received, booking_approved,
booking_declined, booking_cancelled, booking_rescheduled, booking_reminder_24h
(+media), booking_reminder_3h. Host: host_new_booking, host_new_request,
host_guest_cancelled, host_payment_received, host_booking_rescheduled.
Support: support_ticket_update. Dead keys: booking_payment_reminder,
booking_completed_review, admin_alert. Free-form: support ack, agent replies,
admin replies.

## 4. Templates now standardised (28 ids × AR/EN, all UTILITY, one URL button)

| id | audience | trigger | legacy fallback |
|---|---|---|---|
| guest_booking_confirmed | guest | settle (instant / after approval) | booking_confirmed |
| guest_request_received | guest | request submitted | booking_request_received |
| guest_booking_approved | guest | host approves → pay button | booking_approved |
| guest_booking_declined | guest | host declines | booking_declined |
| guest_booking_cancelled | guest | any cancel; refund line from `REFUND_LINES` | booking_cancelled |
| guest_booking_rescheduled | guest | guest moves date | booking_rescheduled |
| guest_reminder_tomorrow | guest | cron ~24h | booking_reminder_24h |
| guest_reminder_soon | guest | cron ~3h, Maps button | booking_reminder_3h |
| guest_payment_pending | guest | instant hold created | — (was dead) |
| guest_payment_reminder | guest | cron ~2h before lapse | — (was dead) |
| guest_payment_failed | guest | gateway rejected | — (was email-only) |
| guest_review_invite | guest | completion | — (was dead) |
| guest_booking_on_hold | guest | host suspended | — (was email-only) |
| host_booking_new | host | instant hold created | host_new_booking |
| host_booking_confirmed | host | payment settled | host_payment_received |
| host_booking_request | host | request awaiting decision (+deadline) | host_new_request |
| host_booking_cancelled | host | guest / ops cancel | host_guest_cancelled |
| host_booking_rescheduled | host | guest moved | host_booking_rescheduled |
| host_reminder_tomorrow | host | cron ~24h (new) | — |
| host_booking_completed | host | completion, payout eligible | — (was email-only) |
| host_payout_sent | host | admin marks paid (IBAN last 4 only) | — (was email-only) |
| host_new_review | host | review created | — (was email-only) |
| host_experience_approved | host | moderation approved | — (was email-only) |
| host_experience_changes | host | changes requested | — (was email-only) |
| host_application_approved | host | onboarding approved | — (was email-only) |
| support_ticket_update | guest | admin follow-up out of window | support_ticket_update |
| support_ticket_resolved | guest | ticket resolved out of window | — |
| admin_alert | admin | every `notifyAdmin` (ledgered, deduped per alert row) | — (was dead) |

In-session free-form copy (no approval needed) also moved into the registry:
support acknowledgement, ticket opened, ticket resolved.

## 5. Files changed

New: `lib/notifications/whatsapp/{types,format,links,render,registry,index}.ts`,
`templates/{guest,host,internal}.ts`, tests (`format`, `render`, `templates`),
`scripts/whatsapp-templates.ts`, `app/[locale]/admin/dev/whatsapp-preview/page.tsx`,
`app/[locale]/host/(dashboard)/bookings/[ref]/page.tsx` (deep-link redirect).
Moved: `lib/notifications/whatsapp.ts` → `whatsapp/provider.ts`.
Changed: `lib/notifications/{dispatch,types}.ts`, `lib/admin-alerts.ts`,
`lib/conversations/inbound.ts`, `features/support/actions.ts`,
`features/bookings/lib/booking-email.ts`, `features/admin/payouts/{payout-email,actions}.ts`,
`features/reviews/lib/review-email.ts`, `features/admin/experience-moderation/moderation-email.ts`,
`features/host-applications/{lib/application-email,admin-actions}.ts`,
`package.json` (script), `.env.example`, `docs/notifications/twilio-setup.md`.

## 6. New helpers

`waDate`, `waTime`, `waDateTime`, `waMoney`, `waGuests`, `waHours`, `waDays`,
`waMinutes`, `waSpots`, `waExperiences`, `waTimeRemaining`, `arabicCount`,
`firstName`, `bidiIsolate`, `shortPlace`; `guestBookingPath`,
`guestInvoicePath`, `guestReviewPath`, `guestPayPath`, `experiencePath`,
`hostBookingPath`, `hostEarningsPath`, `hostReviewsPath`, `hostExperiencePath`,
`hostNewExperiencePath`, `mapsUrl`; `renderWhatsApp`, `whatsappPayload`,
`providerContentPayload`, `compileBody`, `isUsableValue`; `REFUND_LINES`.

## 7. CTA / deep-link behaviour

Every template has exactly one WhatsApp URL button
(`https://gharmish.com/{{n}}`; Maps base for the 3h reminder). Hosts land on
`/<locale>/host/bookings/<GH-ref>` (new redirect into the filtered list),
earnings, reviews, the experience, or the editor. Guests land on their booking
page (token in the path — it is the access proof, hidden behind the button),
the pay page, or the review anchor. No admin or gateway URLs; no raw URL in
any body.

## 8. Examples

Host, Arabic (benchmark):

```
✅ تم تأكيد الحجز

طقوس القهوة العسيرية وغداء السليق

📅 الخميس، 27 أغسطس
🕘 9:00 صباحًا
👤 ضيف واحد

💰 مستحقاتك: 221 ر.س.

اكتمل الدفع. نتمنى لك ولضيفك تجربة جميلة.
[ عرض الحجز ]
```

Guest, English:

```
🎉 Your experience is booked

Aseeri coffee ritual and saleeg lunch

📅 Thursday, 27 August
🕘 9:00 AM
👥 2 guests

Everything is set ✨
Your receipt and meeting point are on the booking page.
[ View booking ]
```

All 56 render in `/admin/dev/whatsapp-preview`.

## 9. Meta templates requiring approval

All 56 v3 templates (`gharmish_<id>_v3_<ar|en>`) were created and submitted
2026-08-21 (status `pending`). Until approved, each id sends its legacy
fallback where one exists; the 13 ids without a fallback ledger `failed` (as
before) and are re-driven by the hourly retry sweep once the SID lands. After
approval: `pnpm whatsapp:templates sids` → set `TWILIO_WHATSAPP_CONTENT_SIDS`
in Vercel Production → redeploy.

## 10. Tests

`format.test.ts` (dates incl. Riyadh-vs-UTC, year rule, Arabic time words,
plurals 1/2/few/many, money with thousands and no float residue, countdowns,
first names), `render.test.ts` (positional mapping, Arabic snapshot, legacy
fallback mapping, missing/`Invalid Date`/`NaN` refusal, unknown id),
`templates.test.ts` (every template × locale: Meta start/end/adjacent rules,
word ratio, length, button limits, variable coverage, sample render, locale
parity, brand spelling, no raw URLs, emoji cap, no "Dear customer"/"Hello").
Existing dispatcher/webhook/booking suites still pass (1412 total).

## 11. Edge cases discovered

- Two new ids collided with legacy SID-map keys → v3 keys are namespaced
  `v3/<id>` (caught before shipping).
- Meta refuses empty variables, so "omit the row" is impossible inside an
  approved body; optional data is modelled as required variables with safe
  fallbacks (meeting point → experience title; deadline → event date; IBAN →
  "account on file").
- `bankHint` next to `amount` and `subject`/`summary` were adjacent variables
  (Meta rule) — fixed with labels.
- Compound Arabic first names (عبد الله) stay whole in `firstName`.
- The guest booking token is part of the deep link by design; removing it
  would drop every guest into the page's preview state.

## 12. Not migrated and why

- **OTP body** — lives in Twilio Verify, not the repo. Custom Verify
  templates need Twilio approval (console/support). Current auto template is
  already concise and carries a Copy-code button.
- **Refund completed (G09)**, **weather cancellation (G14)**, **ticket/QR
  (G17)**, **wishlist back in stock (G18)**, **login alert (A02)**, **guest
  check-in (H07)**, **payout problem (H11)**, **availability nudge (H12)**:
  no corresponding workflow/trigger exists in the product; templates for
  them would be dead code. Refund status is covered inside
  `guest_booking_cancelled` via `REFUND_LINES`.
- **Experience rejected**: stays email + in-product (reviewer's note).
- **Marketing (rebook/win-back)**: email-only by policy until PDPL opt-in UX.
- **Agent free-form replies**: still LLM-written inside the 24h session (they
  are answers, not transactional notices); every transactional outcome the
  agent triggers (cancel, reschedule, ticket) also fires its deterministic
  template.

## 13. Recommendations

1. After approval, watch `notification_deliveries` for `failed` rows on v3
   keys for 48h, then delete the ~24 orphaned v1 templates on the account.
2. Give hosts a `preferredLanguage` (today inferred from `languages[0]`).
3. Add `hosts.contact_phone` for existing hosts so they actually receive these.
4. Consider Twilio Verify custom OTP copy in Arabic ("{{1}} رمز التحقق في غارميش").
5. A host-side "guest is on the way" check-in flow would unlock H07/H12 cleanly.
