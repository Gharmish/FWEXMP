# VAT base for wallet-credit-assisted bookings — question for the tax advisor

> Prepared 2026-07-20 as part of the financial audit remediation. This is the
> ONE open tax-technical question the codebase cannot answer for itself.
> Nothing is at stake until `platform_settings.vat_enabled` flips on ZATCA
> registration day — there is **zero live exposure today** — but the answer
> must be in hand before that day, because it decides a formula.

## Background (how the money works)

- Listed prices are **VAT-inclusive**. On a VAT-registered booking the
  disclosed portion is `total × rate / (10000 + rate)` and is snapshotted on
  the booking at payment settlement.
- **Promo codes** and **Gharmish Credit** (wallet) are both PLATFORM-FUNDED:
  they reduce the amount charged to the guest's card
  (`bookings.total_amount`), but the host is paid as if the guest paid full
  list price. Gharmish absorbs the difference out of its commission.
- Today's implementation carves VAT **from the charged amount only** (the
  post-discount, post-credit card capture). Both `splitCommission`
  (features/bookings/lib/commission.ts) and `vatPortionExpr`
  (features/bookings/lib/payout-sql.ts) implement this consistently.

## The question

For a booking where the guest pays partly with platform-issued wallet credit
(e.g. list price SAR 500, credit applied SAR 200, card charge SAR 300):

**Is the taxable consideration SAR 300 (what the guest actually paid) or
SAR 500 (the full supply value, with the platform-funded credit treated as
third-party consideration paid by Gharmish itself)?**

Points for the advisor:

1. Promo discounts are a genuine price reduction offered to the customer at
   the time of supply — VAT on the discounted price is the standard
   treatment. We believe this leg is safe.
2. Wallet credit is murkier. Most lots are **refund credit** (the guest's own
   money returned from a cancelled booking — arguably consideration the guest
   pays, meaning VAT base = SAR 500 in the example). Some lots are
   **goodwill/promotional credit** (platform-funded, closer to a discount).
   The ledger distinguishes lot types (`wallet_ledger.type`), so a per-type
   treatment is implementable if required.
3. ZATCA guidance on vouchers/store credit (single- vs multi-purpose voucher
   rules) likely controls the refund-credit case.

## What changes depending on the answer

- **"Charged amount" (current code):** nothing changes.
- **"Full supply value":** `vatPortionSar` / `vatPortionExpr` must add
  `wallet_applied_sar` (and possibly only refund-credit-funded shares) to the
  VAT base — a one-line change in each, but it also shifts host payout math
  (`vat + commission + payout` identity) and must be decided BEFORE the first
  VAT-stamped wallet-assisted booking exists, so history never needs
  restating.

## Who to ask / when

- The accountant engaged for ZATCA registration (registration is itself
  pending the 375K SAR threshold — see /admin/vat threshold monitor).
- Deadline: before flipping `vat_enabled` in /admin/settings.
