-- WhatsApp support line, phase 0 (2026-08-21 — WHATSAPP_SUPPORT_PLAN.md).
-- Conversation + message storage for inbound WhatsApp so the Twilio
-- webhook stops dropping guest messages. Mirrors db/schema.ts
-- (conversations, conversation_messages). Applied to the live project via
-- Supabase MCP apply_migration; kept in-repo for the trail (per the
-- drizzle-push-drift rule, never db:push). Idempotent.

do $$ begin
  create type conversation_channel as enum ('whatsapp');
exception when duplicate_object then null; end $$;
do $$ begin
  create type conversation_state as enum ('bot', 'human', 'closed');
exception when duplicate_object then null; end $$;
do $$ begin
  create type conversation_direction as enum ('in', 'out');
exception when duplicate_object then null; end $$;
do $$ begin
  create type conversation_author as enum ('guest', 'agent', 'admin', 'system');
exception when duplicate_object then null; end $$;

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  channel conversation_channel not null default 'whatsapp',
  address text not null,
  guest_id uuid references guests(id) on delete set null,
  host_id uuid references hosts(id) on delete set null,
  locale locale not null default 'ar',
  state conversation_state not null default 'human',
  profile_name text,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  last_ack_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_channel_address_uq unique (channel, address)
);
create index if not exists conversations_state_inbound_idx on conversations (state, last_inbound_at);
create index if not exists conversations_guest_idx on conversations (guest_id) where guest_id is not null;

create table if not exists conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  direction conversation_direction not null,
  author conversation_author not null,
  body text not null default '',
  media_url text,
  media_content_type text,
  provider_message_id text,
  delivery_id uuid references notification_deliveries(id) on delete set null,
  tool_calls jsonb,
  created_at timestamptz not null default now()
);
create index if not exists conversation_messages_conversation_idx
  on conversation_messages (conversation_id, created_at);
create unique index if not exists conversation_messages_provider_uq
  on conversation_messages (provider_message_id) where provider_message_id is not null;

-- Deny-by-default posture: the app connects as gharmish_app (BYPASSRLS).
alter table conversations enable row level security;
alter table conversation_messages enable row level security;
