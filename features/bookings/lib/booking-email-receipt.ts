import 'server-only';

import { getTranslations } from 'next-intl/server';
import { escapeHtml } from '@/lib/html';
import type { Locale } from '@/lib/i18n';
import QRCode from 'qrcode';
import { formatDate, formatInteger, formatSAR, formatTime } from '@/lib/format';
import type { EmailAttachment } from '@/lib/email';
import { dispatchNotification, notificationsConfigured } from '@/lib/notifications/dispatch';
import { SELLER_LEGAL_NAME, COMMERCIAL_REGISTRATION } from '@/lib/site';
import { reportError } from '@/lib/log';
import { getBookingByReference } from '@/features/bookings/queries';
import { halalasToSar, vatPortionHalalas, vatRatePercent } from '@/features/bookings/lib/vat';
import { startInstant } from '@/features/bookings/lib/cancellation';
import { zatcaQrPayload } from '@/features/bookings/lib/zatca-qr';
import { renderInvoicePdf, type InvoicePdfRow } from '@/features/bookings/lib/invoice-pdf';
import { getExperienceBySlug } from '@/features/experiences/queries';
import { toArabicText } from '@/features/experiences/lib/arabic-content';
import { renderBookingIcs } from './booking-ics';
import { guestBookingUrls } from './booking-email-links';
import { renderReceiptEmail, type ReceiptRow } from './booking-email-render';
import {
  bidiIsolate,
  guestBookingPath,
  waDate,
  waGuests,
  waMoney,
  waTime,
  whatsappPayload,
} from '@/lib/notifications/whatsapp';
import {
  EMAIL_LOGO_URL,
  emailHero,
  KSA_TIME,
  KSA_DATE,
  KSA_NUMERIC_DATE,
  paymentBrandLabel,
  fullRefundDeadlineFor,
  googleMapsLink,
} from './booking-email-shared';

/**
 * The paid receipt + simplified tax invoice (PDF attachment, ZATCA QR).
 *
 * Split out of booking-email.ts (2026-09 engineering audit ARCH-07: one
 * 2,100-line module with 20 senders). The index module re-exports every
 * sender, so callers and mocks keep importing from booking-email.
 */

/**
 * Send the "payment received / booking confirmed" receipt for a settled
 * booking. Best-effort and fully gated: a no-op when email is unconfigured or
 * the guest has no email on file (phone-only guests). Never throws — the
 * caller (the payment return route) must not fail a paid booking over a
 * receipt.
 *
 * Locale comes from the guest's stored preference, NOT the caller: the
 * payment return route knows only the URL locale, and racing it against
 * the webhook made the receipt's language (and the attached tax
 * invoice's) depend on which path won.
 */
export async function sendBookingReceiptEmail(reference: string): Promise<void> {
  if (!notificationsConfigured()) return;

  const booking = await getBookingByReference(reference);
  if (!booking?.paidAt) return;
  const locale = booking.guestPreferredLanguage;
  // `paidAt` alone is not enough (2026-07-28 eighth audit). The
  // cancel-during-3DS path stamps `paid` + `paidAt`, immediately
  // auto-refunds, and still returns 'success' — so every caller sent
  // "Payment received, your booking is confirmed" WITH the ZATCA tax
  // invoice PDF attached, minutes after the guest's cancellation email,
  // for money that had already been given back. Issuing a tax document
  // for a reversed capture is a regulatory problem, not just a UX one.
  if (booking.status === 'cancelled' || booking.status === 'refunded') return;
  if (!booking.guestEmail && !booking.guestPhone) return;

  const experience = booking.experienceSlug
    ? await getExperienceBySlug(booking.experienceSlug)
    : undefined;
  // Prefer the immutable settlement snapshot; fall back to the live title
  // for rows settled before the snapshot columns existed (mirrors the
  // on-site invoice page).
  const snapshotTitle = locale === 'ar' ? booking.invoiceItemAr : booking.invoiceItemEn;
  const liveTitle = experience ? (locale === 'ar' ? experience.titleAr : experience.titleEn) : null;
  const title = snapshotTitle ?? liveTitle;
  const placeName = experience
    ? locale === 'ar'
      ? toArabicText(experience.placeName)
      : experience.placeName
    : null;

  const t = await getTranslations({ locale, namespace: 'bookingEmail' });
  const ti = await getTranslations({ locale, namespace: 'invoice' });
  const startsAt = startInstant(booking.date, booking.startTime);
  const paidAt = new Date(booking.paidAt);

  // VAT renders ONLY from the per-booking snapshot stamped at settlement —
  // a receipt from before the platform's ZATCA registration never mentions
  // VAT, no matter what the toggle says today.
  const vat =
    booking.vatRateBps && booking.vatRegistrationNumber
      ? { rateBps: booking.vatRateBps, number: booking.vatRegistrationNumber }
      : null;
  const vatSar = vat ? halalasToSar(vatPortionHalalas(booking.totalAmountSar, vat.rateBps)) : 0;
  const taxableSar = booking.totalAmountSar - vatSar;
  // Exact-only unit price, matching the invoice page (2026-08-01 ninth
  // audit): a rounded unit made qty × unit ≠ total on non-divisible
  // totals — omitted rather than fudged on a tax document.
  const unitSar =
    booking.totalAmountSar % booking.partySize === 0
      ? booking.totalAmountSar / booking.partySize
      : null;
  const billedName = booking.billedName ?? booking.guestName;
  const brandLabel = paymentBrandLabel(booking.paymentBrand, locale);
  const documentTitle = vat ? ti('taxInvoiceTitle') : ti('receiptTitle');
  const sellerLines = [ti('sellerRegion'), `${ti('crLabel')} ${COMMERCIAL_REGISTRATION}`];

  // --- Email body: a complete receipt, not just a summary. ------------
  const rows: ReceiptRow[] = [
    { label: ti('invoiceNumberLabel'), value: booking.referenceCode },
    { label: ti('issueDateLabel'), value: formatDate(paidAt, locale, 'gregory', KSA_DATE) },
    { label: ti('billedToLabel'), value: billedName },
  ];
  if (vat) rows.push({ label: ti('vatNumberLabel'), value: vat.number });
  if (title) rows.push({ label: t('experienceLabel'), value: title });
  if (placeName) rows.push({ label: t('placeLabel'), value: placeName });
  rows.push({ label: t('dateLabel'), value: formatDate(startsAt, locale, 'gregory', KSA_DATE) });
  rows.push({ label: t('timeLabel'), value: formatTime(startsAt, locale, KSA_TIME) });
  rows.push({ label: t('partyLabel'), value: formatInteger(booking.partySize, locale) });
  if (unitSar !== null) {
    rows.push({ label: ti('unitPriceLabel'), value: formatSAR(unitSar, locale) });
  }
  if (vat) {
    rows.push({ label: ti('taxableLabel'), value: formatSAR(taxableSar, locale) });
    rows.push({
      label: ti('vatLabel', { pct: vatRatePercent(vat.rateBps) }),
      value: formatSAR(vatSar, locale),
    });
    rows.push({ label: ti('totalInclVatLabel'), value: formatSAR(booking.totalAmountSar, locale) });
  } else {
    rows.push({ label: ti('totalPaidLabel'), value: formatSAR(booking.totalAmountSar, locale) });
  }
  if (brandLabel) rows.push({ label: ti('paymentMethodLabel'), value: brandLabel });
  rows.push({ label: ti('paidOnLabel'), value: formatDate(paidAt, locale, 'gregory', KSA_DATE) });

  // --- Invoice PDF attachment: the keepable document, delivered inline. -
  // Built only when there's an email to attach it to — phone-only guests
  // get the WhatsApp confirmation with the invoice-page link instead.
  const pdfAttachments = !booking.guestEmail
    ? []
    : await buildInvoicePdfAttachment({
        booking,
        locale,
        documentTitle,
        title,
        placeName,
        startsAt,
        paidAt,
        vat,
        vatSar,
        taxableSar,
        unitSar,
        billedName,
        brandLabel,
        ti,
        t,
      });
  // Whether the PDF specifically made it in — the .ics below also lands
  // in `attachments`, so gating the "your receipt is attached as a PDF"
  // copy on the combined list claimed a tax document was attached when
  // only the calendar file was (PDF render failed; 2026-08-01 ninth
  // audit).
  const hasInvoicePdf = pdfAttachments.length > 0;
  const attachments = [...pdfAttachments];

  // Tokened URLs, never bare — the email opens in cookieless browsers
  // (see booking-email-links.ts; 2026-08-28 P0-1).
  const { invoice: invoiceUrl, manage: manageUrl } = guestBookingUrls(
    locale,
    reference,
    booking.experienceSlug,
  );
  const mapUrl = experience ? googleMapsLink(experience.lat, experience.lng) : null;

  // Calendar event alongside the PDF — a date-bound booking the guest
  // would otherwise hand-copy into their calendar. Same email-only gate.
  if (booking.guestEmail) {
    const ics = renderBookingIcs({
      uid: `${booking.referenceCode}@gharmish.com`,
      start: startsAt,
      durationMinutes: experience?.durationMinutes ?? 180,
      summary: title ?? t('genericExperience'),
      location: placeName,
      description: [
        `${t('referenceLabel')}: ${booking.referenceCode}`,
        manageUrl,
        ...(mapUrl ? [mapUrl] : []),
      ].join('\n'),
    });
    attachments.push({
      filename: `Gharmish-${booking.referenceCode}.ics`,
      content: Buffer.from(ics, 'utf8').toString('base64'),
      contentType: 'text/calendar',
    });
  }

  // Manage-booking note with the full-refund deadline while it's still
  // ahead (grace-aware — a late booking's grace can outlive the tier
  // deadline) — the confirmation previously promised "we'll send the
  // meeting point before the day" and offered no way to cancel or manage.
  const deadline = fullRefundDeadlineFor(booking);
  const note = deadline
    ? {
        // `t.markup`, not `t()`: the message carries an <a> tag, and a tag
        // with an attribute is not ICU — plain t() threw INVALID_MESSAGE and
        // the email shipped the raw key instead of the link (2026-07-15 →
        // 2026-09-13, seen on /pay/return in the production runtime logs).
        html: t.markup('reminderManageWithDeadline', {
          deadline: `${formatDate(deadline, locale, 'gregory', KSA_DATE)}, ${formatTime(deadline, locale, KSA_TIME)}`,
          a: (chunks) => `<a href="${escapeHtml(manageUrl)}">${chunks}</a>`,
        }),
      }
    : {
        html: t.markup('reminderManageNoDeadline', {
          a: (chunks) => `<a href="${escapeHtml(manageUrl)}">${chunks}</a>`,
        }),
      };

  const subject = t('subject', { reference: bidiIsolate(booking.referenceCode) });
  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    sellerLines,
    subject,
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('greeting', { name: booking.guestName }),
    intro: hasInvoicePdf ? t('introWithPdf') : t('intro'),
    heroImage: emailHero(experience, title),
    rows,
    cta: { label: t('viewInvoice'), url: invoiceUrl },
    note,
    closing: t('closing'),
    footer: t('footer'),
  });

  await dispatchNotification({
    type: 'booking_confirmed',
    dedupeKey: `booking_confirmed:${booking.referenceCode}`,
    bookingId: booking.id,
    recipient: {
      kind: 'guest',
      email: booking.guestEmail,
      phone: booking.guestPhone,
      locale,
    },
    email: { subject, html, text, attachments },
    // v3 template (button → booking page); falls back to the approved v2
    // body until Meta approves the new one (lib/notifications/whatsapp).
    whatsapp: whatsappPayload(
      'guest_booking_confirmed',
      locale,
      {
        experienceName: title ?? t('genericExperience'),
        date: waDate(startsAt, locale),
        time: waTime(startsAt, locale),
        guests: waGuests(booking.partySize, locale),
        bookingPath: guestBookingPath(locale, reference),
        // legacy slots
        guestName: booking.guestName,
        reference: bidiIsolate(booking.referenceCode),
        invoiceUrl,
        amount: waMoney(booking.totalAmountSar, locale),
      },
      { reference: booking.referenceCode },
    ),
  });
}

interface InvoicePdfAttachmentArgs {
  booking: NonNullable<Awaited<ReturnType<typeof getBookingByReference>>>;
  locale: Locale;
  documentTitle: string;
  title: string | null;
  placeName: string | null;
  startsAt: Date;
  paidAt: Date;
  vat: { rateBps: number; number: string } | null;
  vatSar: number;
  taxableSar: number;
  unitSar: number | null;
  billedName: string;
  brandLabel: string | null;
  ti: Awaited<ReturnType<typeof getTranslations<'invoice'>>>;
  t: Awaited<ReturnType<typeof getTranslations<'bookingEmail'>>>;
}

/**
 * Build the invoice PDF and return it as a one-element attachments array
 * ready for the dispatcher's email payload. Best-effort: PDF rendering must
 * never break a receipt, so any failure logs and yields no attachment —
 * the email still goes out with the full details in its body.
 */
async function buildInvoicePdfAttachment(
  args: InvoicePdfAttachmentArgs,
): Promise<EmailAttachment[]> {
  const { booking, locale, vat, ti, t } = args;
  try {
    // Dates/times in the PDF are pure-Latin to avoid mixed-script shaping
    // corruption (see invoice-pdf.tsx). Time uses the English 12-hour form
    // ("9:00 AM") for the same reason — an Arabic ص/م beside Latin digits
    // would mix scripts.
    const numericDate = (d: Date) => formatDate(d, 'en', 'gregory', KSA_NUMERIC_DATE);
    const latinTime = (d: Date) => formatTime(d, 'en', KSA_TIME);

    // The CR is a two-cell row (Arabic label | Latin number), not a stacked
    // seller line — a single run mixing "س.ت" with Latin digits corrupts the
    // Arabic shaping.
    const identityRows: InvoicePdfRow[] = [
      { label: ti('crLabel'), value: COMMERCIAL_REGISTRATION },
      { label: ti('invoiceNumberLabel'), value: booking.referenceCode },
      { label: ti('issueDateLabel'), value: numericDate(args.paidAt) },
      { label: ti('billedToLabel'), value: args.billedName },
    ];
    if (vat) identityRows.push({ label: ti('vatNumberLabel'), value: vat.number });

    const itemRows: InvoicePdfRow[] = [
      { label: t('dateLabel'), value: numericDate(args.startsAt) },
      { label: t('timeLabel'), value: latinTime(args.startsAt) },
      { label: t('partyLabel'), value: formatInteger(booking.partySize, locale) },
      ...(args.unitSar !== null
        ? [{ label: ti('unitPriceLabel'), value: formatSAR(args.unitSar, locale) }]
        : []),
    ];

    const totalRows: InvoicePdfRow[] = vat
      ? [
          { label: ti('taxableLabel'), value: formatSAR(args.taxableSar, locale) },
          {
            label: ti('vatLabel', { pct: vatRatePercent(vat.rateBps) }),
            value: formatSAR(args.vatSar, locale),
          },
          {
            label: ti('totalInclVatLabel'),
            value: formatSAR(booking.totalAmountSar, locale),
            strong: true,
          },
        ]
      : [
          {
            label: ti('totalPaidLabel'),
            value: formatSAR(booking.totalAmountSar, locale),
            strong: true,
          },
        ];

    const paymentRows: InvoicePdfRow[] = [];
    if (args.brandLabel) {
      paymentRows.push({ label: ti('paymentMethodLabel'), value: args.brandLabel });
    }
    paymentRows.push({ label: ti('paidOnLabel'), value: numericDate(args.paidAt) });

    // ZATCA QR only on a tax invoice (post VAT-registration).
    const qr = vat
      ? {
          dataUrl: await QRCode.toDataURL(
            zatcaQrPayload({
              sellerName: SELLER_LEGAL_NAME,
              vatNumber: vat.number,
              timestamp: args.paidAt,
              totalSar: booking.totalAmountSar,
              vatSar: args.vatSar,
            }),
            { margin: 1, width: 240, errorCorrectionLevel: 'M' },
          ),
          caption: ti('qrCaption'),
        }
      : null;

    const pdf = await renderInvoicePdf({
      locale,
      documentTitle: args.documentTitle,
      sellerName: SELLER_LEGAL_NAME,
      // CR moves to an identity row above; the header carries only the
      // pure-script region line.
      sellerLines: [ti('sellerRegion')],
      identityRows,
      itemLabel: ti('itemLabel'),
      itemDescription: args.title ?? booking.referenceCode,
      placeName: args.placeName,
      itemRows,
      totalRows,
      paymentRows,
      qr,
    });

    return [
      {
        filename: `Gharmish-${booking.referenceCode}.pdf`,
        content: pdf.toString('base64'),
        contentType: 'application/pdf',
      },
    ];
  } catch (error) {
    reportError(error, { surface: 'invoice-pdf', reference: booking.referenceCode });
    return [];
  }
}
