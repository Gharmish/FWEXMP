import { describe, expect, it } from 'vitest';
import type { ErrorEvent } from '@sentry/nextjs';
import { scrubEvent } from './sentry-scrub';

describe('scrubEvent', () => {
  it('redacts emails and phone numbers from the message', () => {
    const event = scrubEvent({
      message: 'failed for ahmed@example.com / +966501234567',
    } as ErrorEvent);
    expect(event.message).not.toContain('ahmed@example.com');
    expect(event.message).not.toContain('501234567');
    expect(event.message).toContain('[redacted]');
  });

  it('drops request cookies and headers wholesale', () => {
    const event = scrubEvent({
      request: {
        cookies: { session: 'secret' },
        headers: { authorization: 'Bearer x' },
        url: '/me',
      },
    } as unknown as ErrorEvent);
    expect(event.request?.cookies).toBeUndefined();
    expect(event.request?.headers).toBeUndefined();
    expect(event.request?.url).toBe('/me');
  });

  it('redacts PII nested inside extra', () => {
    const event = scrubEvent({
      extra: { booking: { guestPhone: '+966512345678', note: 'ok' } },
    } as unknown as ErrorEvent);
    const booking = (event.extra?.booking ?? {}) as Record<string, unknown>;
    expect(booking.guestPhone).toBe('[redacted]');
    expect(booking.note).toBe('ok');
  });

  it('redacts the exception value text but leaves non-PII intact', () => {
    const event = scrubEvent({
      exception: { values: [{ type: 'Error', value: 'no guest for guest@x.io' }] },
    } as ErrorEvent);
    expect(event.exception?.values?.[0]?.value).toBe('no guest for [redacted]');
  });

  it('reduces user to a redacted id only', () => {
    const event = scrubEvent({
      user: { id: '+966500000000', email: 'a@b.com', ip_address: '1.2.3.4' },
    } as ErrorEvent);
    expect(event.user).toEqual({ id: '[redacted]' });
  });
});

describe('scrubEvent — capability-bearing URLs (2026-09 engineering audit SEC-01)', () => {
  it('redacts link tokens, unsubscribe tokens and reference UUIDs from the request URL', () => {
    const event = scrubEvent({
      request: {
        url: 'https://gharmish.com/en/book/confirmed/3f1f2e6a-1111-4222-8333-444455556666?k=abcDEF123456789012345678901&slug=x',
        query_string: 'k=abcDEF123456789012345678901&slug=x',
      },
    } as unknown as ErrorEvent);
    expect(event.request?.url).toBe(
      'https://gharmish.com/en/book/confirmed/[uuid]?k=[redacted]&slug=x',
    );
    expect(event.request?.query_string).toBe('k=[redacted]&slug=x');
  });

  it('redacts the unsubscribe token and email params', () => {
    const event = scrubEvent({
      request: { url: '/api/marketing/unsubscribe?e=a%40b.com&t=tok123' },
    } as unknown as ErrorEvent);
    expect(event.request?.url).toBe('/api/marketing/unsubscribe?e=[redacted]&t=[redacted]');
  });

  it('scrubs tags and contexts like extra', () => {
    const event = scrubEvent({
      tags: { guest: 'ahmed@example.com' },
      contexts: { booking: { phone: '+966501234567' } },
    } as unknown as ErrorEvent);
    expect(JSON.stringify(event.tags)).not.toContain('ahmed@example.com');
    expect(JSON.stringify(event.contexts)).not.toContain('501234567');
  });
});
