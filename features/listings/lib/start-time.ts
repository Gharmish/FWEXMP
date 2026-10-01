import type { Locale } from '@/lib/i18n';
import { formatTime } from '@/lib/format';

/**
 * Start-time choices for the listing forms' `<select>`, every 15
 * minutes. A native `<input type="time">` looked filled when it was
 * empty (Safari shows a grey placeholder time) and was unreliable to
 * change on iOS, so hosts saved listings with no start time. An
 * existing off-grid value (set before this picker, or by an admin) is
 * kept as an extra option so re-saving never silently moves it.
 */
const START_TIME_STEP_MINUTES = 15;

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function startTimeOptions(current: string): string[] {
  const slots: string[] = [];
  for (let m = 0; m < 24 * 60; m += START_TIME_STEP_MINUTES) {
    slots.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  if (HHMM_RE.test(current) && !slots.includes(current)) {
    slots.push(current);
    slots.sort();
  }
  return slots;
}

/** `09:00` → `9:00 AM` / `9:00 ص`. The value is a wall-clock time, so it is formatted as UTC to keep the zone out of it. */
export function formatStartTime(value: string, locale: Locale): string {
  const [h, m] = value.split(':').map(Number);
  return formatTime(new Date(Date.UTC(2000, 0, 1, h, m)), locale, { timeZone: 'UTC' });
}
