import 'server-only';

import fs from 'node:fs';
import path from 'node:path';
import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer';
import type { Locale } from '@/lib/i18n';

/**
 * Server-side invoice/receipt PDF, attached to the guest's confirmation
 * email so the document arrives directly (not only behind an owner-gated
 * link). Mirrors the on-site invoice page's fields.
 *
 * Arabic shaping caveat: @react-pdf shapes pure-Arabic and pure-Latin runs
 * correctly, but a text run mixing the two corrupts (letter reordering,
 * dropped glyphs). So every value here is either pure Arabic (name, title,
 * payment brand, region) or pure Latin (reference, CR, amounts, dates).
 * Dates are numeric `dd/MM/yyyy` — an Arabic month name beside Latin digits
 * would mix scripts. This is a PDF-only formatting choice; BRIEF §4 allows
 * Gregorian `DD/MM/YYYY`.
 */

const FONT_DIR = path.join(process.cwd(), 'lib/og/fonts');

// Registered once per process. @react-pdf keeps a module-level registry, so
// repeated registration of the same family is cheap/idempotent.
Font.register({
  family: 'PlexArabic',
  fonts: [
    { src: path.join(FONT_DIR, 'plex-arabic-regular.ttf') },
    { src: path.join(FONT_DIR, 'plex-arabic-semibold.ttf'), fontWeight: 600 },
  ],
});
Font.register({
  family: 'Bricolage',
  fonts: [
    { src: path.join(FONT_DIR, 'bricolage-regular.ttf') },
    { src: path.join(FONT_DIR, 'bricolage-semibold.ttf'), fontWeight: 600 },
  ],
});
// Never hyphenate/break a word mid-glyph (matters for Arabic joining).
Font.registerHyphenationCallback((word) => [word]);

/**
 * Brand lockup (black-on-transparent PNG, 1093×144) embedded as a data
 * URI so the header carries the real logo, not a text fallback. Read once,
 * lazily and defensively — a missing/unreadable asset must never break PDF
 * generation, so we fall back to the "Gharmish" wordmark text.
 */
const WORDMARK_ASPECT = 1093 / 144;
let wordmarkDataUri: string | null | undefined;
function loadWordmark(): string | null {
  if (wordmarkDataUri !== undefined) return wordmarkDataUri;
  try {
    const bytes = fs.readFileSync(path.join(process.cwd(), 'public/images/gharmish-email-logo.png'));
    wordmarkDataUri = `data:image/png;base64,${bytes.toString('base64')}`;
  } catch {
    wordmarkDataUri = null;
  }
  return wordmarkDataUri;
}

const INK = '#0A0A0A';
// Palette ramp stops (lib/colors.ts sarat-black-600 / -100) — @react-pdf
// can't read CSS variables, so the hex is inlined but must stay on-ramp.
const MUTED = '#686868';
const HAIRLINE = '#E8E8E8';

export interface InvoicePdfRow {
  label: string;
  /** Pre-formatted, single-script value (see the shaping caveat above). */
  value: string;
  /** Larger, bolder emphasis for total lines. */
  strong?: boolean;
}

export interface InvoicePdfInput {
  locale: Locale;
  /** "Receipt" or "Simplified tax invoice". */
  documentTitle: string;
  sellerName: string;
  sellerLines: readonly string[];
  /** Identity rows: invoice no., issue date, billed-to, VAT no. (if any). */
  identityRows: readonly InvoicePdfRow[];
  /** Line-item heading + detail rows (qty, unit price). */
  itemLabel: string;
  itemDescription: string;
  placeName?: string | null;
  itemRows: readonly InvoicePdfRow[];
  /** Totals: single "Total paid" or taxable / VAT / total-incl. */
  totalRows: readonly InvoicePdfRow[];
  /** Payment method + paid-on rows. */
  paymentRows: readonly InvoicePdfRow[];
  /** ZATCA QR (data URL) + caption — tax-invoice mode only. */
  qr?: { dataUrl: string; caption: string } | null;
  /** Refund banner text, when the booking was refunded. */
  refundedNote?: string | null;
}

const styles = StyleSheet.create({
  page: { paddingVertical: 48, paddingHorizontal: 48, fontSize: 11, color: INK },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  brand: { fontSize: 22, fontWeight: 600 },
  sellerLine: { fontSize: 10, color: MUTED, marginTop: 2 },
  docTitle: { fontSize: 20, fontWeight: 600 },
  section: { marginTop: 24, borderTopWidth: 0.75, borderTopColor: HAIRLINE, paddingTop: 16 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  label: { fontSize: 11, color: MUTED },
  value: { fontSize: 11, fontWeight: 600 },
  valueStrong: { fontSize: 15, fontWeight: 600 },
  itemTitle: { fontSize: 12, fontWeight: 600, maxWidth: 320 },
  refund: { marginTop: 12, fontSize: 11, color: '#C8312A' },
  qrWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    borderTopWidth: 0.75,
    borderTopColor: HAIRLINE,
    paddingTop: 16,
  },
  qrCaption: { fontSize: 10, color: MUTED, maxWidth: 260, lineHeight: 1.5 },
});

export async function renderInvoicePdf(input: InvoicePdfInput): Promise<Buffer> {
  const rtl = input.locale === 'ar';
  const fontFamily = rtl ? 'PlexArabic' : 'Bricolage';
  // In RTL the label sits at the start (right) and the value at the end
  // (left); flip the row's main axis so the label reads first.
  const rowDir: 'row' | 'row-reverse' = rtl ? 'row-reverse' : 'row';
  const startAlign: 'left' | 'right' = rtl ? 'right' : 'left';
  // Cross-axis alignment for stacked (column) blocks — the reading start
  // (upper-left in LTR / upper-right in RTL) and its mirror, the end.
  const crossStart: 'flex-start' | 'flex-end' = rtl ? 'flex-end' : 'flex-start';
  const crossEnd: 'flex-start' | 'flex-end' = rtl ? 'flex-start' : 'flex-end';
  const wordmark = loadWordmark();

  const Row = ({ row, muted }: { row: InvoicePdfRow; muted?: boolean }) => (
    <View style={[styles.row, { flexDirection: rowDir }]} wrap={false}>
      <Text style={row.strong ? styles.valueStrong : styles.value}>{row.value}</Text>
      <Text style={muted ? styles.label : styles.value}>{row.label}</Text>
    </View>
  );

  const doc = (
    <Document>
      <Page size="A4" style={[styles.page, { fontFamily, direction: rtl ? 'rtl' : 'ltr' }]}>
        <View style={[styles.header, { flexDirection: rowDir }]}>
          {/* Brand logo at the reading start (upper-left in LTR) + seller lines. */}
          <View style={{ alignItems: crossStart }}>
            {wordmark ? (
              // eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf Image is a PDF primitive with no alt prop; the brand name is in the seller lines and QR caption below.
              <Image
                src={wordmark}
                style={{ width: 180, height: 180 / WORDMARK_ASPECT, marginBottom: 8 }}
              />
            ) : (
              <Text style={[styles.brand, { marginBottom: 4 }]}>Gharmish</Text>
            )}
            {input.sellerLines.map((line, i) => (
              <Text key={i} style={[styles.sellerLine, { textAlign: startAlign }]}>
                {line}
              </Text>
            ))}
          </View>
          {/* Document type at the reading end (upper-right in LTR). */}
          <View style={{ alignItems: crossEnd }}>
            <Text style={styles.docTitle}>{input.documentTitle}</Text>
          </View>
        </View>

        <View style={styles.section}>
          {input.identityRows.map((row, i) => (
            <Row key={i} row={row} muted />
          ))}
        </View>

        <View style={styles.section}>
          <View style={{ alignItems: crossStart, marginBottom: 8 }}>
            <Text style={styles.label}>{input.itemLabel}</Text>
            <Text style={[styles.itemTitle, { textAlign: startAlign, marginTop: 2 }]}>
              {input.itemDescription}
            </Text>
            {input.placeName ? <Text style={styles.label}>{input.placeName}</Text> : null}
          </View>
          {input.itemRows.map((row, i) => (
            <Row key={i} row={row} muted />
          ))}
        </View>

        <View style={styles.section}>
          {input.totalRows.map((row, i) => (
            <Row key={i} row={row} muted={!row.strong} />
          ))}
          {input.paymentRows.map((row, i) => (
            <Row key={`p${i}`} row={row} muted />
          ))}
          {input.refundedNote ? (
            <Text style={[styles.refund, { textAlign: startAlign }]}>{input.refundedNote}</Text>
          ) : null}
        </View>

        {input.qr ? (
          <View style={[styles.qrWrap, { flexDirection: rowDir }]}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf Image is a PDF primitive, not a DOM <img>; it has no alt prop. The caption beside it describes the QR. */}
            <Image src={input.qr.dataUrl} style={{ width: 96, height: 96 }} />
            <Text style={[styles.qrCaption, { marginHorizontal: 16 }]}>{input.qr.caption}</Text>
          </View>
        ) : null}
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
