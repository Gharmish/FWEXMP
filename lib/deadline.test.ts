import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boundedQuery, DeadlineError, withDeadline } from '@/lib/deadline';

vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));

/** A promise that never settles — the poisoned-pooler hang in miniature. */
const hang = <T>(): Promise<T> => new Promise<T>(() => {});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('withDeadline', () => {
  it('resolves a fast promise untouched', async () => {
    await expect(withDeadline('fast', 1_000, Promise.resolve(42))).resolves.toBe(42);
  });

  it('rejects with DeadlineError once the deadline passes', async () => {
    const p = withDeadline('slow', 1_000, hang<number>());
    const assertion = expect(p).rejects.toBeInstanceOf(DeadlineError);
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
  });
});

describe('boundedQuery', () => {
  it('returns the value when the first attempt settles in time', async () => {
    const run = vi.fn(() => Promise.resolve('ok'));
    await expect(boundedQuery('q', run)).resolves.toBe('ok');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('retries once when the first attempt hangs', async () => {
    const run = vi
      .fn<() => Promise<string>>()
      .mockImplementationOnce(() => hang<string>())
      .mockImplementationOnce(() => Promise.resolve('recovered'));
    const p = boundedQuery('q', run);
    await vi.advanceTimersByTimeAsync(8_000);
    await expect(p).resolves.toBe('recovered');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('throws DeadlineError after two hung attempts — never a third', async () => {
    const run = vi.fn(() => hang<string>());
    const p = boundedQuery('q', run);
    const assertion = expect(p).rejects.toBeInstanceOf(DeadlineError);
    await vi.advanceTimersByTimeAsync(8_000);
    await vi.advanceTimersByTimeAsync(8_000);
    await assertion;
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('propagates a real rejection immediately without retrying', async () => {
    const boom = new Error('57014 statement timeout');
    const run = vi.fn(() => Promise.reject(boom));
    await expect(boundedQuery('q', run)).rejects.toBe(boom);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('accepts a thenable (Drizzle query builders are PromiseLike)', async () => {
    const thenable: PromiseLike<string> = {
      then: (onFulfilled) => Promise.resolve('rows').then(onFulfilled),
    };
    await expect(boundedQuery('q', () => thenable)).resolves.toBe('rows');
  });
});
