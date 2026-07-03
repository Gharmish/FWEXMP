/**
 * Date-range model for the admin dashboard filter.
 *
 * Everything the dashboard shows is windowed by a `[from, to]` calendar
 * range expressed in **Riyadh local days** (Asia/Riyadh is a fixed UTC+3,
 * no DST — BRIEF §4). We keep the range as `YYYY-MM-DD` strings (what the
 * URL and the <input type="date"> speak) and derive the precise UTC instant
 * bounds for SQL on demand, so callers never juggle timezones.
 *
 * Growth %: every ranged KPI compares against the **previous period of equal
 * length** immediately before `from` (Last 30 days → the 30 days before it),
 * which is `comparison(range)`.
 *
 * No date library: a fixed-offset zone needs only `Intl` (mirrors
 * `todayInRiyadh()` already used across admin) — keeps the stack lean
 * (BRIEF §5 "lean stacks age better").
 */

export const RIYADH_TZ = 'Asia/Riyadh';
/** Riyadh is UTC+3 year-round. */
const RIYADH_OFFSET = '+03:00';

export const DATE_PRESETS = ['today', '7d', '30d', 'month', '90d', 'custom'] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];

export const DEFAULT_PRESET = '30d' satisfies DatePreset;

/** A resolved range: inclusive Riyadh-local day bounds plus the chosen preset. */
export interface DateRange {
  preset: DatePreset;
  /** Inclusive start day, `YYYY-MM-DD` (Riyadh). */
  from: string;
  /** Inclusive end day, `YYYY-MM-DD` (Riyadh). */
  to: string;
}

/** How the time-series chart buckets the span. */
export type Granularity = 'day' | 'week' | 'month';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Today as a `YYYY-MM-DD` string in Riyadh (en-CA yields ISO order). */
export function todayInRiyadh(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: RIYADH_TZ }).format(now);
}

/** Add `days` (may be negative) to a `YYYY-MM-DD`, returning a `YYYY-MM-DD`. */
export function addDays(day: string, days: number): string {
  // Anchor at Riyadh noon so the ±days arithmetic can never cross a DST/UTC
  // edge into the wrong calendar day, then re-read the Riyadh date.
  const d = new Date(`${day}T12:00:00${RIYADH_OFFSET}`);
  d.setUTCDate(d.getUTCDate() + days);
  return todayInRiyadh(d);
}

/** First day of `day`'s month, `YYYY-MM-DD`. */
export function startOfMonth(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

/** Inclusive day count between two `YYYY-MM-DD` (same day → 1). */
export function dayCount(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00${RIYADH_OFFSET}`).getTime();
  const b = new Date(`${to}T12:00:00${RIYADH_OFFSET}`).getTime();
  return Math.round((b - a) / 86_400_000) + 1;
}

/**
 * UTC instant bounds for SQL: `[start, endExclusive)`. `start` is Riyadh
 * midnight of `from`; `endExclusive` is Riyadh midnight of the day AFTER
 * `to`, so the whole `to` day is included with a half-open comparison
 * (`created_at >= start AND created_at < endExclusive`).
 */
export function toInstantBounds(range: DateRange): { start: Date; endExclusive: Date } {
  const start = new Date(`${range.from}T00:00:00${RIYADH_OFFSET}`);
  const endExclusive = new Date(`${addDays(range.to, 1)}T00:00:00${RIYADH_OFFSET}`);
  return { start, endExclusive };
}

/** The equal-length period immediately before `range`, for growth %. */
export function comparison(range: DateRange): DateRange {
  const len = dayCount(range.from, range.to);
  const prevTo = addDays(range.from, -1);
  const prevFrom = addDays(prevTo, -(len - 1));
  return { preset: 'custom', from: prevFrom, to: prevTo };
}

/** Chart bucket size: daily for short spans, then weekly, then monthly. */
export function granularityFor(range: DateRange): Granularity {
  const days = dayCount(range.from, range.to);
  if (days <= 45) return 'day';
  if (days <= 182) return 'week';
  return 'month';
}

/** Days since Monday for a `YYYY-MM-DD` (Postgres `date_trunc('week')` aligns to Monday). */
function mondayOffset(day: string): number {
  const dow = new Date(`${day}T12:00:00${RIYADH_OFFSET}`).getUTCDay(); // 0=Sun..6=Sat
  return (dow + 6) % 7; // Mon→0 … Sun→6
}

/** Add `n` calendar months to a `YYYY-MM-01`, returning a `YYYY-MM-01`. */
function addMonths(firstOfMonth: string, n: number): string {
  const [y, m] = firstOfMonth.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}-01`;
}

/**
 * The full list of bucket labels (`YYYY-MM-DD`, Riyadh) the chart should
 * show for `range` at `gran`, so the series can be zero-filled with no gaps.
 * Labels match Postgres `date_trunc(gran, … at time zone 'Asia/Riyadh')`:
 * day = each day, week = each Monday, month = each 1st.
 */
export function enumerateBuckets(range: DateRange, gran: Granularity): string[] {
  const out: string[] = [];
  if (gran === 'day') {
    for (let d = range.from; d <= range.to; d = addDays(d, 1)) out.push(d);
    return out;
  }
  if (gran === 'week') {
    for (let d = addDays(range.from, -mondayOffset(range.from)); d <= range.to; d = addDays(d, 7)) {
      out.push(d);
    }
    return out;
  }
  for (let d = startOfMonth(range.from); d <= range.to; d = addMonths(d, 1)) out.push(d);
  return out;
}

function isValidDay(value: string | undefined): value is string {
  if (!value || !ISO_DATE.test(value)) return false;
  // Reject impossible dates (e.g. 2026-13-40): round-trips only if real.
  const d = new Date(`${value}T12:00:00${RIYADH_OFFSET}`);
  return !Number.isNaN(d.getTime()) && todayInRiyadh(d) === value;
}

function presetRange(preset: Exclude<DatePreset, 'custom'>, today: string): DateRange {
  switch (preset) {
    case 'today':
      return { preset, from: today, to: today };
    case '7d':
      return { preset, from: addDays(today, -6), to: today };
    case '30d':
      return { preset, from: addDays(today, -29), to: today };
    case 'month':
      return { preset, from: startOfMonth(today), to: today };
    case '90d':
      return { preset, from: addDays(today, -89), to: today };
  }
}

/**
 * Resolve the dashboard range from URL params. Precedence:
 *   1. An explicit, valid `from`+`to` → a custom range (regardless of preset).
 *   2. A known non-custom `preset` → its computed range.
 *   3. Otherwise the default (last 30 days).
 * Always returns a sane range with `from <= to` (swapped if reversed),
 * never throws on bad input — the dashboard must render.
 */
export function resolveDateRange(
  params: { preset?: string; from?: string; to?: string },
  now: Date = new Date(),
): DateRange {
  const today = todayInRiyadh(now);
  const preset = (DATE_PRESETS as readonly string[]).includes(params.preset ?? '')
    ? (params.preset as DatePreset)
    : undefined;

  if (isValidDay(params.from) && isValidDay(params.to)) {
    let { from, to } = { from: params.from, to: params.to };
    if (from > to) [from, to] = [to, from];
    return { preset: preset === 'custom' || preset === undefined ? 'custom' : preset, from, to };
  }

  if (preset && preset !== 'custom') return presetRange(preset, today);
  return presetRange(DEFAULT_PRESET, today);
}
