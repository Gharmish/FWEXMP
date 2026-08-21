-- 2026-08-21 — WhatsApp support agent: identity challenge (security audit H3).
--
-- The agent resolved the sender to a guest purely from the WhatsApp
-- number, and `guests.phone` / `bookings.contact_phone` are both written
-- from an UNVERIFIED field typed into the booking form. One mistyped
-- digit, or a recycled Saudi number, and a stranger could read the
-- booking, cancel it, and nominate the IBAN its refund is wired to.
--
-- The reads were never the new exposure: guest WhatsApp notifications
-- already go to `contact_phone ?? guests.phone`, so that number receives
-- the full booking detail and the tokenised link regardless. The WRITES
-- were: cancel, reschedule and refund-bank-details all require
-- `bookingViewerCanAccess` on the web (signed-in owner, or the browser's
-- signed cookie) and accept neither the phone number nor the link token.
-- The agent handed all three out on the number alone.
--
-- The challenge cannot be delivered to the phone — the phone is the thing
-- in doubt, and an OTP to it proves nothing to a wrong-number holder who
-- would simply receive it. The email on the booking is the one factor the
-- guest holds that the number does not receive, so that is what the agent
-- asks for before any write. A booking with no email on file cannot be
-- challenged at all; there the agent opens a ticket for a person.
--
-- These two columns record the outcome per conversation, so the guest is
-- asked once rather than on every message. The guest id is stored
-- alongside deliberately: a conversation that is later re-identified to a
-- different guest must not inherit a verification proven for the
-- previous one.
--
-- Applied to gharmish-experiences via Supabase MCP apply_migration.

alter table conversations
  add column if not exists identity_verified_at timestamptz,
  add column if not exists identity_verified_guest_id uuid references guests (id) on delete set null;

comment on column conversations.identity_verified_at is
  'When this sender proved the email on their booking (support-agent identity challenge). Null = unverified: the agent may read and open tickets, never cancel, reschedule or set refund bank details.';

comment on column conversations.identity_verified_guest_id is
  'The guest the verification was proven FOR. A verification is only honoured while conversations.guest_id still matches this — re-identification invalidates it.';
