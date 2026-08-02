# Gharmish — Legal Audit (Saudi Law), 2026-08-02

> AI-prepared audit (Claude) to brief licensed Saudi counsel. Not legal advice.
> The owner's standing blocker — human legal review of /terms and /privacy — still stands;
> this document is the input to that review, not a substitute.

**Overall posture:** engineering under the legal surface is strong (consent ledger with
version stamps, opt-in cookie consent, booking-gated reviews, snapshotted cancellation
policies, ZATCA-ready invoicing, Sentry PII scrubbing). The exposure is in legal content
and structure.

---

## A. Critical

### A1. Principal model vs. intermediary disclaimer
Gharmish is merchant of record, principal model (BRIEF.md, owner decision 2026-07-07),
co-creates experiences, and invoices under its own CR — yet the Terms disclaim all host
liability ("independent hosts… solely responsible", "at your own risk", liability capped
at booking price) and no party in the chain carries insurance. Under the Civil
Transactions Law (M/191, 2023) exoneration clauses do not shield personal-injury
liability caused by fault, and consumer-protection practice treats such adhesion terms
as unenforceable. A serious injury on an adventure experience lands on Gharmish.

**Needs an owner + counsel decision:** (a) restructure toward genuine agency (host as
merchant of record — with SAMA payment-aggregation implications), or (b) accept
principal status and price the risk: require host insurance for adventure categories,
obtain platform cover, rewrite the liability clause (economic-loss cap only, carve-out
for personal injury).

### A2. Public verification claims not performed by the code — **remediated 2026-08-02 (copy + gating)**
/trust-and-safety, /hosts, /how-it-works, /help claimed Gharmish verifies "tourism
licences", reviews experiences "in person", does "safety planning". Code reality:
tourism licence optional for individuals (features/host-applications/lib/documents.ts),
no licence number/expiry/registry check, and `approveApplication` set
`verificationStatus:'verified'` with zero document preconditions
(features/host-applications/admin-actions.ts).

Fix applied: copy aligned to reality (both locales) and application approval now
requires every required document for the identity type to be uploaded and approved.

### A3. Gharmish's own MoT licence
The Tourism Law and MoT regulations license tourism service providers, including
electronic platforms marketing tourism experiences. Nothing addresses whether the
platform itself holds or needs an MoT licence. **Threshold business question — counsel
to confirm with MoT.**

### A4. PDPL rights and retention promised but unimplemented — **partially remediated**
- No deletion path, no data-subject export, `onDelete:'restrict'` FKs block erasure.
- KYC documents kept indefinitely including rejected applicants → **remediated:**
  cron now deletes rejected applications' KYC documents 90 days after rejection.
- No controller identification in Terms/Privacy → **remediated:** CR-anchored
  identification added ("Gharmish Experience — CR 7051409212, Abha, Aseer").
- No breach-notification procedure (PDPL: notify SDAIA within 72h) — open.
- Cross-border transfer basis undocumented; several processors unnamed — open.
- `PII_ENCRYPTION_KEY` **verified present in Vercel production 2026-08-02** (set
  ~2026-07-28). New writes encrypt; legacy plaintext rows remain until rewritten —
  backfill still recommended.

## B. High

### B1. Refund disclosures vs. behaviour — **remediated (copy)**
Emergency-cancel returns full value as Gharmish Credit (card refund-out opt-in), but
the published policy promised refund-to-source and never mentioned credit. Invoice
rendered "refunded in full" on partial refunds. Both fixed 2026-08-02: policy page
discloses the credit path; invoice copy is now conditional on full vs partial.

### B2. Gharmish Credit has no legal terms — **remediated (Terms clause + sweep fix)**
Terms now cover: non-withdrawability, goodwill/promo expiry, refund-credit
non-expiry, refund-out-to-source cap. Expiry sweep fixed so an expiring goodwill lot
can never consume non-expiring refund credit (lot-provenance floor).

### B3. Minors unhandled under full-liability model — **partially remediated**
Terms assert 18+ but nothing enforced; no ages collected; `minAge` was display-only;
`family` category markets to children with no guardian consent. Fix applied: booking
form now requires an attestation when `minAge > 0` ("everyone in my group meets the
minimum age…"), server-enforced and persisted. Full per-guest age collection and
guardian consent remain open with counsel.

### B4. Terms formation and evidentiary gaps — **partially remediated**
- Terms accepted only at payment; request-to-book guests never accepted → fixed:
  acceptance checkbox at booking-request submission, server-enforced, persisted
  (`bookings.terms_accepted_at`).
- Version drift (pages said 7 July; `CURRENT_TERMS_VERSION` was 2026-07-10; tiers
  approved 2026-07-17) → fixed: docs and constant aligned to 2026-08-02.
- Women-only attestation enforced but not persisted → fixed:
  `bookings.women_only_attested_at`.
- Consent payment-event write is best-effort (can have holes) — open.
- "Continued use = acceptance" for material changes is weak — open (counsel).

### B5. Host relationship rests on one checkbox sentence
No host agreement: no commission disclosure (15% admin-set, never agreed in
writing), no payout timing, termination, indemnity, or licensing warranty. Draft a
real Arabic-primary host services agreement and gate activation on it. **Open —
legal drafting.**

## C. Medium (all open unless noted)

1. E-Commerce Law identification: no registered address or contact channel in
   footer; no /contact route; no consumer-dispute-avenue references.
2. Terms omissions: force majeure, severability, IP licence over user content,
   user indemnity, assignment, availability disclaimer.
3. VAT landmines (pre-registration posture currently compliant): resolve the
   wallet VAT-base question (docs/finance/vat-credit-base-question.md) BEFORE
   flipping vat_enabled; reconcile SELLER_LEGAL_NAME with the ZATCA certificate.
4. Admin access: env phone allowlist, no roles table, no 2FA, cleartext CSV
   exports — thin for PDPL organisational measures.
5. Suspension without notice/appeal flow.
6. Disputes: guest-only, one-shot, no SLA, no host right to be heard.
7. No cookie-consent withdrawal UI (only clearing browser cookies).
8. No marketing-consent capture exists — required before any promotional
   messaging (CST anti-spam).

## D. Strengths to preserve

Consent ledger + version stamps; genuine prior-opt-in pixels; snapshotted
cancellation tiers matching published copy; booking-gated reviews (the one
marketing claim that fully checks out); ZATCA Phase-1 QR + credit notes + VAT
snapshot + threshold monitor; Sentry/console PII scrubbing; masked audit trails.

## E. Priority actions

| # | Action | Status |
|---|--------|--------|
| 1 | Principal-vs-intermediary + insurance decision | Owner + counsel |
| 2 | Trust-page claims aligned; Verified gated on approved docs | DONE 2026-08-02 |
| 3 | Confirm platform MoT licence position | Counsel |
| 4 | PII key verified; KYC retention cron; controller identification | DONE (backfill open) |
| 5 | Wallet Terms clause; expiry-sweep provenance fix; invoice partial-refund copy | DONE |
| 6 | Booking-step terms acceptance; version alignment; women-only + min-age attestations persisted | DONE |
| 7 | Host services agreement | Counsel drafting |
