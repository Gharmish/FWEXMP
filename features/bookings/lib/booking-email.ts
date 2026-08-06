import 'server-only';

import { eq } from 'drizzle-orm';
import { getTranslations } from 'next-intl/server';
import { db } from '@/lib/db';
import { hasHyperpay } from '@/lib/env';
import type { Locale } from '@/lib/i18n';
import QRCode from 'qrcode';
import { formatDate, formatInteger, formatSAR, formatTime } from '@/lib/format';
import type { EmailAttachment } from '@/lib/email';
import { dispatchNotification, notificationsConfigured } from '@/lib/notifications/dispatch';
import { SITE_URL, SELLER_LEGAL_NAME, COMMERCIAL_REGISTRATION } from '@/lib/site';
import { reportError } from '@/lib/log';
import { hostApplications } from '@/db/schema';
import { getBookingByReference } from '@/features/bookings/queries';
import { vatPortionSar, vatRatePercent } from '@/features/bookings/lib/vat';
import { startInstant } from '@/features/bookings/lib/cancellation';
import { bookingOptions } from '@/features/bookings/lib/policy';
import { splitCommission } from '@/features/bookings/lib/commission';
import { zatcaQrPayload } from '@/features/bookings/lib/zatca-qr';
import { renderInvoicePdf, type InvoicePdfRow } from '@/features/bookings/lib/invoice-pdf';
import { getExperienceBySlug } from '@/features/experiences/queries';
import { toArabicText } from '@/features/experiences/lib/arabic-content';
import { renderBookingIcs } from './booking-ics';
import { renderReceiptEmail, type ReceiptRow } from './booking-email-render';

/**
 * Bidi-isolate a strongly-LTR TOKEN (`GH-XXXXXX` reference) bound for
 * an Arabic WhatsApp template body. FSI…PDI (U+2068/U+2069) stops
 * adjacent Arabic punctuation from reordering around the run; invisible
 * and harmless in LTR bodies, so applied unconditionally.
 *
 * NEVER wrap a URL variable (2026-08-01 ninth audit): an invisible
 * U+2068 abutting `https://` defeats WhatsApp's linkifier on some
 * clients, rendering the link as plain untappable text — and the
 * invoice-link variable is the phone-only guest's ONLY path to their
 * tax document. URLs stand on their own template lines; a slightly
 * reordered bracket next to a link is cosmetic, a dead link is not.
 */
function bidiIsolate(value: string): string {
  return `\u2068${value}\u2069`;
}

/** Brand wordmark for email headers — PNG (clients don't render SVG). */
const EMAIL_LOGO_URL = `${SITE_URL}/images/gharmish-wordmark.png`;

/**
 * The experience's branded OG card (1200×630 PNG, localized, RTL-aware)
 * — the WhatsApp media header. PNG because WhatsApp rejects the WebP
 * the hero photos are stored as; the card is generated server-side for
 * every live listing, so it exists whenever the slug does.
 */
function ogCardUrl(slug: string, locale: Locale): string {
  // The `.png`-suffixed alias of /opengraph-image — Twilio validates
  // media URLs by extension (see app/[locale]/experiences/[slug]/card.png).
  return `${SITE_URL}/${locale}/experiences/${slug}/card.png`;
}

/** Email hero block from an experience's photo, when it has one. */
function emailHero(
  experience: { heroImage: string | null } | undefined,
  alt: string | null,
): { url: string; alt: string } | undefined {
  return experience?.heroImage ? { url: experience.heroImage, alt: alt ?? 'Gharmish' } : undefined;
}

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
 * The instant until which cancelling this booking still refunds in full
 * — from the same `bookingOptions()` the pages and server actions run,
 * so it is grace-aware and reschedule-anchored, unlike the retired
 * `freeCancellationDeadline` helper. Null once that moment has passed
 * (or the booking can no longer be cancelled): emails only ever
 * advertise a deadline while it is still ahead.
 */
function fullRefundDeadlineFor(
  booking: NonNullable<Awaited<ReturnType<typeof getBookingByReference>>>,
  now = new Date(),
): Date | null {
  const { cancel } = bookingOptions({
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    dateStr: booking.date,
    startTime: booking.startTime,
    createdAt: new Date(booking.createdAt),
    totalAmountSar: booking.totalAmountSar + booking.walletAppliedSar,
    snapshot: booking.policy,
    rescheduleCount: booking.rescheduleCount,
    rescheduledFromDate: booking.rescheduledFromDate,
    now,
  });
  if (!cancel.allowed) return null;
  if (cancel.refund !== 'full' && cancel.refund !== 'none_needed') return null;
  return now.getTime() <= cancel.fullRefundUntil.getTime() ? cancel.fullRefundUntil : null;
}

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
  const vatSar = vat ? vatPortionSar(booking.totalAmountSar, vat.rateBps) : 0;
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

  const invoiceUrl = `${SITE_URL}/${locale}/book/confirmed/${reference}/invoice`;
  const manageUrl = `${SITE_URL}/${locale}/book/confirmed/${reference}`;
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
        html: t('reminderManageWithDeadline', {
          deadline: `${formatDate(deadline, locale, 'gregory', KSA_DATE)}, ${formatTime(deadline, locale, KSA_TIME)}`,
          url: manageUrl,
        }),
      }
    : { html: t('reminderManageNoDeadline', { url: manageUrl }) };

  const subject = t('subject', { reference: booking.referenceCode });
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
    whatsapp: {
      // Image-header variant (the experience's branded card) with the
      // plain template as automatic fallback until its SID is approved
      // — and forever for bookings whose listing is gone.
      template: booking.experienceSlug ? 'booking_confirmed_media' : 'booking_confirmed',
      fallbackTemplate: 'booking_confirmed',
      variables: {
        '1': booking.guestName,
        '2': title ?? t('genericExperience'),
        '3': formatDate(startsAt, locale, 'gregory', KSA_DATE),
        '4': formatTime(startsAt, locale, KSA_TIME),
        '5': bidiIsolate(booking.referenceCode),
        // Vars 6–7 are ignored by the live v1 template and light up with
        // the v2 body (invoice link + amount) once Meta approves it —
        // they close the phone-only guest's path to their tax document.
        '6': invoiceUrl,
        '7': formatSAR(booking.totalAmountSar, locale),
        // Var 8 is the media header URL (used only by the _media template).
        ...(booking.experienceSlug ? { '8': ogCardUrl(booking.experienceSlug, locale) } : {}),
      },
    },
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

/**
 * Send the cancellation notice after a booking is called off. `refund`
 * mirrors the cancel action's outcome: `refunded` (gateway refund
 * issued), `refund_pending` (we owe it, transfer is manual),
 * `wallet_credited` (emergency cancellation — the full payment landed
 * as Gharmish Credit), `forfeited` (inside the window, payment kept),
 * `none` (nothing was paid). `cancelledBy` selects the framing: `guest`
 * ("you cancelled") vs `operator` (host/admin called it off — always
 * refunded in full when paid, never forfeited). Same best-effort
 * posture as the receipt: gated, never throws upward.
 */
export async function sendBookingCancellationEmail(
  reference: string,
  refund: 'none' | 'refunded' | 'refund_pending' | 'wallet_credited' | 'forfeited',
  options?: {
    cancelledBy?: 'guest' | 'operator';
    /**
     * Amount actually refunded (or queued) — pass it for partial
     * policy refunds; defaults to the full charge when omitted.
     */
    refundAmountSar?: number;
  },
): Promise<void> {
  if (!notificationsConfigured()) return;

  const booking = await getBookingByReference(reference);
  if (!booking) return;
  if (!booking.guestEmail && !booking.guestPhone) return;
  // Stored preference, not the caller's context — admin cancellations
  // used to inherit the OPERATOR's UI locale.
  const locale = booking.guestPreferredLanguage;

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
  // The amount originally paid, so a partial refund is verifiable
  // against it at a glance.
  if (booking.paidAt) {
    // The FULL paid base — card charge plus any redeemed Gharmish Credit
    // (2026-08-01 ninth audit). `totalAmountSar` is the card leg alone,
    // so a wallet-assisted booking told the guest they had paid less
    // than they did, directly above a refund line for the larger real
    // amount.
    const paidBaseSar = booking.totalAmountSar + booking.walletAppliedSar;
    rows.push({ label: t('totalLabel'), value: formatSAR(paidBaseSar, locale) });
  }
  if (refund === 'refunded' || refund === 'refund_pending' || refund === 'wallet_credited') {
    rows.push({
      label: t(refund === 'wallet_credited' ? 'walletCreditLabel' : 'refundLabel'),
      value: formatSAR(options?.refundAmountSar ?? booking.totalAmountSar, locale),
    });
  }
  rows.push({ label: t('referenceLabel'), value: booking.referenceCode });

  const byOperator = options?.cancelledBy === 'operator';
  const intro =
    refund === 'refunded'
      ? t(byOperator ? 'cancelByHostIntroRefunded' : 'cancelIntroRefunded')
      : refund === 'refund_pending'
        ? t(byOperator ? 'cancelByHostIntroRefundPending' : 'cancelIntroRefundPending')
        : refund === 'wallet_credited'
          ? t('cancelIntroWalletCredited')
          : refund === 'forfeited'
            ? t('cancelIntroForfeited')
            : t(byOperator ? 'cancelByHostIntroUnpaid' : 'cancelIntroUnpaid');

  // Refunded (or refund-owed) payments get a link to the invoice page,
  // which carries the credit note for VAT-stamped bookings and the
  // refunded receipt otherwise. Wallet credits link to the booking page
  // instead — that's where the guest chooses "spend it" vs "back to my
  // card". Forfeited/unpaid cancellations have no money document.
  const showDocument = refund === 'refunded' || refund === 'refund_pending';
  const walletCta =
    refund === 'wallet_credited'
      ? {
          label: t('viewWalletCredit'),
          url: `${SITE_URL}/${locale}/book/confirmed/${reference}`,
        }
      : undefined;
  const cancelSubject = t('cancelSubject', { reference: booking.referenceCode });
  const cancelCtaUrl = showDocument
    ? `${SITE_URL}/${locale}/book/confirmed/${reference}/invoice`
    : (walletCta?.url ?? `${SITE_URL}/${locale}/book/confirmed/${reference}`);
  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject: cancelSubject,
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('greeting', { name: booking.guestName }),
    intro,
    rows,
    cta: showDocument
      ? {
          label: booking.vatRateBps ? t('viewCreditNote') : t('viewReceipt'),
          url: cancelCtaUrl,
        }
      : walletCta,
    closing: t('cancelClosing'),
    footer: t('footer'),
  });

  // Short refund-outcome line for the WhatsApp body (var 6 of the v2
  // template) — the email's five intros compressed to one clause each,
  // so a phone-only guest still learns what happened to their money.
  const waOutcome =
    refund === 'refunded'
      ? t('waCancelRefunded')
      : refund === 'refund_pending'
        ? t('waCancelRefundPending')
        : refund === 'wallet_credited'
          ? t('waCancelWalletCredited')
          : refund === 'forfeited'
            ? t('waCancelForfeited')
            : t('waCancelUnpaid');

  await dispatchNotification({
    type: 'booking_cancelled',
    // Scoped by refund VERDICT, not just the booking (2026-07-28 third
    // audit). A booking is legitimately notified twice with different
    // news: first "cancelled, payment forfeited", then — after an admin
    // settles it from /admin/bookings, a state that action explicitly
    // accepts — "cancelled, refunded". Keyed on the reference alone the
    // second notice hit the first's `sent` ledger row and was dropped,
    // so money moved, the guest was never told, no credit note reached
    // them, and the ledger read as a healthy success.
    dedupeKey: `booking_cancelled:${booking.referenceCode}:${refund}`,
    bookingId: booking.id,
    recipient: {
      kind: 'guest',
      email: booking.guestEmail,
      phone: booking.guestPhone,
      locale,
    },
    email: { subject: cancelSubject, html, text },
    whatsapp: {
      template: 'booking_cancelled',
      variables: {
        '1': booking.guestName,
        '2': title ?? t('genericExperience'),
        '3': formatDate(startsAt, locale, 'gregory', KSA_DATE),
        '4': formatTime(startsAt, locale, KSA_TIME),
        '5': bidiIsolate(booking.referenceCode),
        // Vars 6–7 are inert on the live v1 template; the v2 body adds
        // the refund outcome and a link to the document/booking page.
        '6': waOutcome,
        '7': cancelCtaUrl,
      },
    },
  });
}

/**
 * The guest moved their booking to a new date. Sent AFTER the row was
 * updated, so the standard detail rows carry the NEW date/time; the old
 * date arrives as a parameter for the "moved from" line. Payment is
 * untouched by a reschedule, so no money rows appear.
 */
export async function sendBookingRescheduledEmail(
  reference: string,
  oldDate: string,
): Promise<void> {
  if (!notificationsConfigured()) return;
  const booking = await getBookingByReference(reference);
  if (!booking) return;
  if (!booking.guestEmail && !booking.guestPhone) return;
  const locale = booking.guestPreferredLanguage;

  const t = await getTranslations({ locale, namespace: 'bookingEmail' });
  const details = await lifecycleDetails(booking, locale, t);
  const movedFrom = startInstant(oldDate, booking.startTime);
  const rows = [
    { label: t('movedFromLabel'), value: formatDate(movedFrom, locale, 'gregory', KSA_DATE) },
    ...details.rows,
  ];

  const bookingUrl = `${SITE_URL}/${locale}/book/confirmed/${reference}`;
  const subject = t('rescheduledSubject', { reference: booking.referenceCode });
  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject,
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('greeting', { name: booking.guestName }),
    intro: t('rescheduledIntro'),
    heroImage: details.hero,
    rows,
    cta: { label: t('rescheduledCta'), url: bookingUrl },
    closing: t('rescheduledClosing'),
    footer: t('footer'),
  });
  await dispatchNotification({
    type: 'booking_rescheduled',
    // Scoped by the new date so a future policy allowing several moves
    // still notifies each one.
    dedupeKey: `booking_rescheduled:${booking.referenceCode}:${booking.date}`,
    bookingId: booking.id,
    recipient: {
      kind: 'guest',
      email: booking.guestEmail,
      phone: booking.guestPhone,
      locale,
    },
    email: { subject, html, text },
    whatsapp: {
      template: 'booking_rescheduled',
      variables: {
        ...guestLifecycleVariables(booking, details, locale, t('genericExperience')),
        // Var 6 (booking page) for the template body — this key has no
        // approved template yet, so the whole payload waits on its SID.
        '6': bookingUrl,
      },
    },
  });
}

/** Google Maps deep link to a coordinate — the guest-facing meeting point. */
function googleMapsLink(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

interface ReminderData {
  booking: NonNullable<Awaited<ReturnType<typeof getBookingByReference>>>;
  /** Guest email; null for phone-only guests (WhatsApp covers them). */
  guestEmail: string | null;
  /** Guest E.164 phone; null for email-only guests. */
  guestPhone: string | null;
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
 * Shared gather for both reminders: resolves the booking, its
 * experience, and the locale-specific meeting point / map link / bring
 * list. Returns null when the send should be skipped (no email and no
 * phone on file — nothing is addressable).
 */
async function reminderData(reference: string, locale: Locale): Promise<ReminderData | null> {
  const booking = await getBookingByReference(reference);
  if (!booking) return null;
  if (!booking.guestEmail && !booking.guestPhone) return null;
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
    guestPhone: booking.guestPhone,
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
  if (!notificationsConfigured()) return;

  const data = await reminderData(reference, locale);
  if (!data) return;
  const { booking, guestEmail, guestPhone, title, placeName, startsAt, mapUrl, bringList } = data;

  const t = await getTranslations({ locale, namespace: 'bookingEmail' });
  const time = formatTime(startsAt, locale, KSA_TIME);

  const rows: ReceiptRow[] = [];
  if (title) rows.push({ label: t('experienceLabel'), value: title });
  if (placeName) rows.push({ label: t('meetingPointLabel'), value: placeName });
  rows.push({ label: t('dateLabel'), value: formatDate(startsAt, locale, 'gregory', KSA_DATE) });
  rows.push({ label: t('timeLabel'), value: time });
  rows.push({ label: t('partyLabel'), value: formatInteger(booking.partySize, locale) });
  rows.push({ label: t('referenceLabel'), value: booking.referenceCode });

  // Full-refund line — shown only while a full refund is still on the
  // table per `bookingOptions()` (on most tiers it has lapsed by the 24h
  // mark, so we fall back to a plain "manage your booking" link). The
  // rule comes from the booking's own policy snapshot plus the platform
  // grace, never the live platform settings.
  const deadline = fullRefundDeadlineFor(booking);
  const manageUrl = `${SITE_URL}/${locale}/book/confirmed/${reference}`;
  const note = deadline
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
    heroImage: emailHero(data.experience, title),
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

  await dispatchNotification({
    type: 'booking_reminder_24h',
    // Scoped by date: a rescheduled booking resets its reminder flags and
    // must be remindable again for the NEW date — same reference, new key.
    dedupeKey: `booking_reminder_24h:${booking.referenceCode}:${booking.date}`,
    bookingId: booking.id,
    recipient: { kind: 'guest', email: guestEmail, phone: guestPhone, locale },
    email: { subject: t('prepareSubject', { time }), html, text },
    whatsapp: {
      template: booking.experienceSlug ? 'booking_reminder_24h_media' : 'booking_reminder_24h',
      fallbackTemplate: 'booking_reminder_24h',
      variables: {
        '1': booking.guestName,
        '2': title ?? t('genericExperience'),
        '3': formatDate(startsAt, locale, 'gregory', KSA_DATE),
        '4': time,
        // Never a reference code posing as a meeting point — fall back
        // to the booking page where the real details live.
        '5': placeName ?? title ?? t('genericExperience'),
        '6': mapUrl ?? manageUrl,
        // Var 7 is the media header URL (used only by the _media template).
        ...(booking.experienceSlug ? { '7': ogCardUrl(booking.experienceSlug, locale) } : {}),
      },
    },
  });
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
  if (!notificationsConfigured()) return;

  const data = await reminderData(reference, locale);
  if (!data) return;
  const { booking, guestEmail, guestPhone, title, placeName, startsAt, mapUrl } = data;

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
    heroImage: emailHero(data.experience, title),
    rows,
    cta: mapUrl ? { label: t('openMap'), url: mapUrl } : undefined,
    host: data.experience
      ? { name: data.experience.hostName, note: t('hostReminderNote') }
      : undefined,
    closing: t('departureClosing'),
    footer: t('footer'),
  });

  await dispatchNotification({
    type: 'booking_reminder_3h',
    dedupeKey: `booking_reminder_3h:${booking.referenceCode}:${booking.date}`,
    bookingId: booking.id,
    recipient: { kind: 'guest', email: guestEmail, phone: guestPhone, locale },
    email: { subject: t('departureSubject', { time }), html, text },
    whatsapp: {
      template: 'booking_reminder_3h',
      variables: {
        '1': booking.guestName,
        '2': placeName ?? title ?? t('genericExperience'),
        '3': time,
        '4': mapUrl ?? `${SITE_URL}/${locale}/book/confirmed/${reference}`,
      },
    },
  });
}

interface LifecycleDetails {
  rows: ReceiptRow[];
  /** Locale-resolved experience title; null when the listing is gone. */
  title: string | null;
  startsAt: Date;
  /** Hero photo block for the email, when the listing still has one. */
  hero: { url: string; alt: string } | undefined;
}

/**
 * Standard detail rows (experience / date / time / party / reference)
 * shared by the request-lifecycle senders below, plus the resolved
 * title/start the WhatsApp template variables reuse.
 */
async function lifecycleDetails(
  booking: NonNullable<Awaited<ReturnType<typeof getBookingByReference>>>,
  locale: Locale,
  t: Awaited<ReturnType<typeof getTranslations<'bookingEmail'>>>,
): Promise<LifecycleDetails> {
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
  return { rows, title, startsAt, hero: emailHero(experience, title) };
}

/** Shared shorthand for the guest-side WhatsApp variable block. */
function guestLifecycleVariables(
  booking: NonNullable<Awaited<ReturnType<typeof getBookingByReference>>>,
  details: LifecycleDetails,
  locale: Locale,
  /** Localized "your experience" — never a reference code masquerading as a title. */
  fallbackTitle: string,
): Record<string, string> {
  return {
    '1': booking.guestName,
    '2': details.title ?? fallbackTitle,
    '3': formatDate(details.startsAt, locale, 'gregory', KSA_DATE),
    '4': formatTime(details.startsAt, locale, KSA_TIME),
    '5': bidiIsolate(booking.referenceCode),
  };
}

/**
 * Acknowledge a guest's booking request (request-to-book only): "the host
 * has X hours to confirm; you won't be charged until then." No-ops for
 * instant bookings (their ack is the payment receipt) and for guests
 * without an email on file. Best-effort like every sender here.
 */
export async function sendBookingRequestReceivedEmail(reference: string): Promise<void> {
  if (!notificationsConfigured()) return;
  const booking = await getBookingByReference(reference);
  if (!booking || booking.status !== 'pending') return;
  if (!booking.guestEmail && !booking.guestPhone) return;
  const locale = booking.guestPreferredLanguage;

  const t = await getTranslations({ locale, namespace: 'bookingEmail' });
  const details = await lifecycleDetails(booking, locale, t);
  const rows = details.rows;
  if (booking.approvalDeadline) {
    // Date AND time — the deadline expires at a wall-clock moment, and a
    // bare date reads as "end of that day".
    const d = new Date(booking.approvalDeadline);
    rows.push({
      label: t('approvalDeadlineLabel'),
      value: `${formatDate(d, locale, 'gregory', KSA_DATE)}, ${formatTime(d, locale, KSA_TIME)}`,
    });
  }

  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject: t('requestReceivedSubject'),
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('greeting', { name: booking.guestName }),
    intro: t('requestReceivedIntro'),
    heroImage: details.hero,
    rows,
    closing: t('requestReceivedClosing'),
    footer: t('footer'),
  });
  await dispatchNotification({
    type: 'booking_request_received',
    dedupeKey: `booking_request_received:${booking.referenceCode}`,
    bookingId: booking.id,
    recipient: {
      kind: 'guest',
      email: booking.guestEmail,
      phone: booking.guestPhone,
      locale,
    },
    email: { subject: t('requestReceivedSubject'), html, text },
    whatsapp: {
      template: 'booking_request_received',
      variables: guestLifecycleVariables(booking, details, locale, t('genericExperience')),
    },
  });
}

/**
 * The host approved a request. Pay-after-approval: when online payment is
 * configured the email carries the payment link and the window deadline;
 * when payment is off the booking is simply confirmed. Locale follows the
 * guest's preferred language (the action caller may be the host/admin).
 */
export async function sendBookingApprovedEmail(reference: string): Promise<void> {
  if (!notificationsConfigured()) return;
  const booking = await getBookingByReference(reference);
  if (!booking || booking.status !== 'confirmed') return;
  if (!booking.guestEmail && !booking.guestPhone) return;

  const locale = booking.guestPreferredLanguage;
  const t = await getTranslations({ locale, namespace: 'bookingEmail' });
  const details = await lifecycleDetails(booking, locale, t);
  const rows = details.rows;
  rows.push({ label: t('totalLabel'), value: formatSAR(booking.totalAmountSar, locale) });

  const needsPayment =
    hasHyperpay() && booking.paymentStatus !== 'paid' && booking.paymentDeadline !== null;
  const payUrl = `${SITE_URL}/${locale}/book/${reference}/pay?slug=${encodeURIComponent(booking.experienceSlug)}`;
  if (needsPayment && booking.paymentDeadline) {
    // Date AND time — the spot is released at a wall-clock moment.
    const d = new Date(booking.paymentDeadline);
    rows.push({
      label: t('paymentDeadlineLabel'),
      value: `${formatDate(d, locale, 'gregory', KSA_DATE)}, ${formatTime(d, locale, KSA_TIME)}`,
    });
  }

  const approvedSubject = t('approvedSubject', { reference: booking.referenceCode });
  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject: approvedSubject,
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('greeting', { name: booking.guestName }),
    intro: needsPayment ? t('approvedPayIntro') : t('approvedIntro'),
    heroImage: details.hero,
    rows,
    // The payment link is the single action this email exists for — a
    // button, not a raw URL pasted into the intro (many clients never
    // linkify plain text, and a `?slug=` query breaks partial linkifiers).
    cta: needsPayment
      ? { label: t('completePaymentCta'), url: payUrl }
      : {
          label: t('rescheduledCta'),
          url: `${SITE_URL}/${locale}/book/confirmed/${reference}`,
        },
    closing: needsPayment ? t('approvedPayClosing') : t('approvedClosing'),
    footer: t('footer'),
  });
  await dispatchNotification({
    type: 'booking_approved',
    dedupeKey: `booking_approved:${booking.referenceCode}`,
    bookingId: booking.id,
    recipient: {
      kind: 'guest',
      email: booking.guestEmail,
      phone: booking.guestPhone,
      locale,
    },
    email: { subject: approvedSubject, html, text },
    whatsapp: {
      template: 'booking_approved',
      variables: {
        ...guestLifecycleVariables(booking, details, locale, t('genericExperience')),
        // Var 5 is the action link: the payment page while payment is
        // due, the booking page otherwise (the template copy reads
        // "details and next steps" either way).
        '5': needsPayment ? payUrl : `${SITE_URL}/${locale}/book/confirmed/${reference}`,
      },
    },
  });
}

/** The host declined the request. Nothing was ever charged. */
export async function sendBookingDeclinedEmail(reference: string): Promise<void> {
  if (!notificationsConfigured()) return;
  const booking = await getBookingByReference(reference);
  if (!booking || booking.status !== 'declined') return;
  if (!booking.guestEmail && !booking.guestPhone) return;

  const locale = booking.guestPreferredLanguage;
  const t = await getTranslations({ locale, namespace: 'bookingEmail' });
  const details = await lifecycleDetails(booking, locale, t);
  const rows = details.rows;

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
  await dispatchNotification({
    type: 'booking_declined',
    dedupeKey: `booking_declined:${booking.referenceCode}`,
    bookingId: booking.id,
    recipient: {
      kind: 'guest',
      email: booking.guestEmail,
      phone: booking.guestPhone,
      locale,
    },
    email: { subject: t('declinedSubject'), html, text },
    whatsapp: {
      template: 'booking_declined',
      variables: guestLifecycleVariables(booking, details, locale, t('genericExperience')),
    },
  });
}

/** The approval window lapsed with no host decision. Nothing was charged. */
export async function sendBookingExpiredEmail(reference: string): Promise<void> {
  if (!notificationsConfigured()) return;
  const booking = await getBookingByReference(reference);
  if (!booking?.guestEmail || booking.status !== 'expired') return;

  const locale = booking.guestPreferredLanguage;
  const t = await getTranslations({ locale, namespace: 'bookingEmail' });
  const { rows } = await lifecycleDetails(booking, locale, t);

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
  // Email-only for now (no approved WhatsApp template planned for the
  // expiry edge case) — still dispatched so the send is ledgered.
  await dispatchNotification({
    type: 'booking_expired',
    dedupeKey: `booking_expired:${booking.referenceCode}`,
    bookingId: booking.id,
    recipient: { kind: 'guest', email: booking.guestEmail, locale },
    email: { subject: t('expiredSubject'), html, text },
  });
}

/**
 * An unpaid hold lapsed and the cron released the spot — either an
 * approved request the guest never paid for, or an abandoned instant
 * booking. Nothing was charged.
 */
export async function sendBookingPaymentLapsedEmail(reference: string): Promise<void> {
  if (!notificationsConfigured()) return;
  const booking = await getBookingByReference(reference);
  if (!booking?.guestEmail || booking.status !== 'cancelled') return;

  const locale = booking.guestPreferredLanguage;
  const t = await getTranslations({ locale, namespace: 'bookingEmail' });
  const { rows } = await lifecycleDetails(booking, locale, t);

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
  // Email-only for now — still dispatched so the send is ledgered.
  await dispatchNotification({
    type: 'booking_payment_lapsed',
    dedupeKey: `booking_payment_lapsed:${booking.referenceCode}`,
    bookingId: booking.id,
    recipient: { kind: 'guest', email: booking.guestEmail, locale },
    email: { subject: t('paymentLapsedSubject'), html, text },
  });
}

interface HostEmailContext {
  email: string | null;
  /** E.164 phone — the WhatsApp address. Null for seeded demo hosts. */
  phone: string | null;
  locale: Locale;
  title: string;
}

/**
 * Resolve the notification contacts for the host of an experience.
 * Prefers `hosts.contact_email` / `hosts.contact_phone` (copied from
 * the application at approval) and falls back to the application row
 * for hosts approved before those columns existed. Returns null when
 * neither channel is addressable (seeded demo hosts), so the host
 * senders below no-op for them.
 */
async function hostEmailContext(experienceSlug: string): Promise<HostEmailContext | null> {
  // The public ExperienceSummary deliberately omits commission and host
  // id, so read the row (with its host) straight from the DB.
  const experience = await db.query.experiences.findFirst({
    where: (e) => eq(e.slug, experienceSlug),
    columns: { titleEn: true, titleAr: true },
    with: {
      host: { columns: { id: true, languages: true, contactEmail: true, contactPhone: true } },
    },
  });
  if (!experience) return null;

  let email = experience.host.contactEmail;
  let phone = experience.host.contactPhone;
  if (!email || !phone) {
    const application = await db.query.hostApplications.findFirst({
      where: eq(hostApplications.hostId, experience.host.id),
      columns: { contactEmail: true, contactPhone: true },
    });
    email = email ?? application?.contactEmail ?? null;
    phone = phone ?? application?.contactPhone ?? null;
  }
  if (!email && !phone) return null;

  const locale: Locale = experience.host.languages[0] === 'en' ? 'en' : 'ar';
  return {
    email,
    phone,
    locale,
    title: locale === 'ar' ? experience.titleAr : experience.titleEn,
  };
}

/**
 * Standard host-facing rows: experience / guest / date / time / party /
 * reference. The guest's name and the reference let the host match the
 * notice to a dashboard row without opening every booking; contact
 * details stay in the dashboard.
 */
function hostRows(
  booking: NonNullable<Awaited<ReturnType<typeof getBookingByReference>>>,
  host: HostEmailContext,
  t: Awaited<ReturnType<typeof getTranslations<'bookingEmail'>>>,
): ReceiptRow[] {
  const startsAt = startInstant(booking.date, booking.startTime);
  return [
    { label: t('experienceLabel'), value: host.title },
    { label: t('hostGuestLabel'), value: booking.guestName },
    { label: t('dateLabel'), value: formatDate(startsAt, host.locale) },
    { label: t('timeLabel'), value: formatTime(startsAt, host.locale) },
    { label: t('partyLabel'), value: formatInteger(booking.partySize, host.locale) },
    { label: t('referenceLabel'), value: booking.referenceCode },
  ];
}

/** Absolute host-dashboard URL in the host's locale. */
function hostBookingsUrl(locale: Locale): string {
  return `${SITE_URL}/${locale}/host/bookings`;
}

/**
 * "You have a new booking" notice to the host. Locale follows the
 * host's first listed language (Arabic-first default).
 */
export async function sendHostNewBookingEmail(reference: string): Promise<void> {
  if (!notificationsConfigured()) return;

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
    booking.discountSar,
    booking.walletAppliedSar,
  );

  const rows = hostRows(booking, host, t);
  rows.push({ label: t('hostNewPayoutLabel'), value: formatSAR(payoutSar, host.locale) });

  const isRequest = booking.status === 'pending';
  const subject = isRequest
    ? t('hostNewRequestSubject', { experience: host.title })
    : t('hostNewBookingSubject', { experience: host.title });
  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject,
    dir: host.locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('hostNewGreeting'),
    intro: isRequest ? t('hostNewRequestIntro') : t('hostNewBookingIntro'),
    rows,
    cta: { label: t('hostBookingsCta'), url: hostBookingsUrl(host.locale) },
    closing: t('hostNewClosing'),
    footer: t('footer'),
  });

  const type = isRequest ? 'host_new_request' : 'host_new_booking';
  const startsAt = startInstant(booking.date, booking.startTime);
  await dispatchNotification({
    type,
    dedupeKey: `${type}:${booking.referenceCode}`,
    bookingId: booking.id,
    recipient: { kind: 'host', email: host.email, phone: host.phone, locale: host.locale },
    email: { subject, html, text },
    whatsapp: {
      template: type,
      variables: {
        '1': host.title,
        '2': formatDate(startsAt, host.locale),
        '3': formatTime(startsAt, host.locale),
        '4': formatInteger(booking.partySize, host.locale),
        '5': formatSAR(payoutSar, host.locale),
        // Var 6 (dashboard link) is inert on the live v1 template; the
        // v2 body replaces the bare-domain literal with this variable.
        '6': hostBookingsUrl(host.locale),
      },
    },
  });
}

/**
 * The guest cancelled — tell the host their date has the spots back.
 * Sent for pending and confirmed bookings alike; best-effort, gated.
 */
export async function sendHostGuestCancelledEmail(reference: string): Promise<void> {
  if (!notificationsConfigured()) return;

  const booking = await getBookingByReference(reference);
  if (!booking?.experienceSlug) return;
  const host = await hostEmailContext(booking.experienceSlug);
  if (!host) return;

  const t = await getTranslations({ locale: host.locale, namespace: 'bookingEmail' });
  const subject = t('hostGuestCancelledSubject', { experience: host.title });
  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject,
    dir: host.locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('hostNewGreeting'),
    intro: t('hostGuestCancelledIntro'),
    rows: hostRows(booking, host, t),
    cta: { label: t('hostBookingsCta'), url: hostBookingsUrl(host.locale) },
    closing: t('hostNewClosing'),
    footer: t('footer'),
  });
  const startsAt = startInstant(booking.date, booking.startTime);
  await dispatchNotification({
    type: 'host_guest_cancelled',
    dedupeKey: `host_guest_cancelled:${booking.referenceCode}`,
    bookingId: booking.id,
    recipient: { kind: 'host', email: host.email, phone: host.phone, locale: host.locale },
    email: { subject, html, text },
    whatsapp: {
      template: 'host_guest_cancelled',
      variables: {
        '1': host.title,
        '2': formatDate(startsAt, host.locale),
        '3': formatTime(startsAt, host.locale),
        // Var 4 (dashboard link) — inert until the v2 body references it.
        '4': hostBookingsUrl(host.locale),
      },
    },
  });
}

/**
 * The guest moved their booking — tell the host the old date has its
 * spots back and the new date is now holding them. Mirrors the
 * guest-cancelled notice; best-effort, gated.
 */
export async function sendHostBookingRescheduledEmail(
  reference: string,
  oldDate: string,
): Promise<void> {
  if (!notificationsConfigured()) return;

  const booking = await getBookingByReference(reference);
  if (!booking?.experienceSlug) return;
  const host = await hostEmailContext(booking.experienceSlug);
  if (!host) return;

  const t = await getTranslations({ locale: host.locale, namespace: 'bookingEmail' });
  const movedFrom = startInstant(oldDate, booking.startTime);
  const rows = [
    { label: t('movedFromLabel'), value: formatDate(movedFrom, host.locale) },
    ...hostRows(booking, host, t),
  ];
  const subject = t('hostBookingRescheduledSubject', { experience: host.title });
  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject,
    dir: host.locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('hostNewGreeting'),
    intro: t('hostBookingRescheduledIntro'),
    rows,
    cta: { label: t('hostBookingsCta'), url: hostBookingsUrl(host.locale) },
    closing: t('hostNewClosing'),
    footer: t('footer'),
  });
  const startsAt = startInstant(booking.date, booking.startTime);
  await dispatchNotification({
    type: 'host_booking_rescheduled',
    dedupeKey: `host_booking_rescheduled:${booking.referenceCode}:${booking.date}`,
    bookingId: booking.id,
    recipient: { kind: 'host', email: host.email, phone: host.phone, locale: host.locale },
    email: { subject, html, text },
    whatsapp: {
      template: 'host_booking_rescheduled',
      variables: {
        '1': host.title,
        '2': formatDate(startsAt, host.locale),
        '3': formatTime(startsAt, host.locale),
        // Var 4 (dashboard link) for the not-yet-authored template body.
        '4': hostBookingsUrl(host.locale),
      },
    },
  });
}

/**
 * An unpaid hold lapsed and the cron released it — the booking the host
 * was told about evaporated. Without this, the host's picture of their
 * date silently diverges from reality.
 */
export async function sendHostHoldLapsedEmail(reference: string): Promise<void> {
  if (!notificationsConfigured()) return;

  const booking = await getBookingByReference(reference);
  if (!booking?.experienceSlug) return;
  const host = await hostEmailContext(booking.experienceSlug);
  if (!host) return;

  const t = await getTranslations({ locale: host.locale, namespace: 'bookingEmail' });
  const subject = t('hostHoldLapsedSubject', { experience: host.title });
  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject,
    dir: host.locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('hostNewGreeting'),
    intro: t('hostHoldLapsedIntro'),
    rows: hostRows(booking, host, t),
    closing: t('hostNewClosing'),
    footer: t('footer'),
  });
  // Email-only for now — still dispatched so the send is ledgered.
  await dispatchNotification({
    type: 'host_hold_lapsed',
    dedupeKey: `host_hold_lapsed:${booking.referenceCode}`,
    bookingId: booking.id,
    recipient: { kind: 'host', email: host.email, locale: host.locale },
    email: { subject, html, text },
  });
}

/**
 * The guest's payment settled — the booking is fully secured. Closes
 * the gap where the host heard about a booking at creation (possibly
 * pre-payment) and then nothing again.
 */
export async function sendHostPaymentReceivedEmail(reference: string): Promise<void> {
  if (!notificationsConfigured()) return;

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
    booking.discountSar,
    booking.walletAppliedSar,
  );

  const rows = hostRows(booking, host, t);
  rows.push({ label: t('hostNewPayoutLabel'), value: formatSAR(payoutSar, host.locale) });

  const subject = t('hostPaymentReceivedSubject', { experience: host.title });
  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject,
    dir: host.locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('hostNewGreeting'),
    intro: t('hostPaymentReceivedIntro'),
    rows,
    cta: { label: t('hostBookingsCta'), url: hostBookingsUrl(host.locale) },
    closing: t('hostNewClosing'),
    footer: t('footer'),
  });
  const startsAt = startInstant(booking.date, booking.startTime);
  await dispatchNotification({
    type: 'host_payment_received',
    dedupeKey: `host_payment_received:${booking.referenceCode}`,
    bookingId: booking.id,
    recipient: { kind: 'host', email: host.email, phone: host.phone, locale: host.locale },
    email: { subject, html, text },
    whatsapp: {
      template: 'host_payment_received',
      variables: {
        '1': host.title,
        '2': formatDate(startsAt, host.locale),
        '3': formatTime(startsAt, host.locale),
        '4': formatSAR(payoutSar, host.locale),
        // Var 5 (dashboard link) — inert until the v2 body references it.
        '5': hostBookingsUrl(host.locale),
      },
    },
  });
}

/**
 * Booking completed — close the loop on both sides (2026-07-31 audit:
 * this was the single largest silent transition; it gates reviews AND
 * payouts, yet nobody heard about it).
 *
 *  - Guest: "how was it?" review invitation. Reviews are only possible
 *    on completed bookings, so this is the moment to ask.
 *  - Host: the booking is complete and its payout is now owed.
 *
 * Fired by the cron's auto-complete pass and by manual host/admin
 * completion. Both sides are individually best-effort and dedupe on the
 * reference, so the two triggers can't double-send.
 */
export async function sendBookingCompletedEmails(reference: string): Promise<void> {
  if (!notificationsConfigured()) return;
  const booking = await getBookingByReference(reference);
  if (!booking || booking.status !== 'completed') return;

  // --- Guest: review invitation. -------------------------------------
  if (booking.guestEmail || booking.guestPhone) {
    const locale = booking.guestPreferredLanguage;
    const t = await getTranslations({ locale, namespace: 'bookingEmail' });
    const details = await lifecycleDetails(booking, locale, t);
    const experienceName = details.title ?? t('genericExperience');

    const subject = t('reviewInviteSubject', { experience: experienceName });
    const { html, text } = renderReceiptEmail({
      logoUrl: EMAIL_LOGO_URL,
      subject,
      dir: locale === 'ar' ? 'rtl' : 'ltr',
      greeting: t('greeting', { name: booking.guestName }),
      intro: t('reviewInviteIntro', { experience: experienceName }),
      heroImage: details.hero,
      rows: details.rows,
      // Reviews are written from the guest dashboard's past-bookings list.
      cta: { label: t('reviewInviteCta'), url: `${SITE_URL}/${locale}/me` },
      closing: t('reviewInviteClosing'),
      footer: t('footer'),
    });
    await dispatchNotification({
      type: 'booking_completed_review',
      dedupeKey: `booking_completed_review:${booking.referenceCode}`,
      bookingId: booking.id,
      recipient: {
        kind: 'guest',
        email: booking.guestEmail,
        phone: booking.guestPhone,
        locale,
      },
      email: { subject, html, text },
    });
  }

  // --- Host: completed + payout now owed. -----------------------------
  if (booking.experienceSlug) {
    const host = await hostEmailContext(booking.experienceSlug);
    if (host) {
      const t = await getTranslations({ locale: host.locale, namespace: 'bookingEmail' });
      const { payoutSar } = splitCommission(
        booking.totalAmountSar,
        booking.commissionBps,
        booking.vatRateBps,
        booking.discountSar,
        booking.walletAppliedSar,
      );
      const rows = hostRows(booking, host, t);
      rows.push({ label: t('hostNewPayoutLabel'), value: formatSAR(payoutSar, host.locale) });

      const subject = t('hostCompletedSubject', { experience: host.title });
      const { html, text } = renderReceiptEmail({
        logoUrl: EMAIL_LOGO_URL,
        subject,
        dir: host.locale === 'ar' ? 'rtl' : 'ltr',
        greeting: t('hostNewGreeting'),
        intro: t('hostCompletedIntro'),
        rows,
        cta: { label: t('hostEarningsCta'), url: `${SITE_URL}/${host.locale}/host/earnings` },
        closing: t('hostNewClosing'),
        footer: t('footer'),
      });
      await dispatchNotification({
        type: 'host_booking_completed',
        dedupeKey: `host_booking_completed:${booking.referenceCode}`,
        bookingId: booking.id,
        recipient: { kind: 'host', email: host.email, locale: host.locale },
        email: { subject, html, text },
      });
    }
  }
}

/**
 * The gateway rejected the guest's payment attempt. Without this the
 * guest heard NOTHING between the failed 3DS screen and the hold-lapsed
 * notice hours later — the spot is still held until the payment
 * deadline, so a prompt retry usually saves the booking. Email-only;
 * best-effort like every sender here.
 */
export async function sendBookingPaymentFailedEmail(reference: string): Promise<void> {
  if (!notificationsConfigured()) return;
  const booking = await getBookingByReference(reference);
  if (!booking || booking.paymentStatus !== 'failed') return;
  if (booking.status === 'cancelled' || booking.status === 'completed') return;
  if (!booking.guestEmail && !booking.guestPhone) return;
  const locale = booking.guestPreferredLanguage;

  const t = await getTranslations({ locale, namespace: 'bookingEmail' });
  const details = await lifecycleDetails(booking, locale, t);
  const rows = details.rows;
  if (booking.paymentDeadline) {
    const d = new Date(booking.paymentDeadline);
    rows.push({
      label: t('paymentDeadlineLabel'),
      value: `${formatDate(d, locale, 'gregory', KSA_DATE)}, ${formatTime(d, locale, KSA_TIME)}`,
    });
  }

  const payUrl = `${SITE_URL}/${locale}/book/${reference}/pay?slug=${encodeURIComponent(booking.experienceSlug)}`;
  const subject = t('paymentFailedSubject', { reference: booking.referenceCode });
  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject,
    dir: locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('greeting', { name: booking.guestName }),
    intro: t('paymentFailedIntro'),
    rows,
    cta: { label: t('paymentFailedCta'), url: payUrl },
    closing: t('paymentFailedClosing'),
    footer: t('footer'),
  });
  // Deduped per reference: one nudge per booking, not one per failed
  // attempt — repeated declines shouldn't turn into repeated mail.
  await dispatchNotification({
    type: 'booking_payment_failed',
    dedupeKey: `booking_payment_failed:${booking.referenceCode}`,
    bookingId: booking.id,
    recipient: {
      kind: 'guest',
      email: booking.guestEmail,
      phone: booking.guestPhone,
      locale,
    },
    email: { subject, html, text },
  });
}

/**
 * An operator (admin) cancelled the booking — tell the host their date
 * has the spots back. The guest-cancel notice covers guest
 * cancellations and a host cancelling knows already; this closes the
 * admin-cancel gap where the host's calendar changed silently.
 */
export async function sendHostBookingCancelledEmail(reference: string): Promise<void> {
  if (!notificationsConfigured()) return;
  const booking = await getBookingByReference(reference);
  if (!booking?.experienceSlug) return;
  const host = await hostEmailContext(booking.experienceSlug);
  if (!host) return;

  const t = await getTranslations({ locale: host.locale, namespace: 'bookingEmail' });
  const subject = t('hostCancelledByOpsSubject', { experience: host.title });
  const { html, text } = renderReceiptEmail({
    logoUrl: EMAIL_LOGO_URL,
    subject,
    dir: host.locale === 'ar' ? 'rtl' : 'ltr',
    greeting: t('hostNewGreeting'),
    intro: t('hostCancelledByOpsIntro'),
    rows: hostRows(booking, host, t),
    cta: { label: t('hostBookingsCta'), url: hostBookingsUrl(host.locale) },
    closing: t('hostNewClosing'),
    footer: t('footer'),
  });
  await dispatchNotification({
    type: 'host_booking_cancelled',
    dedupeKey: `host_booking_cancelled:${booking.referenceCode}`,
    bookingId: booking.id,
    recipient: { kind: 'host', email: host.email, locale: host.locale },
    email: { subject, html, text },
  });
}

/**
 * Booking notifications the cron retry sweep can safely re-fire from
 * (reference, locale) alone: each sender re-renders from current DB
 * state and re-dispatches, and `claimDelivery` re-claims only channel
 * rows still `failed` with attempts left — so re-calling a sender can
 * never double-send anything that already went out.
 *
 * Deliberately absent: `booking_cancelled`, `booking_rescheduled`,
 * `host_booking_rescheduled` (payloads need caller context — the refund
 * verdict, the pre-reschedule date — that isn't re-derivable from the
 * booking row) and `host_booking_cancelled` (the operator-vs-guest
 * provenance isn't re-derivable here either), so a failed one stays
 * failed and surfaces in the ledger instead of guessing.
 */
export const RETRYABLE_BOOKING_SENDERS: Readonly<
  Record<string, (reference: string, locale: Locale) => Promise<void>>
> = {
  booking_confirmed: (reference) => sendBookingReceiptEmail(reference),
  booking_request_received: (reference) => sendBookingRequestReceivedEmail(reference),
  booking_approved: (reference) => sendBookingApprovedEmail(reference),
  booking_declined: (reference) => sendBookingDeclinedEmail(reference),
  booking_expired: (reference) => sendBookingExpiredEmail(reference),
  booking_payment_lapsed: (reference) => sendBookingPaymentLapsedEmail(reference),
  booking_payment_failed: (reference) => sendBookingPaymentFailedEmail(reference),
  booking_reminder_24h: (reference, locale) => sendBookingPrepareReminderEmail(reference, locale),
  booking_reminder_3h: (reference, locale) => sendBookingDepartureReminderEmail(reference, locale),
  booking_completed_review: (reference) => sendBookingCompletedEmails(reference),
  host_booking_completed: (reference) => sendBookingCompletedEmails(reference),
  host_new_booking: (reference) => sendHostNewBookingEmail(reference),
  host_new_request: (reference) => sendHostNewBookingEmail(reference),
  host_guest_cancelled: (reference) => sendHostGuestCancelledEmail(reference),
  host_hold_lapsed: (reference) => sendHostHoldLapsedEmail(reference),
  host_payment_received: (reference) => sendHostPaymentReceivedEmail(reference),
};
