import { describe, expect, it } from 'vitest';
import { isRetryableTxError, isUniqueViolation } from './db-errors';

describe('isUniqueViolation', () => {
  it('matches a bare postgres error', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
  });

  it('walks the DrizzleQueryError cause chain', () => {
    const wrapped = new Error('Failed query', { cause: { code: '23505' } });
    expect(isUniqueViolation(wrapped)).toBe(true);
    const twice = new Error('outer', { cause: wrapped });
    expect(isUniqueViolation(twice)).toBe(true);
  });

  it('matches a named constraint anywhere in the cause chain', () => {
    const pg = { code: '23505', constraint_name: 'disputes_one_open_per_booking' };
    const wrapped = new Error('Failed query', { cause: pg });
    expect(isUniqueViolation(wrapped, 'disputes_one_open_per_booking')).toBe(true);
    expect(isUniqueViolation(wrapped, 'reviews_booking_id_unique')).toBe(false);
  });

  it('rejects other codes, plain errors and non-objects', () => {
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
    expect(isUniqueViolation(new Error('boom'))).toBe(false);
    expect(isUniqueViolation('23505')).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});

describe('isRetryableTxError', () => {
  it('matches serialization failures and deadlocks through the chain', () => {
    expect(isRetryableTxError({ code: '40001' })).toBe(true);
    expect(isRetryableTxError(new Error('x', { cause: { code: '40P01' } }))).toBe(true);
    expect(isRetryableTxError({ code: '23505' })).toBe(false);
  });
});
