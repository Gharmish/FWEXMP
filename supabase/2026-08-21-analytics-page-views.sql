-- 2026-08-21 dashboard audit: site-level visits + traffic source.
-- Applied to the live project via Supabase MCP apply_migration (two
-- statements: the enum value must commit before any row can use it).
-- Mirrors db/schema.ts `analyticsEvents`.

alter type analytics_event_type add value if not exists 'page_view';

alter table analytics_events
  add column if not exists path text,
  add column if not exists referrer_host text,
  add column if not exists device text;

comment on column analytics_events.path is 'Route template served (page_view events), e.g. /, /hosting, /hosts/[slug]';
comment on column analytics_events.referrer_host is 'External Referer hostname only; null = direct or same-site';
comment on column analytics_events.device is 'mobile | desktop, from the user agent';
