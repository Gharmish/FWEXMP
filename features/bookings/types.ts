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
}
