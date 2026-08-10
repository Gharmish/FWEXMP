import { describe, it, expect } from 'vitest';
import { renderReceiptEmail, type ReceiptContent } from './booking-email-render';

const base: ReceiptContent = {
  subject: 'Your Gharmish booking is confirmed',
  dir: 'ltr',
  greeting: 'Hi Aziz,',
  intro: "We've received your payment — your booking is confirmed.",
  rows: [
    { label: 'Experience', value: 'Juniper forest dawn walk' },
    { label: 'Total paid', value: 'SAR 320' },
    { label: 'Reference', value: '2b2840da-e4d3-45fe-af26-f356fe63470d' },
  ],
  closing: "We'll send the meeting point before the day.",
  footer: 'Gharmish',
};

describe('renderReceiptEmail', () => {
  it('renders every row label and value into the html', () => {
    const { html } = renderReceiptEmail(base);
    for (const row of base.rows) {
      expect(html).toContain(row.label);
      expect(html).toContain(row.value);
    }
    expect(html).toContain('Hi Aziz,');
    expect(html).toContain('dir="ltr"');
  });

  it('produces a plain-text fallback mirroring the rows', () => {
    const { text } = renderReceiptEmail(base);
    expect(text).toContain('Hi Aziz,');
    expect(text).toContain('Experience: Juniper forest dawn walk');
    expect(text).toContain('Total paid: SAR 320');
    expect(text).toContain('Gharmish');
  });

  it('renders the brand logo only when a URL is provided', () => {
    const withLogo = renderReceiptEmail({
      ...base,
      logoUrl: 'https://gharmish.com/images/gharmish-email-logo.png',
    });
    expect(withLogo.html).toContain('img src="https://gharmish.com/images/gharmish-email-logo.png"');
    expect(withLogo.html).toContain('alt="Gharmish — Experiences Marketplace"');
    expect(renderReceiptEmail(base).html).not.toContain('<img');
  });

  it('sets rtl direction for Arabic', () => {
    const { html } = renderReceiptEmail({ ...base, dir: 'rtl' });
    expect(html).toContain('dir="rtl"');
  });

  it('renders bullets, host, and a boxed note when provided', () => {
    const { html, text } = renderReceiptEmail({
      ...base,
      cta: { label: 'Open meeting point in Google Maps', url: 'https://maps.example/?q=1,2' },
      bullets: { heading: 'What to bring', items: ['Walking shoes', 'Water and a hat'] },
      host: { name: 'Faisal Al-Qahtani', note: 'Your host for the evening' },
      note: { html: 'Free cancellation until noon. <a href="https://g/manage">Manage</a>' },
    });
    expect(html).toContain('Open meeting point in Google Maps');
    expect(html).toContain('What to bring');
    expect(html).toContain('Walking shoes');
    expect(html).toContain('Faisal Al-Qahtani');
    // The note's anchor is trusted markup and must survive into the HTML.
    expect(html).toContain('href="https://g/manage"');
    // Plain-text strips the anchor tag but keeps its text.
    expect(text).toContain('- Walking shoes');
    expect(text).toContain('Free cancellation until noon. Manage');
    expect(text).not.toContain('<a href');
  });

  it('omits optional blocks entirely when absent or empty', () => {
    const { html } = renderReceiptEmail({ ...base, bullets: { heading: 'X', items: [] } });
    expect(html).not.toContain('>X<');
  });

  it('escapes HTML-significant characters to prevent injection', () => {
    const { html } = renderReceiptEmail({
      ...base,
      greeting: 'Hi <script>alert(1)</script>,',
      rows: [{ label: 'Experience', value: 'A & B "tour" <x>' }],
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('A &amp; B &quot;tour&quot; &lt;x&gt;');
  });
});
