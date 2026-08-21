-- WhatsApp support line, phase 2 (2026-08-21 — WHATSAPP_SUPPORT_PLAN.md).
-- Tickets for escalations + append-only ticket events + a persisted copy
-- of every admin alert. Mirrors db/schema.ts. ALREADY APPLIED to the live
-- project via Supabase MCP apply_migration; kept in-repo for the trail.
-- Idempotent.

do $$ begin
  create type support_ticket_category as enum
    ('refund_exception','payment_issue','safety_incident','host_no_show',
     'guest_complaint','host_request','account','other');
exception when duplicate_object then null; end $$;
do $$ begin
  create type support_ticket_priority as enum ('urgent','high','normal');
exception when duplicate_object then null; end $$;
do $$ begin
  create type support_ticket_status as enum ('open','waiting_guest','waiting_admin','resolved');
exception when duplicate_object then null; end $$;

create table if not exists support_tickets (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  conversation_id uuid references conversations(id) on delete set null,
  booking_id uuid references bookings(id) on delete set null,
  guest_id uuid references guests(id) on delete set null,
  category support_ticket_category not null default 'other',
  priority support_ticket_priority not null default 'normal',
  status support_ticket_status not null default 'open',
  summary text not null,
  opened_by text not null default 'agent',
  assignee_user_id uuid,
  sla_due_at timestamptz not null,
  escalated_at timestamptz,
  resolved_at timestamptz,
  resolved_by_user_id uuid,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists support_tickets_status_sla_idx on support_tickets (status, sla_due_at);
create index if not exists support_tickets_conversation_idx
  on support_tickets (conversation_id) where conversation_id is not null;

create table if not exists support_ticket_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support_tickets(id) on delete cascade,
  kind text not null,
  actor text not null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists support_ticket_events_ticket_idx
  on support_ticket_events (ticket_id, created_at);

create table if not exists admin_alerts (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  subject text not null,
  detail jsonb not null default '{}'::jsonb,
  ticket_id uuid references support_tickets(id) on delete set null,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists admin_alerts_created_idx on admin_alerts (created_at);

alter table support_tickets enable row level security;
alter table support_ticket_events enable row level security;
alter table admin_alerts enable row level security;

-- Agent concurrency lock (one turn per conversation at a time).
alter table conversations add column if not exists agent_lock_until timestamptz;

-- Phase 3: web "report a problem" also lives as a ticket.
alter table disputes add column if not exists ticket_id uuid;
