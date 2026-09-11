-- 2026-09 engineering audit AI-06: agent-driven cancellations get their
-- own kind so the audit trail can tell them from web self-service.
-- Apply BEFORE deploying code that writes 'agent' (enum values cannot be
-- used in the same transaction they are added in).
ALTER TYPE "public"."cancellation_kind" ADD VALUE 'agent' BEFORE 'host';