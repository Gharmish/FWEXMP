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
    if (typeof event.request.query_string === 'string') {
      event.request.query_string = redactString(event.request.query_string);
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
