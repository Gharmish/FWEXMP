import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

/**
 * Pins reportError's two-branch behaviour: dev prints to console with
 * the [gharmish] prefix and surface label; production forwards to
 * Sentry.captureException with `surface` as a tag and the rest of the
 * context as `extra`.
 */

const captureException = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

describe('reportError', () => {
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

  beforeEach(() => {
    captureException.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // @ts-expect-error -- NODE_ENV is readonly in TS but we own it in this test
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
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
    vi.resetModules();
    const { reportError } = await import('./log');

    reportError(new Error('no surface'));

    expect(captureException).toHaveBeenCalledTimes(1);
    const [, captureContext] = captureException.mock.calls[0];
    expect(captureContext).toEqual({ tags: undefined, extra: {} });
  });
});
