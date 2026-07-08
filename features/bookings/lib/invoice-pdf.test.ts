import { describe, expect, it } from 'vitest';
import { renderInvoicePdf, type InvoicePdfInput } from './invoice-pdf';

/**
 * The renderer's contract: it always produces a valid, non-trivial PDF for
 * both locales (fonts registered, Arabic RTL path exercised). Visual
 * correctness — Arabic shaping, alignment — was verified by eye during
 * development; this guards against regressions that break rendering
 * outright (missing font file, bad style value, @react-pdf upgrade).
 */
const base: Omit<InvoicePdfInput, 'locale' | 'documentTitle' | 'sellerLines'> = {
  sellerName: 'Gharmish | غارميش',
  identityRows: [
    { label: 'CR', value: '7051409212' },
    { label: 'Invoice no.', value: 'GH-QTW3J9' },
    { label: 'Issued', value: '04/06/2026' },
    { label: 'Billed to', value: 'Aziz Al-Asmari' },
  ],
  itemLabel: 'Item',
  itemDescription: 'Juniper forest dawn walk on Jabal Sawda',
  placeName: 'Jabal Sawda',
  itemRows: [
    { label: 'Date', value: '05/06/2026' },
    { label: 'Guests', value: '1' },
    { label: 'Price per guest', value: 'SAR 320' },
  ],
  totalRows: [{ label: 'Total paid', value: 'SAR 320', strong: true }],
  paymentRows: [{ label: 'Paid on', value: '04/06/2026' }],
  qr: null,
};

describe('renderInvoicePdf', () => {
  it('renders a valid PDF for the English receipt', async () => {
    const pdf = await renderInvoicePdf({
      ...base,
      locale: 'en',
      documentTitle: 'Receipt',
      sellerLines: ['Abha, Aseer region, Saudi Arabia'],
    });
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
  }, 30000);

  it('renders a valid PDF for the Arabic (RTL) receipt', async () => {
    const pdf = await renderInvoicePdf({
      ...base,
      locale: 'ar',
      documentTitle: 'إيصال',
      sellerLines: ['أبها، منطقة عسير، المملكة العربية السعودية'],
      identityRows: [
        { label: 'س.ت', value: '7051409212' },
        { label: 'رقم الفاتورة', value: 'GH-QTW3J9' },
      ],
      itemDescription: 'مشية فجر في غابة العرعر على جبل السودة',
    });
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
  }, 30000);
});
