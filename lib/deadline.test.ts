import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  boundedQuery,
  DeadlineError,
  isTransientConnectionError,
  withDeadline,
} from '@/lib/deadline';
import { resetDb } from '@/lib/db';

vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
vi.mock('@/lib/db', () => ({
  getDbGeneration: vi.fn(() => 7),
  resetDb: vi.fn(() => true),
}));

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
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(p).resolves.toBe('recovered');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('replaces the pool (with the generation it saw) before retrying a hang', async () => {
    const run = vi
      .fn<() => Promise<string>>()
      .mockImplementationOnce(() => hang<string>())
      .mockImplementationOnce(() => Promise.resolve('fresh pool'));
    const p = boundedQuery('q', run);
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(p).resolves.toBe('fresh pool');
    expect(resetDb).toHaveBeenCalledWith(7);
  });

  it('retries a transient connection error once, without resetting the pool', async () => {
    const dead = Object.assign(new Error('write ETIMEDOUT'), { code: 'ETIMEDOUT' });
    const run = vi
      .fn<() => Promise<string>>()
      .mockImplementationOnce(() => Promise.reject(dead))
      .mockImplementationOnce(() => Promise.resolve('reconnected'));
    await expect(boundedQuery('q', run)).resolves.toBe('reconnected');
    expect(run).toHaveBeenCalledTimes(2);
    expect(resetDb).not.toHaveBeenCalled();
  });

  it('throws DeadlineError after two hung attempts — never a third', async () => {
    const run = vi.fn(() => hang<string>());
    const p = boundedQuery('q', run);
    const assertion = expect(p).rejects.toBeInstanceOf(DeadlineError);
    await vi.advanceTimersByTimeAsync(5_000);
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

describe('isTransientConnectionError', () => {
  it('recognises driver, socket and SQLSTATE connection codes', () => {
    expect(
      isTransientConnectionError(Object.assign(new Error('x'), { code: 'CONNECT_TIMEOUT' })),
    ).toBe(true);
    expect(isTransientConnectionError(Object.assign(new Error('x'), { code: '08006' }))).toBe(true);
    expect(
      isTransientConnectionError(new Error('(EAUTHTIMEOUT) timeout while waiting for message')),
    ).toBe(true);
  });

  it('looks through Drizzle/postgres.js cause chains', () => {
    const cause = Object.assign(new Error('write ETIMEDOUT'), { code: 'ETIMEDOUT' });
    const wrapped = new Error('Failed query: select 1', { cause });
    expect(isTransientConnectionError(wrapped)).toBe(true);
  });

  it('rejects real SQL errors', () => {
    expect(isTransientConnectionError(Object.assign(new Error('bad'), { code: '42P10' }))).toBe(
      false,
    );
    expect(isTransientConnectionError(Object.assign(new Error('timeout'), { code: '57014' }))).toBe(
      false,
    );
    expect(isTransientConnectionError('nope')).toBe(false);
  });
});
