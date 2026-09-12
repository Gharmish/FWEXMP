/**
 * The booking-request action's public state (2026-09 engineering audit
 * ARCH-07: the action is split into step modules under this folder; the
 * shapes the form binds to live here so every step can name them).
 *
 * An open booking shown back to a throttled guest so the `too_many`
 * error is a way forward (finish or cancel it) instead of a dead end.
 * Only bookings whose ownership is verifiable server-side — the
 * signed-in account's own guest row, or this device's last-booking
 * cookie — are ever returned: the submitted phone alone is unverified
 * input and must not let anyone enumerate someone else's bookings.
 */
export interface OpenBookingSummary {
  /** Unguessable booking capability (idempotencyKey) — keys the /book/confirmed URL. */
  reference: string;
  /** Human reference (GH-XXXXXX), display only. */
  referenceCode: string;
  experienceSlug: string;
  /** Experience title, already picked for the form's locale. */
  title: string;
  /** Experience date, `YYYY-MM-DD`. */
  date: string;
  /** What "open" means for this row — drives the status line in the form. */
  state: 'payment' | 'approval' | 'confirmed';
}

/**
 * The success path throws (Next.js `redirect`) before the action ever
 * returns — so observable state is always one of the error shapes.
 * `success` is kept on the type only to satisfy the useActionState
 * initial value contract.
 */
export interface BookingRequestState {
  success: false;
  message?: string;
  /** Set with `message: 'too_many'` when ownership could be verified. */
  openBookings?: OpenBookingSummary[];
  // `womenOnly` / `minAge` flag a missing eligibility acknowledgment;
  // `terms` flags the missing terms acceptance. None are echoed value
  // fields in the FIELD_NAMES sense (checkbox state, not text inputs).
  fields?: Partial<
    Record<
      | 'name'
      | 'phone'
      | 'preferredDate'
      | 'partySize'
      | 'email'
      | 'womenOnly'
      | 'terms'
      | 'minAge'
      | 'guestNote',
      string
    >
  >;
  // The checkbox values ('on' | '') are echoed too so an acknowledgment
  // survives a failed-submit form reset (React 19 resets the form after
  // the action).
  values?: Partial<
    Record<
      | 'name'
      | 'phone'
      | 'preferredDate'
      | 'partySize'
      | 'email'
      | 'womenOnly'
      | 'terms'
      | 'minAge'
      | 'marketingConsent'
      | 'guestNote',
      string
    >
  >;
}

export const FIELD_NAMES = [
  'name',
  'phone',
  'preferredDate',
  'partySize',
  'email',
  'guestNote',
] as const;
