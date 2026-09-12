import { describe, expect, it } from 'vitest';
import { formatVital, rateVital } from './vitals';

describe('rateVital', () => {
  it('applies the web.dev thresholds inclusively at the good edge', () => {
    expect(rateVital('LCP', 2500)).toBe('good');
    expect(rateVital('LCP', 2501)).toBe('needs-improvement');
    expect(rateVital('LCP', 4001)).toBe('poor');
    expect(rateVital('CLS', 0.1)).toBe('good');
    expect(rateVital('CLS', 0.3)).toBe('poor');
    expect(rateVital('INP', 350)).toBe('needs-improvement');
  });
});

describe('formatVital', () => {
  it('rounds milliseconds and keeps CLS to two decimals', () => {
    expect(formatVital('LCP', 1830.4)).toBe('1830 ms');
    expect(formatVital('CLS', 0.0451)).toBe('0.05');
  });
});
