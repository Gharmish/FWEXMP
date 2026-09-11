import { describe, expect, it } from 'vitest';
import { escapeHtml } from './html';

describe('escapeHtml', () => {
  it('escapes the four break-out characters and nothing else', () => {
    expect(escapeHtml('<a href="x">Tom & Jerry</a>')).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&lt;/a&gt;',
    );
    expect(escapeHtml("it's fine")).toBe("it's fine");
    expect(escapeHtml('غارميش')).toBe('غارميش');
  });
});
