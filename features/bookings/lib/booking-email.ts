import 'server-only';

import { eq } from 'drizzle-orm';
import { getTranslations } from 'next-intl/server';
import { db } from '@/lib/db';
import { hasEmail, hasHyperpay } from '@/lib/env';
import type { Locale } from '@/lib/i18n';
import QRCode from 'qrcode';
import { formatDate, formatInteger, formatSAR, formatTime } from '@/lib/format';
import { sendEmail, type EmailAttachment } from '@/lib/email';
import { SITE_URL, SELLER_LEGAL_NAME, COMMERCIAL_REGISTRATION } from '@/lib/site';
import { reportError } from '@/lib/log';
import { hostApplications } from '@/db/schema';
import { getBookingByReference } from '@/features/bookings/queries';
import { vatPortionSar, vatRatePercent } from '@/features/bookings/lib/vat';
import { startInstant, freeCancellationDeadline } from '@/features/bookings/lib/cancellation';
import { getPlatformSettings } from '@/lib/platform-settings';
import { splitCommission } from '@/features/bookings/lib/commission';
import { zatcaQrPayload } from '@/features/bookings/lib/zatca-qr';
import { renderInvoicePdf, type InvoicePdfRow } from '@/features/bookings/lib/invoice-pdf';
import { getExperienceBySlug } from '@/features/experiences/queries';
import { toArabicText } from '@/features/experiences/lib/arabic-content';
import { renderReceiptEmail, type ReceiptRow } from './booking-email-render';

/** Brand wordmark for email headers — PNG (clients don't render SVG). */
const EMAIL_LOGO_URL = `${SITE_URL}/images/gharmish-wordmark.png`;

/**
 * Email dates/times ALWAYS render in KSA wall-clock time, explicitly
 * (2026-07 audit M7). Before this, `new Date('YYYY-MM-DDTHH:mm:00')`
 * parsed in the server zone and formatted in the server zone — correct
 * on UTC Vercel only because the two cancelled out, and one "helpful"
 * tz added to a formatter would have shifted every receipt 3h. Parsing
 * now pins +03:00 via `startInstant` and formatting pins Asia/Riyadh.
 * (This also fixed a real bug: deadline dates formatted in server UTC
 * showed the previous DAY for deadlines before 3am KSA.)
 */
const KSA_TIME: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Riyadh' };
const KSA_DATE: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Riyadh',
};

/**
 * Numeric `dd/MM/yyyy`, always Latin. The PDF renderer can't mix an Arabic
 * month name with Latin digits in one run without corrupting the shaping
 * (see invoice-pdf.tsx), so PDF dates use this locale-independent form.
 */
const KSA_NUMERIC_DATE: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Asia/Riyadh',
};

/** Card-scheme label, kept single-script so it's safe in the Arabic PDF. */
function paymentBrandLabel(brand: string | null, locale: Locale): string | null {
  if (!brand) return null;
  if (brand === 'MADA') return locale === 'ar' ? 'مدى' : 'mada';
  if (brand === 'VISA') return 'Visa';
  if (brand === 'MASTER') return 'Mastercard';
  return brand;
}

/**
 * Send the "payment received / booking confirmed" receipt for a settled
 * booking. Best-effort and fully gated: a no-op when email is unconfigured or
 * the guest has no email on file (phone-only guests). Never throws — the
 * caller (the payment return route) must not fail a paid booking over a
 * receipt.
 */
export async function sendBookingReceiptEmail(reference: string, locale: Locale): Promise<void> {
  if (!hasEmail()) return;

  const booking = await getBookingByReference(reference);
  if (!booking?.guestEmail || !booking.paidAt) return;

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
  const vatSar = vat ? vatPortionSar(booking.totalAmountSar, vat.rateBps) : 0;
  const taxableSar = booking.totalAmountSar - vatSar;
  const unitSar = Math.round(booking.totalAmountSar / booking.partySize);
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
  rows.push({ label: ti('unitPriceLabel'), value: formatSAR(unitSar, locale) });
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
  const attachments = await buildInvoicePdfAttachment({
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

  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    sellerLines,
    subject: t('subject'),
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('greeting', { name: booking.guestName }),
    intro: attachments.length > 0 ? t('introWithPdf') : t('intro'),
    rows,
    cta: {
      label: t('viewInvoice'),
      url: `${SITE_URL}/${locale}/book/confirmed/${reference}/invoice`,
    },
    closing: t('closing'),
    footer: t('footer'),
  });

  await sendEmail({ to: booking.guestEmail, subject: t('subject'), html, text, attachments });
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
  unitSar: number;
  billedName: string;
  brandLabel: string | null;
  ti: Awaited<ReturnType<typeof getTranslations<'invoice'>>>;
  t: Awaited<ReturnType<typeof getTranslations<'bookingEmail'>>>;
}

/**
 * Build the invoice PDF and return it as a one-element attachments array
 * ready for `sendEmail`. Best-effort: PDF rendering (fonts, layout) must
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
      { label: ti('unitPriceLabel'), value: formatSAR(args.unitSar, locale) },
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

/**
 * Send the cancellation notice after a booking is called off. `refund`
 * mirrors the cancel action's outcome: `refunded` (gateway refund
 * issued), `refund_pending` (we owe it, transfer is manual),
 * `forfeited` (inside the window, payment kept), `none` (nothing was
 * paid). `cancelledBy` selects the framing: `guest` ("you cancelled")
 * vs `operator` (host/admin called it off — always refunded in full
 * when paid, never forfeited). Same best-effort posture as the receipt:
 * gated, never throws upward.
 */
export async function sendBookingCancellationEmail(
  reference: string,
  locale: Locale,
  refund: 'none' | 'refunded' | 'refund_pending' | 'forfeited',
  options?: { cancelledBy?: 'guest' | 'operator' },
): Promise<void> {
  if (!hasEmail()) return;

  const booking = await getBookingByReference(reference);
  if (!booking?.guestEmail) return;

  const experience = booking.experienceSlug
    ? await getExperienceBySlug(booking.experienceSlug)
    : undefined;
  const title = experience ? (locale === 'ar' ? experience.titleAr : experience.titleEn) : null;

  const t = await getTranslations({ locale, namespace: 'bookingEmail' });
  const startsAt = startInstant(booking.date, booking.startTime);

  const rows: ReceiptRow[] = [];
  if (title) rows.push({ label: t('experienceLabel'), value: title });
  rows.push({ label: t('dateLabel'), value: formatDate(startsAt, locale, 'gregory', KSA_DATE) });
  rows.push({ label: t('timeLabel'), value: formatTime(startsAt, locale, KSA_TIME) });
  if (refund === 'refunded' || refund === 'refund_pending') {
    rows.push({ label: t('refundLabel'), value: formatSAR(booking.totalAmountSar, locale) });
  }
  rows.push({ label: t('referenceLabel'), value: booking.referenceCode });

  const byOperator = options?.cancelledBy === 'operator';
  const intro =
    refund === 'refunded'
      ? t(byOperator ? 'cancelByHostIntroRefunded' : 'cancelIntroRefunded')
      : refund === 'refund_pending'
        ? t(byOperator ? 'cancelByHostIntroRefundPending' : 'cancelIntroRefundPending')
        : refund === 'forfeited'
          ? t('cancelIntroForfeited')
          : t(byOperator ? 'cancelByHostIntroUnpaid' : 'cancelIntroUnpaid');

  // Refunded (or refund-owed) payments get a link to the invoice page,
  // which carries the credit note for VAT-stamped bookings and the
  // refunded receipt otherwise. Forfeited/unpaid cancellations have no
  // money document to show.
  const showDocument = refund === 'refunded' || refund === 'refund_pending';
  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject: t('cancelSubject'),
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('greeting', { name: booking.guestName }),
    intro,
    rows,
    cta: showDocument
      ? {
          label: booking.vatRateBps ? t('viewCreditNote') : t('viewReceipt'),
          url: `${SITE_URL}/${locale}/book/confirmed/${reference}/invoice`,
        }
      : undefined,
    closing: t('cancelClosing'),
    footer: t('footer'),
  });

  await sendEmail({ to: booking.guestEmail, subject: t('cancelSubject'), html, text });
}

/** Google Maps deep link to a coordinate — the guest-facing meeting point. */
function googleMapsLink(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

interface ReminderData {
  booking: NonNullable<Awaited<ReturnType<typeof getBookingByReference>>>;
  /** Narrowed non-null guest email (the gather returns null otherwise). */
  guestEmail: string;
  experience: NonNullable<Awaited<ReturnType<typeof getExperienceBySlug>>> | undefined;
  title: string | null;
  placeName: string | null;
  startsAt: Date;
  /** Google Maps link for the meeting point, or null when the listing is gone. */
  mapUrl: string | null;
  /** Localized "what to bring", falling back to the English list. */
  bringList: readonly string[];
}

/**
 * Shared gather for both reminder emails: resolves the booking, its
 * experience, and the locale-specific meeting point / map link / bring
 * list. Returns null when the send should be skipped (no email on file).
 */
async function reminderData(reference: string, locale: Locale): Promise<ReminderData | null> {
  const booking = await getBookingByReference(reference);
  if (!booking?.guestEmail) return null;
  // Re-read guards against the gap between the cron's SELECT and this send:
  // only remind a booking that is still confirmed. A booking cancelled,
  // rescheduled to a new reference, or otherwise moved out of `confirmed`
  // in that window must never receive a reminder describing a stale state.
  if (booking.status !== 'confirmed') return null;

  const experience = booking.experienceSlug
    ? await getExperienceBySlug(booking.experienceSlug)
    : undefined;
  const title = experience ? (locale === 'ar' ? experience.titleAr : experience.titleEn) : null;
  const placeName = experience
    ? locale === 'ar'
      ? toArabicText(experience.placeName)
      : experience.placeName
    : null;
  const mapUrl = experience ? googleMapsLink(experience.lat, experience.lng) : null;
  const bringList =
    locale === 'ar' && experience?.whatToBringAr.length
      ? experience.whatToBringAr
      : (experience?.whatToBring ?? []);

  return {
    booking,
    guestEmail: booking.guestEmail,
    experience,
    title,
    placeName,
    startsAt: startInstant(booking.date, booking.startTime),
    mapUrl,
    bringList,
  };
}

/**
 * "Get ready" reminder (~24h before). Prep-focused: the essentials, the
 * meeting point as a Google Maps button, what to bring, the host, and —
 * only while it's still valid — the free-cancellation deadline. Same
 * best-effort posture as the receipt; the cron stamps `reminderSentAt`
 * after a successful send so re-runs never double-send.
 */
export async function sendBookingPrepareReminderEmail(
  reference: string,
  locale: Locale,
): Promise<void> {
  if (!hasEmail()) return;

  const data = await reminderData(reference, locale);
  if (!data) return;
  const { booking, guestEmail, title, placeName, startsAt, mapUrl, bringList } = data;

  const t = await getTranslations({ locale, namespace: 'bookingEmail' });
  const time = formatTime(startsAt, locale, KSA_TIME);

  const rows: ReceiptRow[] = [];
  if (title) rows.push({ label: t('experienceLabel'), value: title });
  if (placeName) rows.push({ label: t('meetingPointLabel'), value: placeName });
  rows.push({ label: t('dateLabel'), value: formatDate(startsAt, locale, 'gregory', KSA_DATE) });
  rows.push({ label: t('timeLabel'), value: time });
  rows.push({ label: t('partyLabel'), value: formatInteger(booking.partySize, locale) });
  rows.push({ label: t('referenceLabel'), value: booking.referenceCode });

  // Free-cancellation line — shown only when the deadline is still ahead
  // (with a 48h window it's usually already passed by the 24h mark, so we
  // fall back to a plain "manage your booking" link).
  const { cancellationWindowHours } = await getPlatformSettings();
  const deadline = freeCancellationDeadline(
    booking.date,
    booking.startTime,
    cancellationWindowHours,
  );
  const manageUrl = `${SITE_URL}/${locale}/book/confirmed/${reference}`;
  const note =
    Date.now() < deadline.getTime()
      ? {
          html: t('reminderManageWithDeadline', {
            deadline: `${formatDate(deadline, locale, 'gregory', KSA_DATE)}, ${formatTime(deadline, locale, KSA_TIME)}`,
            url: manageUrl,
          }),
        }
      : { html: t('reminderManageNoDeadline', { url: manageUrl }) };

  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject: t('prepareSubject', { time }),
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('greeting', { name: booking.guestName }),
    intro: t('prepareIntro'),
    rows,
    cta: mapUrl ? { label: t('openMap'), url: mapUrl } : undefined,
    bullets:
      bringList.length > 0 ? { heading: t('whatToBringHeading'), items: bringList } : undefined,
    host: data.experience
      ? { name: data.experience.hostName, note: t('hostReminderNote') }
      : undefined,
    note,
    closing: t('prepareClosing'),
    footer: t('footer'),
  });

  await sendEmail({ to: guestEmail, subject: t('prepareSubject', { time }), html, text });
}

/**
 * "See you soon" reminder (~3h before, day-of). A lean doorway email: the
 * meeting point up top as a Google Maps button, the time (arrive early),
 * and the host. Reply-to is the contact channel until messaging/SMS lands.
 * The cron stamps `finalReminderSentAt` after a successful send.
 */
export async function sendBookingDepartureReminderEmail(
  reference: string,
  locale: Locale,
): Promise<void> {
  if (!hasEmail()) return;

  const data = await reminderData(reference, locale);
  if (!data) return;
  const { booking, guestEmail, placeName, startsAt, mapUrl } = data;

  const t = await getTranslations({ locale, namespace: 'bookingEmail' });
  const time = formatTime(startsAt, locale, KSA_TIME);

  const rows: ReceiptRow[] = [];
  if (placeName) rows.push({ label: t('meetingPointLabel'), value: placeName });
  rows.push({ label: t('timeLabel'), value: `${time} — ${t('arriveEarly')}` });
  rows.push({ label: t('partyLabel'), value: formatInteger(booking.partySize, locale) });
  rows.push({ label: t('referenceLabel'), value: booking.referenceCode });

  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject: t('departureSubject', { time }),
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('greeting', { name: booking.guestName }),
    intro: t('departureIntro'),
    rows,
    cta: mapUrl ? { label: t('openMap'), url: mapUrl } : undefined,
    host: data.experience
      ? { name: data.experience.hostName, note: t('hostReminderNote') }
      : undefined,
    closing: t('departureClosing'),
    footer: t('footer'),
  });

  await sendEmail({ to: guestEmail, subject: t('departureSubject', { time }), html, text });
}

/**
 * Standard detail rows (experience / date / time / party / reference)
 * shared by the request-lifecycle emails below. Locale-resolved titles.
 */
async function lifecycleRows(
  booking: NonNullable<Awaited<ReturnType<typeof getBookingByReference>>>,
  locale: Locale,
  t: Awaited<ReturnType<typeof getTranslations<'bookingEmail'>>>,
): Promise<ReceiptRow[]> {
  const experience = booking.experienceSlug
    ? await getExperienceBySlug(booking.experienceSlug)
    : undefined;
  const title = experience ? (locale === 'ar' ? experience.titleAr : experience.titleEn) : null;
  const startsAt = startInstant(booking.date, booking.startTime);
  const rows: ReceiptRow[] = [];
  if (title) rows.push({ label: t('experienceLabel'), value: title });
  rows.push({ label: t('dateLabel'), value: formatDate(startsAt, locale, 'gregory', KSA_DATE) });
  rows.push({ label: t('timeLabel'), value: formatTime(startsAt, locale, KSA_TIME) });
  rows.push({ label: t('partyLabel'), value: formatInteger(booking.partySize, locale) });
  rows.push({ label: t('referenceLabel'), value: booking.referenceCode });
  return rows;
}

/**
 * Acknowledge a guest's booking request (request-to-book only): "the host
 * has X hours to confirm; you won't be charged until then." No-ops for
 * instant bookings (their ack is the payment receipt) and for guests
 * without an email on file. Best-effort like every sender here.
 */
export async function sendBookingRequestReceivedEmail(
  reference: string,
  locale: Locale,
): Promise<void> {
  if (!hasEmail()) return;
  const booking = await getBookingByReference(reference);
  if (!booking?.guestEmail || booking.status !== 'pending') return;

  const t = await getTranslations({ locale, namespace: 'bookingEmail' });
  const rows = await lifecycleRows(booking, locale, t);
  if (booking.approvalDeadline) {
    rows.push({
      label: t('approvalDeadlineLabel'),
      value: formatDate(new Date(booking.approvalDeadline), locale),
    });
  }

  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject: t('requestReceivedSubject'),
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('greeting', { name: booking.guestName }),
    intro: t('requestReceivedIntro'),
    rows,
    closing: t('requestReceivedClosing'),
    footer: t('footer'),
  });
  await sendEmail({ to: booking.guestEmail, subject: t('requestReceivedSubject'), html, text });
}

/**
 * The host approved a request. Pay-after-approval: when online payment is
 * configured the email carries the payment link and the window deadline;
 * when payment is off the booking is simply confirmed. Locale follows the
 * guest's preferred language (the action caller may be the host/admin).
 */
export async function sendBookingApprovedEmail(reference: string): Promise<void> {
  if (!hasEmail()) return;
  const booking = await getBookingByReference(reference);
  if (!booking?.guestEmail || booking.status !== 'confirmed') return;

  const locale = booking.guestPreferredLanguage;
  const t = await getTranslations({ locale, namespace: 'bookingEmail' });
  const rows = await lifecycleRows(booking, locale, t);
  rows.push({ label: t('totalLabel'), value: formatSAR(booking.totalAmountSar, locale) });

  const needsPayment =
    hasHyperpay() && booking.paymentStatus !== 'paid' && booking.paymentDeadline !== null;
  const payUrl = `${SITE_URL}/${locale}/book/${reference}/pay?slug=${encodeURIComponent(booking.experienceSlug)}`;
  if (needsPayment && booking.paymentDeadline) {
    rows.push({
      label: t('paymentDeadlineLabel'),
      value: formatDate(new Date(booking.paymentDeadline), locale),
    });
  }

  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject: t('approvedSubject'),
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('greeting', { name: booking.guestName }),
    intro: needsPayment ? t('approvedPayIntro', { url: payUrl }) : t('approvedIntro'),
    rows,
    closing: needsPayment ? t('approvedPayClosing') : t('approvedClosing'),
    footer: t('footer'),
  });
  await sendEmail({ to: booking.guestEmail, subject: t('approvedSubject'), html, text });
}

/** The host declined the request. Nothing was ever charged. */
export async function sendBookingDeclinedEmail(reference: string): Promise<void> {
  if (!hasEmail()) return;
  const booking = await getBookingByReference(reference);
  if (!booking?.guestEmail || booking.status !== 'declined') return;

  const locale = booking.guestPreferredLanguage;
  const t = await getTranslations({ locale, namespace: 'bookingEmail' });
  const rows = await lifecycleRows(booking, locale, t);

  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject: t('declinedSubject'),
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('greeting', { name: booking.guestName }),
    intro: t('declinedIntro'),
    rows,
    closing: t('declinedClosing'),
    footer: t('footer'),
  });
  await sendEmail({ to: booking.guestEmail, subject: t('declinedSubject'), html, text });
}

/** The approval window lapsed with no host decision. Nothing was charged. */
export async function sendBookingExpiredEmail(reference: string): Promise<void> {
  if (!hasEmail()) return;
  const booking = await getBookingByReference(reference);
  if (!booking?.guestEmail || booking.status !== 'expired') return;

  const locale = booking.guestPreferredLanguage;
  const t = await getTranslations({ locale, namespace: 'bookingEmail' });
  const rows = await lifecycleRows(booking, locale, t);

  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject: t('expiredSubject'),
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('greeting', { name: booking.guestName }),
    intro: t('expiredIntro'),
    rows,
    closing: t('expiredClosing'),
    footer: t('footer'),
  });
  await sendEmail({ to: booking.guestEmail, subject: t('expiredSubject'), html, text });
}

/**
 * An unpaid hold lapsed and the cron released the spot — either an
 * approved request the guest never paid for, or an abandoned instant
 * booking. Nothing was charged.
 */
export async function sendBookingPaymentLapsedEmail(reference: string): Promise<void> {
  if (!hasEmail()) return;
  const booking = await getBookingByReference(reference);
  if (!booking?.guestEmail || booking.status !== 'cancelled') return;

  const locale = booking.guestPreferredLanguage;
  const t = await getTranslations({ locale, namespace: 'bookingEmail' });
  const rows = await lifecycleRows(booking, locale, t);

  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject: t('paymentLapsedSubject'),
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('greeting', { name: booking.guestName }),
    intro: t('paymentLapsedIntro'),
    rows,
    closing: t('paymentLapsedClosing'),
    footer: t('footer'),
  });
  await sendEmail({ to: booking.guestEmail, subject: t('paymentLapsedSubject'), html, text });
}

interface HostEmailContext {
  email: string;
  locale: Locale;
  title: string;
}

/**
 * Resolve the notification contact for the host of an experience.
 * Prefers `hosts.contact_email` (copied from the application at
 * approval) and falls back to the application row for hosts approved
 * before that column existed. Seeded demo hosts have neither, so the
 * host senders below no-op for them.
 */
async function hostEmailContext(experienceSlug: string): Promise<HostEmailContext | null> {
  // The public ExperienceSummary deliberately omits commission and host
  // id, so read the row (with its host) straight from the DB.
  const experience = await db.query.experiences.findFirst({
    where: (e) => eq(e.slug, experienceSlug),
    columns: { titleEn: true, titleAr: true },
    with: { host: { columns: { id: true, languages: true, contactEmail: true } } },
  });
  if (!experience) return null;

  let email = experience.host.contactEmail;
  if (!email) {
    const application = await db.query.hostApplications.findFirst({
      where: eq(hostApplications.hostId, experience.host.id),
      columns: { contactEmail: true },
    });
    email = application?.contactEmail ?? null;
  }
  if (!email) return null;

  const locale: Locale = experience.host.languages[0] === 'en' ? 'en' : 'ar';
  return {
    email,
    locale,
    title: locale === 'ar' ? experience.titleAr : experience.titleEn,
  };
}

/** Standard host-facing rows: experience / date / time / party. */
function hostRows(
  booking: NonNullable<Awaited<ReturnType<typeof getBookingByReference>>>,
  host: HostEmailContext,
  t: Awaited<ReturnType<typeof getTranslations<'bookingEmail'>>>,
): ReceiptRow[] {
  const startsAt = startInstant(booking.date, booking.startTime);
  return [
    { label: t('experienceLabel'), value: host.title },
    { label: t('dateLabel'), value: formatDate(startsAt, host.locale) },
    { label: t('timeLabel'), value: formatTime(startsAt, host.locale) },
    { label: t('partyLabel'), value: formatInteger(booking.partySize, host.locale) },
  ];
}

/**
 * "You have a new booking" notice to the host. Locale follows the
 * host's first listed language (Arabic-first default).
 */
export async function sendHostNewBookingEmail(reference: string): Promise<void> {
  if (!hasEmail()) return;

  const booking = await getBookingByReference(reference);
  if (!booking?.experienceSlug) return;
  const host = await hostEmailContext(booking.experienceSlug);
  if (!host) return;

  const t = await getTranslations({ locale: host.locale, namespace: 'bookingEmail' });
  // Snapshots on the booking — matches earnings/payouts to the riyal
  // (commission on the ex-VAT net once a VAT rate is stamped).
  const { payoutSar } = splitCommission(
    booking.totalAmountSar,
    booking.commissionBps,
    booking.vatRateBps,
  );

  const rows = hostRows(booking, host, t);
  rows.push({ label: t('hostNewPayoutLabel'), value: formatSAR(payoutSar, host.locale) });

  const isRequest = booking.status === 'pending';
  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject: isRequest ? t('hostNewRequestSubject') : t('hostNewBookingSubject'),
    dir: host.locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('hostNewGreeting'),
    intro: isRequest
      ? t('hostNewRequestIntro', { url: `${SITE_URL}/${host.locale}/host/bookings` })
      : t('hostNewBookingIntro', { url: `${SITE_URL}/${host.locale}/host/bookings` }),
    rows,
    closing: t('hostNewClosing'),
    footer: t('footer'),
  });

  await sendEmail({
    to: host.email,
    subject: isRequest ? t('hostNewRequestSubject') : t('hostNewBookingSubject'),
    html,
    text,
  });
}

/**
 * The guest cancelled — tell the host their date has the spots back.
 * Sent for pending and confirmed bookings alike; best-effort, gated.
 */
export async function sendHostGuestCancelledEmail(reference: string): Promise<void> {
  if (!hasEmail()) return;

  const booking = await getBookingByReference(reference);
  if (!booking?.experienceSlug) return;
  const host = await hostEmailContext(booking.experienceSlug);
  if (!host) return;

  const t = await getTranslations({ locale: host.locale, namespace: 'bookingEmail' });
  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject: t('hostGuestCancelledSubject'),
    dir: host.locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('hostNewGreeting'),
    intro: t('hostGuestCancelledIntro', { url: `${SITE_URL}/${host.locale}/host/bookings` }),
    rows: hostRows(booking, host, t),
    closing: t('hostNewClosing'),
    footer: t('footer'),
  });
  await sendEmail({ to: host.email, subject: t('hostGuestCancelledSubject'), html, text });
}

/**
 * An unpaid hold lapsed and the cron released it — the booking the host
 * was told about evaporated. Without this, the host's picture of their
 * date silently diverges from reality.
 */
export async function sendHostHoldLapsedEmail(reference: string): Promise<void> {
  if (!hasEmail()) return;

  const booking = await getBookingByReference(reference);
  if (!booking?.experienceSlug) return;
  const host = await hostEmailContext(booking.experienceSlug);
  if (!host) return;

  const t = await getTranslations({ locale: host.locale, namespace: 'bookingEmail' });
  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject: t('hostHoldLapsedSubject'),
    dir: host.locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('hostNewGreeting'),
    intro: t('hostHoldLapsedIntro'),
    rows: hostRows(booking, host, t),
    closing: t('hostNewClosing'),
    footer: t('footer'),
  });
  await sendEmail({ to: host.email, subject: t('hostHoldLapsedSubject'), html, text });
}

/**
 * The guest's payment settled — the booking is fully secured. Closes
 * the gap where the host heard about a booking at creation (possibly
 * pre-payment) and then nothing again.
 */
export async function sendHostPaymentReceivedEmail(reference: string): Promise<void> {
  if (!hasEmail()) return;

  const booking = await getBookingByReference(reference);
  if (!booking?.experienceSlug) return;
  const host = await hostEmailContext(booking.experienceSlug);
  if (!host) return;

  const t = await getTranslations({ locale: host.locale, namespace: 'bookingEmail' });
  // Snapshots on the booking — matches earnings/payouts to the riyal
  // (commission on the ex-VAT net once a VAT rate is stamped).
  const { payoutSar } = splitCommission(
    booking.totalAmountSar,
    booking.commissionBps,
    booking.vatRateBps,
  );

  const rows = hostRows(booking, host, t);
  rows.push({ label: t('hostNewPayoutLabel'), value: formatSAR(payoutSar, host.locale) });

  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject: t('hostPaymentReceivedSubject'),
    dir: host.locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('hostNewGreeting'),
    intro: t('hostPaymentReceivedIntro'),
    rows,
    closing: t('hostNewClosing'),
    footer: t('footer'),
  });
  await sendEmail({ to: host.email, subject: t('hostPaymentReceivedSubject'), html, text });
}
