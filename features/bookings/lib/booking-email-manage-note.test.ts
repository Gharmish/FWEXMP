import { describe, expect, it } from 'vitest';
import { createTranslator } from 'next-intl';
import en from '@/messages/en.json';
import ar from '@/messages/ar.json';
import { escapeHtml } from '@/lib/html';

/**
 * The "manage your booking" note in the receipt and reminder emails. Both
 * senders format it with `t.markup` and an `<a>` tag function exactly as
 * below; the senders suite stubs the translator, so this is the one place
 * the real catalog strings meet the real formatter. From 2026-07-15 to
 * 2026-09-13 the messages carried `<a href="{url}">` — not ICU — and plain
 * `t()` threw INVALID_MESSAGE, so guests received the raw message key
 * where the link should have been.
 */

const manageUrl = 'https://gharmish.com/en/book/GH-ABC123?k=tok&slug=x';
const a = (chunks: string) => `<a href="${escapeHtml(manageUrl)}">${chunks}</a>`;

describe.each([
  ['en', en],
  ['ar', ar],
] as const)('booking email manage note (%s)', (locale, messages) => {
  const errors: string[] = [];
  const t = createTranslator({
    locale,
    messages,
    namespace: 'bookingEmail',
    onError: (error) => errors.push(error.message),
  });

  it('renders the link with the escaped manage URL and the deadline', () => {
    const html = t.markup('reminderManageWithDeadline', { deadline: 'Sep 18, 2026, 9:00 AM', a });
    expect(errors).toEqual([]);
    expect(html).toContain('<a href="https://gharmish.com/en/book/GH-ABC123?k=tok&amp;slug=x">');
    expect(html).toContain('Sep 18, 2026, 9:00 AM');
    expect(html).not.toContain('{url}');
    expect(html).not.toContain('reminderManage');
  });

  it('renders the link without a deadline', () => {
    const html = t.markup('reminderManageNoDeadline', { a });
    expect(errors).toEqual([]);
    expect(html).toMatch(/<a href="https:\/\/gharmish\.com\/en\/book\/GH-ABC123\?k=tok&amp;slug=x">[^<]+<\/a>/);
  });
});
