/**
 * Split a policy-computed refund between the card and the wallet for a
 * booking that was paid part-card / part-Gharmish-Credit.
 *
 * `policyAmountSar` must be computed on the FULL paid base
 * (`totalAmount + walletAppliedSar`) — the charged card amount plus the
 * redeemed credit. The split is card-first: the gateway can only
 * reverse what the card actually paid, so the card leg is capped at the
 * charged amount and any remainder returns as wallet credit.
 */
export interface RefundSplit {
  cardRefundSar: number;
  creditRefundSar: number;
}

export function splitRefund(
  policyAmountSar: number,
  cardChargedSar: number,
  walletCreditSar: number,
): RefundSplit {
  const cardRefundSar = Math.max(0, Math.min(policyAmountSar, cardChargedSar));
  const creditRefundSar = Math.max(0, Math.min(policyAmountSar - cardRefundSar, walletCreditSar));
  return { cardRefundSar, creditRefundSar };
}
