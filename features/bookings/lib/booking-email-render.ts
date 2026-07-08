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
  /**
   * Optional action button between the rows and the closing — e.g.
   * "View your invoice". Plain-text emails render it as `label: url`.
   */
  cta?: { label: string; url: string };
  closing: string;
  footer: string;
  /**
   * Absolute URL of the brand wordmark PNG (email clients don't render
   * SVG). Optional so the pure renderer stays usable without a host.
   */
  logoUrl?: string;
  /**
   * Optional seller-identity lines under the logo (name, CR, region) —
   * turns the receipt email into a self-contained invoice. Rendered as
   * small muted lines; omitted entirely when absent.
   */
  sellerLines?: readonly string[];
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
    ? `<tr><td style="padding-bottom:${content.sellerLines?.length ? 8 : 24}px"><img src="${esc(content.logoUrl)}" width="126" height="36" alt="Gharmish" style="border:0;outline:none" /></td></tr>\n`
    : '';

  // Seller identity (name / CR / region) — small muted lines that make the
  // email a self-contained receipt. Start-aligned in both LTR and RTL.
  const sellerHtml = content.sellerLines?.length
    ? `<tr><td style="padding-bottom:24px;font-size:12px;color:#6b6b6b;line-height:1.6">${content.sellerLines
        .map((line) => esc(line))
        .join('<br />')}</td></tr>\n`
    : '';

  // Bulletproof-enough button: an anchor styled as a saffron-gold pill.
  const ctaHtml = content.cta
    ? `<tr><td style="padding-top:20px;padding-bottom:8px"><a href="${esc(content.cta.url)}" style="display:inline-block;background:#F5B800;color:#0A0A0A;font-size:14px;font-weight:500;text-decoration:none;border-radius:100px;padding:12px 24px">${esc(content.cta.label)}</a></td></tr>\n`
    : '';

  const html = `<!doctype html><html dir="${content.dir}"><body style="margin:0;background:#FAFAFA;padding:32px 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:20px;padding:32px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
${logoHtml}${sellerHtml}<tr><td style="font-size:24px;font-weight:500;color:#0A0A0A;padding-bottom:8px">${esc(content.greeting)}</td></tr>
<tr><td style="font-size:16px;color:#3f3f3f;line-height:1.6;padding-bottom:20px">${esc(content.intro)}</td></tr>
<tr><td style="border-top:1px solid rgba(10,10,10,0.08);padding-top:16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table></td></tr>
${ctaHtml}<tr><td style="border-top:1px solid rgba(10,10,10,0.08);padding-top:16px;font-size:14px;color:#3f3f3f;line-height:1.6">${esc(content.closing)}</td></tr>
<tr><td style="padding-top:24px;font-size:12px;color:#9a9a9a">${esc(content.footer)}</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    ...(content.sellerLines?.length ? [...content.sellerLines, ''] : []),
    content.greeting,
    '',
    content.intro,
    '',
    ...content.rows.map((r) => `${r.label}: ${r.value}`),
    '',
    ...(content.cta ? [`${content.cta.label}: ${content.cta.url}`, ''] : []),
    content.closing,
    '',
    content.footer,
  ].join('\n');

  return { html, text };
}
