/**
 * Pure rendering for the booking-receipt email — no I/O, no `server-only`, so
 * the markup and the label/value table are unit-testable. The server-side
 * sender (booking-email.ts) gathers data and calls `renderReceiptEmail`.
 */

export interface ReceiptRow {
  label: string;
  value: string;
}

export interface ReceiptContent {
  subject: string;
  dir: 'ltr' | 'rtl';
  greeting: string;
  intro: string;
  rows: readonly ReceiptRow[];
  closing: string;
  footer: string;
  /**
   * Absolute URL of the brand wordmark PNG (email clients don't render
   * SVG). Optional so the pure renderer stays usable without a host.
   */
  logoUrl?: string;
}

/** HTML-escape a user/data string before interpolating into the template. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Render the booking-receipt email. Inline styles only — email clients strip
 * <style>/external CSS. Palette mirrors the brand (white surface,
 * sarat-black text).
 */
export function renderReceiptEmail(content: ReceiptContent): { html: string; text: string } {
  const rowsHtml = content.rows
    .map(
      (r) =>
        `<tr><td style="padding:6px 0;color:#6b6b6b;font-size:14px">${esc(r.label)}</td>` +
        `<td style="padding:6px 0;text-align:${content.dir === 'rtl' ? 'left' : 'right'};font-size:14px;color:#0A0A0A">${esc(r.value)}</td></tr>`,
    )
    .join('');

  // The wordmark is an inline (not block) img so its alignment follows
  // the document direction — start-aligned in both LTR and RTL.
  const logoHtml = content.logoUrl
    ? `<tr><td style="padding-bottom:24px"><img src="${esc(content.logoUrl)}" width="126" height="36" alt="Gharmish" style="border:0;outline:none" /></td></tr>\n`
    : '';

  const html = `<!doctype html><html dir="${content.dir}"><body style="margin:0;background:#FAFAFA;padding:32px 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:20px;padding:32px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
${logoHtml}<tr><td style="font-size:24px;font-weight:500;color:#0A0A0A;padding-bottom:8px">${esc(content.greeting)}</td></tr>
<tr><td style="font-size:16px;color:#3f3f3f;line-height:1.6;padding-bottom:20px">${esc(content.intro)}</td></tr>
<tr><td style="border-top:1px solid rgba(10,10,10,0.08);padding-top:16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table></td></tr>
<tr><td style="border-top:1px solid rgba(10,10,10,0.08);padding-top:16px;font-size:14px;color:#3f3f3f;line-height:1.6">${esc(content.closing)}</td></tr>
<tr><td style="padding-top:24px;font-size:12px;color:#9a9a9a">${esc(content.footer)}</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    content.greeting,
    '',
    content.intro,
    '',
    ...content.rows.map((r) => `${r.label}: ${r.value}`),
    '',
    content.closing,
    '',
    content.footer,
  ].join('\n');

  return { html, text };
}
