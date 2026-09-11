-- One-off data correction: the two June bookings the 2026-08-02 ops
-- audit flagged as "stuck in processing" (OPS_AUDIT.md §1).
--
--   GH-Q3TS38  4ae3c6ec-c09f-4b51-8e1e-867f04450573  SAR 320  date 2026-06-06
--   GH-Y2E3CX  8c0d4a2a-63ae-4e74-99b2-22470bde9841  SAR 480  date 2026-06-04
--
-- WHAT CHANGED SINCE THE AUDIT (read before running)
-- ---------------------------------------------------
-- The audit found both rows at `payment_status = 'processing'`. As of
-- 2026-08-04 they are already `failed` — corrected out of band (the
-- ninth-audit session's "4 test rows corrected"). So the fix the audit
-- proposed (processing -> failed) is DONE; do not re-apply it.
--
-- What remains is the LIFECYCLE half of the same inconsistency: both
-- rows sit at `status = 'completed'` while their payment never
-- collected. That is a contradictory state, and it is unreachable by
-- the release-holds cron:
--   * Pass 1 excludes `completed` from its release set, and also
--     requires a non-null `payment_deadline` (both rows have null), so
--     the sweep can never reach them however long it runs;
--   * Pass 4 (auto-complete) already ran on them, which is how they
--     became `completed` in the first place.
-- They will stay wrong forever without a manual correction.
--
-- IS ANY REAL MONEY INVOLVED?  No.
-- Both `checkout_id`s point at HyperPay's UAT (sandbox) hosts —
-- `…uat01-vm-tx03` and `…uat01-vm-tx01` — so these were test payments,
-- never live captures. Neither row has a `payment_reference`, a
-- `paid_at`, or any `payment_events` (both predate the ledger, added
-- 2026-06-12). Optional belt-and-braces: confirm in the HyperPay
-- console that neither checkout id carries a capture before running.
--
-- PAYOUT EXPOSURE: none. `paymentCollected()` resolves to
-- `payment_status = 'paid'` whenever HyperPay is configured
-- (features/bookings/lib/payout-sql.ts), so these rows are already
-- excluded from payouts-owed and from the admin payouts page.
--
-- WHAT THIS FIXES: the contradictory state itself — the rows leave
-- `completed`, so they no longer count as completed bookings and no
-- longer gate review eligibility.
--
-- WHAT IT DOES **NOT** FIX (corrected after running): GMV is unchanged
-- at SAR 22,731. Dashboard GMV sums `total_amount` for every booking
-- whose status is not `refunded` — and `cancelled` still satisfies
-- that, so moving these rows out of `completed` does not remove them
-- from GMV. An earlier draft of this file predicted 22,731 -> 21,931;
-- that was wrong.
--
-- The measurement gap that prediction exposed is far larger than these
-- two rows: of the SAR 22,731 reported as GMV, SAR 12,091 across 36
-- CANCELLED bookings is money that never changed hands — 53% of the
-- headline figure. Fixing that is a metrics-query change (GMV should
-- key on collected payment, not on "not refunded"), not a data edit.
-- Logged as a follow-up in OPS_AUDIT.md; do not chase it here.
--
-- TARGET STATE: `cancelled` / `cancellation_kind = 'system'` — exactly
-- the terminal state cron Pass 1 gives an unpaid hold whose deadline
-- lapsed, so the corrected rows are indistinguishable from ones the
-- system released itself.
--
-- LEDGER: deliberately untouched. `payment_events` is append-only and
-- these bookings predate it; back-dating a synthetic settle_failed row
-- would fabricate history rather than record it. The correction's paper
-- trail is this file plus `cancellation_reason` on the row.
--
-- SAFETY: the UPDATE re-asserts every field of the expected current
-- state, so if anything drifted again it updates 0 rows instead of
-- overwriting someone else's work. Run the whole file as one
-- transaction and check the counts before COMMIT.

-- ===============================================================
-- APPLIED 2026-08-04 10:48 UTC against gharmish-experiences.
-- 2 rows updated, both now `cancelled` / `system`. Verified after:
-- contradictory completed-but-unpaid rows 9 -> 7 (the 7 May-era rows
-- below are the remainder), bookings in `processing` = 0, payouts-owed
-- set unchanged at 13 bookings. Kept for the audit trail; the UPDATE
-- is idempotent (the guard makes a re-run a 0-row no-op).
-- ===============================================================

begin;

-- 1. PREFLIGHT — expect exactly 2 rows, status=completed,
--    payment_status=failed, all money columns null.
select reference_code,
       status,
       payment_status,
       total_amount,
       paid_at,
       payment_reference,
       host_paid_at,
       payout_id,
       refunded_at,
       checkout_id
from bookings
where reference_code in ('GH-Q3TS38', 'GH-Y2E3CX')
order by reference_code;

-- 2. CORRECTION — guarded. 0 rows updated means the state drifted:
--    stop, re-run the preflight, and re-assess rather than loosening
--    the WHERE.
update bookings
set status              = 'cancelled',
    cancelled_at        = now(),
    cancellation_kind   = 'system',
    cancellation_reason = 'Ops correction 2026-08-04: sandbox (UAT) checkout never collected; '
                          || 'auto-completed in error while payment was stuck. See OPS_AUDIT.md.'
where reference_code in ('GH-Q3TS38', 'GH-Y2E3CX')
  and status           = 'completed'
  and payment_status   = 'failed'
  and paid_at          is null
  and payment_reference is null
  and host_paid_at     is null
  and payout_id        is null
  and refunded_at      is null
returning reference_code, status, payment_status, cancellation_kind;

-- 3. POST-CHECK — `contradictory_remaining` should drop from 9 to 7
--    (the 7 remaining are the May-era completed+unpaid rows, below).
select (select count(*) from bookings
         where status = 'completed' and payment_status <> 'paid') as contradictory_remaining,
       (select coalesce(sum(total_amount), 0) from bookings
         where status <> 'refunded')                              as gmv_after,
       (select count(*) from bookings
         where reference_code in ('GH-Q3TS38', 'GH-Y2E3CX')
           and status = 'cancelled')                              as corrected;

commit;

-- ---------------------------------------------------------------
-- NOT INCLUDED — the 7 May-era rows (decide separately)
-- ---------------------------------------------------------------
-- Seven more bookings are `completed` + `unpaid` with a null
-- payment_deadline (GH-48QW6Y, GH-959PB8, GH-G9XW4K, GH-T8XGCR,
-- GH-CD6R6P, GH-2GYZ9K, GH-9GK7WM — SAR 5,780 of phantom GMV, dates
-- 2026-05-12 … 2026-06-09). They are a DIFFERENT case: they predate
-- the payment flow entirely (null deadline = created while HyperPay
-- was unconfigured), so `completed` was legitimate at the time under
-- the payment-off arm of `paymentCollected()`.
--
-- Cancelling them would also orphan three SEEDED reviews
-- (d0000001…/d0000002…/d0000003… on GH-48QW6Y, GH-959PB8, GH-G9XW4K),
-- which are demo content the catalog's rating aggregates read from.
-- Reviews are gated on completed bookings, so those ratings would
-- become unreachable/inconsistent.
--
-- Recommendation: leave the rows alone and exclude pre-gateway
-- bookings from revenue reporting in code instead (a metrics-query
-- change, not a data edit). Do not fold them into the script above.
