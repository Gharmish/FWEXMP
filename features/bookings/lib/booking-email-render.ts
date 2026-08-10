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
   * Optional hero photo between the intro and the detail rows — the
   * experience's own image, so the email shows what was booked instead
   * of describing it. Absolute URL; WebP is fine for the mobile-first
   * clients this market uses (clients that can't render it show `alt`).
   */
  heroImage?: { url: string; alt: string };
  /**
   * Optional action button between the rows and the closing — e.g.
   * "View your invoice" or "Open meeting point in Google Maps". Plain-text
   * emails render it as `label: url`.
   */
  cta?: { label: string; url: string };
  /**
   * Optional bulleted list under the CTA — e.g. the reminder's "what to
   * bring". Omitted entirely when absent or empty.
   */
  bullets?: { heading: string; items: readonly string[] };
  /**
   * Optional host line (name + a muted sub-line) so a reminder can show
   * who's hosting without a full profile card.
   */
  host?: { name: string; note?: string };
  /**
   * Optional muted, boxed note just above the closing — e.g. the
   * cancellation window / "manage your booking" line. `html` is trusted
   * markup authored by us (a translated string with a single anchor), NOT
   * user data, so it is emitted verbatim; never pass guest input here.
   */
  note?: { html: string };
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
 * Escape + bidi-isolate a data value. Row values routinely mix scripts
 * (Arabic titles beside `GH-XXXXXX` references, Latin digits beside ص/م)
 * and an un-isolated run lets punctuation jump sides in RTL clients.
 * `dir="auto"` on a span is plain HTML (no CSS), so it survives every
 * client that strips styles.
 */
function escIsolated(value: string): string {
  return `<span dir="auto">${esc(value)}</span>`;
}

/**
 * Render the booking-receipt email. Inline styles only — email clients strip
 * <style>/external CSS. Palette mirrors the brand (white surface,
 * sarat-black text).
 */
export function renderReceiptEmail(content: ReceiptContent): { html: string; text: string } {
  // `text-align` on the value cell mirrors the document direction; the
  // `dir` attribute that establishes that direction sits on the TABLES
  // below, not only on <html> — Gmail/Outlook.com strip <html>/<body>
  // and their attributes, so direction declared only there silently
  // reverts Arabic emails to LTR.
  const valueAlign = content.dir === 'rtl' ? 'left' : 'right';
  const rowsHtml = content.rows
    .map(
      (r) =>
        `<tr><td style="padding:6px 0;color:#686868;font-size:14px">${esc(r.label)}</td>` +
        `<td style="padding:6px 0;text-align:${valueAlign};font-size:14px;color:#0A0A0A">${escIsolated(r.value)}</td></tr>`,
    )
    .join('');

  // The wordmark is an inline (not block) img so its alignment follows
  // the document direction — start-aligned in both LTR and RTL.
  const logoHtml = content.logoUrl
    ? `<tr><td style="padding-bottom:${content.sellerLines?.length ? 8 : 24}px"><img src="${esc(content.logoUrl)}" width="273" height="36" alt="Gharmish — Experiences Marketplace" style="border:0;outline:none" /></td></tr>\n`
    : '';

  // Seller identity (name / CR / region) — small muted lines that make the
  // email a self-contained receipt. Start-aligned in both LTR and RTL.
  const sellerHtml = content.sellerLines?.length
    ? `<tr><td style="padding-bottom:24px;font-size:12px;color:#686868;line-height:1.6">${content.sellerLines
        .map((line) => esc(line))
        .join('<br />')}</td></tr>\n`
    : '';

  // Bulletproof-enough button: an anchor styled as a saffron-gold pill.
  const ctaHtml = content.cta
    ? `<tr><td style="padding-top:20px;padding-bottom:8px"><a href="${esc(content.cta.url)}" style="display:inline-block;background:#F5B800;color:#0A0A0A;font-size:14px;font-weight:500;text-decoration:none;border-radius:100px;padding:12px 24px">${esc(content.cta.label)}</a></td></tr>\n`
    : '';

  // "What to bring"-style list. A dash prefix (not a CSS bullet) keeps the
  // marker on the start side in both LTR and RTL without list styling that
  // email clients render inconsistently.
  const bulletsHtml =
    content.bullets && content.bullets.items.length > 0
      ? `<tr><td style="padding-top:20px"><div style="font-size:13px;font-weight:600;color:#0A0A0A;padding-bottom:8px">${esc(content.bullets.heading)}</div>${content.bullets.items
          .map(
            (item) =>
              `<div style="font-size:14px;color:#4A4A4A;line-height:1.6">— ${esc(item)}</div>`,
          )
          .join('')}</td></tr>\n`
      : '';

  // Host line: name in body colour, optional muted sub-line beneath.
  const hostHtml = content.host
    ? `<tr><td style="padding-top:20px"><div style="font-size:14px;font-weight:500;color:#0A0A0A">${esc(content.host.name)}</div>${content.host.note ? `<div style="font-size:13px;color:#686868">${esc(content.host.note)}</div>` : ''}</td></tr>\n`
    : '';

  // Boxed muted note (e.g. cancellation window). `html` is our own trusted
  // markup — emitted verbatim so a single anchor renders — never guest data.
  // Anchors inside it are restyled from client-default blue to the brand's
  // ink colour (email clients apply their own link colour otherwise).
  const noteInner = content.note
    ? content.note.html.replace(/<a /g, '<a style="color:#0A0A0A;font-weight:500" ')
    : '';
  const noteHtml = content.note
    ? `<tr><td style="padding-top:20px"><div style="background:#FAFAFA;border:1px solid rgba(10,10,10,0.08);border-radius:12px;padding:13px 15px;font-size:13px;color:#4A4A4A;line-height:1.6">${noteInner}</div></td></tr>\n`
    : '';

  const lang = content.dir === 'rtl' ? 'ar' : 'en';
  // Brand faces first (Bricolage Grotesque / IBM Plex Sans Arabic — the
  // app's own fonts, see lib/fonts.ts), then system fallbacks: email
  // clients don't load webfonts, so recipients with the fonts installed
  // get the brand look and everyone else degrades gracefully.
  const fontStack =
    content.dir === 'rtl'
      ? `'IBM Plex Sans Arabic','Segoe UI',Tahoma,Helvetica,Arial,sans-serif`
      : `'Bricolage Grotesque','Segoe UI',-apple-system,Roboto,Helvetica,Arial,sans-serif`;
  // Hidden preheader: inbox list previews show this instead of "Hi {name},".
  const preheader = `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#FAFAFA;font-size:1px;line-height:1px">${esc(content.intro)}</div>`;

  // Hero photo: fixed 16:9 box (the exact aspect hosts crop to) so a
  // slow image load doesn't reflow the receipt.
  const heroHtml = content.heroImage
    ? `<tr><td style="padding-bottom:20px"><img src="${esc(content.heroImage.url)}" alt="${esc(content.heroImage.alt)}" width="416" height="234" style="display:block;width:100%;height:auto;border-radius:16px;border:0;outline:none;object-fit:cover" /></td></tr>\n`
    : '';

  const html = `<!doctype html><html lang="${lang}" dir="${content.dir}"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light only" />
<title>${esc(content.subject)}</title>
</head><body style="margin:0;background:#FAFAFA;padding:32px 0">
${preheader}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="${content.dir}"><tr><td align="center" style="padding:0 12px">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" dir="${content.dir}" style="width:100%;max-width:480px;background:#ffffff;border-radius:20px;padding:32px;font-family:${fontStack};text-align:${content.dir === 'rtl' ? 'right' : 'left'}">
${logoHtml}${sellerHtml}<tr><td style="font-size:24px;font-weight:500;color:#0A0A0A;padding-bottom:8px">${esc(content.greeting)}</td></tr>
<tr><td style="font-size:16px;color:#4A4A4A;line-height:1.6;padding-bottom:20px">${esc(content.intro)}</td></tr>
${heroHtml}
<tr><td style="border-top:1px solid rgba(10,10,10,0.08);padding-top:16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="${content.dir}">${rowsHtml}</table></td></tr>
${ctaHtml}${bulletsHtml}${hostHtml}${noteHtml}<tr><td style="border-top:1px solid rgba(10,10,10,0.08);padding-top:16px;font-size:14px;color:#4A4A4A;line-height:1.6">${esc(content.closing)}</td></tr>
<tr><td style="padding-top:24px;font-size:12px;color:#A3A3A3">${esc(content.footer)}</td></tr>
</table></td></tr></table></body></html>`;

  // Strip tags from the (trusted) note markup for the plain-text part.
  const noteText = content.note ? content.note.html.replace(/<[^>]*>/g, '').trim() : '';

  const text = [
    ...(content.sellerLines?.length ? [...content.sellerLines, ''] : []),
    content.greeting,
    '',
    content.intro,
    '',
    ...content.rows.map((r) => `${r.label}: ${r.value}`),
    '',
    ...(content.cta ? [`${content.cta.label}: ${content.cta.url}`, ''] : []),
    ...(content.bullets && content.bullets.items.length > 0
      ? [content.bullets.heading, ...content.bullets.items.map((i) => `- ${i}`), '']
      : []),
    ...(content.host
      ? [content.host.name, ...(content.host.note ? [content.host.note] : []), '']
      : []),
    ...(noteText ? [noteText, ''] : []),
    content.closing,
    '',
    content.footer,
  ].join('\n');

  return { html, text };
}
