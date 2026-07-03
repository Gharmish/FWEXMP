import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/**
 * Pins reportError's branch behaviour: dev prints to console with the
 * [gharmish] prefix and surface label; production WITH a Sentry DSN
 * forwards to Sentry.captureException with `surface` as a tag and the
 * rest of the context as `extra`; production WITHOUT a DSN falls back
 * to the console so platform function logs capture the error instead
 * of it vanishing into a no-op Sentry queue.
 */

const captureException = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

describe('reportError', () => {
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
  const ORIGINAL_SENTRY_DSN = process.env.SENTRY_DSN;

  beforeEach(() => {
    captureException.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // @ts-expect-error -- NODE_ENV is readonly in TS but we own it in this test
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    if (ORIGINAL_SENTRY_DSN === undefined) delete process.env.SENTRY_DSN;
    else process.env.SENTRY_DSN = ORIGINAL_SENTRY_DSN;
  });

  it('logs to console with [gharmish] prefix in non-production', async () => {
    // @ts-expect-error -- mutating NODE_ENV for the duration of this test
    process.env.NODE_ENV = 'development';
    const { reportError } = await import('./log');
    const error = new Error('boom');

    reportError(error, { surface: 'unit-test', extra1: 'x' });

    const calls = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('[gharmish]');
    expect(calls[0][1]).toBe('unit-test');
    expect(captureException).not.toHaveBeenCalled();
  });

  it('forwards to Sentry.captureException in production with tags + extra', async () => {
    // @ts-expect-error -- mutating NODE_ENV for the duration of this test
    process.env.NODE_ENV = 'production';
    process.env.SENTRY_DSN = 'https://key@sentry.example/1';
    vi.resetModules();
    const { reportError } = await import('./log');
    const error = new Error('production boom');

    reportError(error, { surface: 'checkout', locale: 'ar', userId: 'u_123' });

    expect(captureException).toHaveBeenCalledTimes(1);
    const [capturedError, captureContext] = captureException.mock.calls[0];
    expect(capturedError).toBe(error);
    expect(captureContext).toEqual({
      tags: { surface: 'checkout' },
      extra: { locale: 'ar', userId: 'u_123' },
    });
  });

  it('omits the tags object when no surface is provided', async () => {
    // @ts-expect-error -- mutating NODE_ENV for the duration of this test
    process.env.NODE_ENV = 'production';
    process.env.SENTRY_DSN = 'https://key@sentry.example/1';
    vi.resetModules();
    const { reportError } = await import('./log');

    reportError(new Error('no surface'));

    expect(captureException).toHaveBeenCalledTimes(1);
    const [, captureContext] = captureException.mock.calls[0];
    expect(captureContext).toEqual({ tags: undefined, extra: {} });
  });

  it('falls back to console in production when no Sentry DSN is set', async () => {
    // @ts-expect-error -- mutating NODE_ENV for the duration of this test
    process.env.NODE_ENV = 'production';
    delete process.env.SENTRY_DSN;
    vi.resetModules();
    const { reportError } = await import('./log');

    reportError(new Error('dsn-less boom'), { surface: 'storage' });

    const calls = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('[gharmish]');
    expect(calls[0][1]).toBe('storage');
    expect(captureException).not.toHaveBeenCalled();
  });
});
