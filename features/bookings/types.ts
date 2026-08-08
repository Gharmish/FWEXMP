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
