/**
 * Types for the availability feature (2026-09 engineering audit ARCH-10 — they
 * lived beside the queries that produced them).
 */

export interface ScheduleData {
  availabilityWeekdays: number[];
  blackoutDates: string[];
  stopSellDates: string[];
  maxGroupSize: number;
  startTime: string;
  /** Hours before start that bookings close for the day (host-settable). */
  bookingCutoffHours: number;
  /** date `YYYY-MM-DD` → spots already taken by active bookings. */
  bookedByDate: Record<string, number>;
}
