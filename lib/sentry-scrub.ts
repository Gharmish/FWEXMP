import type { ErrorEvent } from '@sentry/nextjs';

/**
 * PII scrubbing for Sentry events (BRIEF §6 — "PII masking at the Sentry
 * boundary"). In KSA the guest's phone number is the primary identifier
 * and emails/names flow through booking + auth surfaces, so an unscrubbed
 * error payload would leak personal data into the monitoring tool.
 *
 * `beforeSend` runs on every event just before transport. We:
 *   - drop request cookies + headers wholesale (auth tokens, session),
 *   - redact email addresses and phone-shaped digit runs from every
 *     free-text field we control (message, exception text, extra,
 *     breadcrumbs, request body/query, user id).
 *
 * We deliberately do NOT touch stacktrace frames — file paths and line
 * numbers are not PII and mangling them would defeat the point of Sentry.
 * Over-redaction inside error payloads is acceptable; under-redaction is not.
 */

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// `+?` optional country prefix, then 8–15 total digits with optional
// spaces/dashes between groups — covers E.164 (+9665XXXXXXXX) and the
// raw national form the booking form accepts.
const PHONE_RE = /\+?\d[\d\s-]{7,16}\d/g;
const REDACTED = '[redacted]';

export function redactString(value: string): string {
  return value.replace(EMAIL_RE, REDACTED).replace(PHONE_RE, REDACTED);
}

export function redactValue(value: unknown): unknown {
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) out[key] = redactValue(val);
    return out;
  }
  return value;
}

const SECRET_QUERY_PARAMS = new Set(['k', 't', 'e', 'token', 'code']);
const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Redact capability-bearing query params in a raw query string. */
export function redactQuery(query: string): string {
  return query
    .replace(/^\?/, '')
    .split('&')
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf('=');
      const key = eq === -1 ? pair : pair.slice(0, eq);
      if (SECRET_QUERY_PARAMS.has(key)) return `${key}=[redacted]`;
      return pair;
    })
    .join('&');
}

/**
 * Redact a full URL: secret query params and UUID path segments (booking
 * references act as partial capabilities). Unparseable input is redacted
 * as plain text.
 */
export function redactUrl(url: string): string {
  try {
    const u = new URL(url, 'https://placeholder.invalid');
    u.pathname = u.pathname
      .split('/')
      .map((seg) => (UUID_SEGMENT.test(seg) ? '[uuid]' : seg))
      .join('/');
    u.search = u.search ? `?${redactQuery(u.search)}` : '';
    const out = u.toString();
    return url.startsWith('http') ? out : out.replace('https://placeholder.invalid', '');
  } catch {
    return redactString(url);
  }
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.user) {
    // Keep only a redacted id (a KSA user id may itself be a phone); drop
    // username/email/ip_address entirely.
    const id = event.user.id;
    event.user = id == null ? {} : { id: redactString(String(id)) };
  }

  if (event.request) {
    delete event.request.cookies;
    delete event.request.headers;
    // Booking link tokens (?k=), unsubscribe tokens (?t=, ?e=) and
    // reference UUIDs travel in URLs; an error on those routes must not
    // ship a live capability to the monitoring tool (2026-09 engineering
    // audit SEC-01).
    if (typeof event.request.url === 'string') {
      event.request.url = redactUrl(event.request.url);
    }
    if (typeof event.request.query_string === 'string') {
      event.request.query_string = redactString(redactQuery(event.request.query_string));
    }
    if (event.request.data !== undefined) {
      event.request.data = redactValue(event.request.data);
    }
  }

  if (typeof event.message === 'string') {
    event.message = redactString(event.message);
  }

  if (event.extra) {
    const scrubbed = redactValue(event.extra);
    event.extra = (scrubbed ?? {}) as Record<string, unknown>;
  }

  if (event.tags) {
    const scrubbed = redactValue(event.tags);
    event.tags = (scrubbed ?? {}) as typeof event.tags;
  }

  if (event.contexts) {
    const scrubbed = redactValue(event.contexts);
    event.contexts = (scrubbed ?? {}) as typeof event.contexts;
  }

  if (event.exception?.values) {
    for (const value of event.exception.values) {
      if (typeof value.value === 'string') value.value = redactString(value.value);
    }
  }

  if (event.breadcrumbs) {
    for (const crumb of event.breadcrumbs) {
      if (typeof crumb.message === 'string') crumb.message = redactString(crumb.message);
      if (crumb.data) crumb.data = redactValue(crumb.data) as Record<string, unknown>;
    }
  }

  return event;
}
