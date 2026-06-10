import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from '@/lib/csv';

describe('csvCell', () => {
  it('passes plain values through', () => {
    expect(csvCell('abha')).toBe('abha');
    expect(csvCell(480)).toBe('480');
    expect(csvCell(null)).toBe('');
  });

  it('quotes separators and doubles quotes', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"');
  });

  it('defuses spreadsheet formula injection', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('+966501234567')).toBe("'+966501234567");
  });
});

describe('toCsv', () => {
  it('builds a BOM-prefixed CRLF document', () => {
    const csv = toCsv(['a', 'b'], [['1', 'x,y']]);
    expect(csv).toBe('﻿a,b\r\n1,"x,y"\r\n');
  });
});
