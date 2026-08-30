/**
 * Shared booking types. `BookableOption` lives here (not in
 * booking-request-form.tsx) so booking-calendar.tsx doesn't have to
 * import from the form while the form imports the calendar — that was
 * the codebase's one circular import.
 */
export interface BookableOption {
  value: string;
  label: string;
  remaining: number;
  /** Pre-formatted "N spots left" (ICU formatted server-side). */
  spotsLabel: string;
  /**
   * Pre-formatted "Free cancellation until <exact date, time>" line for a
   * booking made NOW on this date — projected through `bookingOptions()`
   * server-side so the wording can never disagree with what the booking
   * will actually enforce. Only the booking-request picker sets it; the
   * reschedule picker leaves it out (a moved booking keeps the refund
   * deadlines of its original date, so a per-date line would mislead).
   */
  cancellationNote?: string;
}

/**
 * An in-window, non-past day that is NOT bookable, with why — produced by
 * `closedDates()` (features/bookings/lib/availability) and consumed by the
 * booking calendar so sold-out days read differently from days the
 * experience simply doesn't run. `value` is `YYYY-MM-DD`, formatted
 * identically to `BookableOption.value`.
 */
export interface ClosedDateOption {
  value: string;
  reason: 'full' | 'cutoff' | 'closed';
}
