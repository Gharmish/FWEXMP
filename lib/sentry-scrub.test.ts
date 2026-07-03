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
