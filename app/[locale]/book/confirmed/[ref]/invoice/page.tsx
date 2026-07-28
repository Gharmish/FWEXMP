import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ArrowLeft, MessageCircle } from 'lucide-react';
import QRCode from 'qrcode';
import { cn } from '@/lib/utils';
import { Link, redirect } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { formatDate, formatInteger, formatTime } from '@/lib/format';
import {
  SITE_URL,
  SITE_NAME,
  SUPPORT_EMAIL,
  SELLER_LEGAL_NAME,
  COMMERCIAL_REGISTRATION,
} from '@/lib/site';
import { whatsappShareLink } from '@/lib/whatsapp';
import { buttonVariants } from '@/components/ui/button';
import { Price } from '@/components/ui/price';
import { PrintButton } from '@/components/ui/print-button';
import { GharmishLogo } from '@/components/layout/gharmish-logo';
import { getBookingByReferenceForViewer } from '@/features/bookings/queries';
import { getExperienceBySlug } from '@/features/experiences/queries';
import { toArabicText } from '@/features/experiences/lib/arabic-content';
import { startInstant } from '@/features/bookings/lib/cancellation';
import { vatPortionSar, vatRatePercent } from '@/features/bookings/lib/vat';
import { zatcaQrPayload } from '@/features/bookings/lib/zatca-qr';

/** UUID v4 shape — the only thing we accept as a public reference. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BRAND_NAMES: Record<string, string> = {
  MADA: 'mada',
  VISA: 'Visa',
  MASTER: 'Mastercard',
};

const KSA_TIME: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Riyadh' };
const KSA_DATE: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Riyadh',
};

interface PageParams {
  params: Promise<{ locale: string; ref: string }>;
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'invoice.meta' });
  return {
    title: t('title'),
    // Invoice URLs are private capability links; crawlers must skip them.
    robots: { index: false, follow: false },
  };
}

/**
 * The guest's keepable payment document. One page, two legal modes read
 * from the per-booking snapshot stamped at settlement:
 *
 * - `vatRateBps` null  → "Receipt": no VAT wording anywhere (the platform
 *   was below the ZATCA registration threshold when this settled).
 * - `vatRateBps` set   → ZATCA Phase-1 "Simplified tax invoice": VAT
 *   registration number, taxable/VAT/total rows, and the mandated
 *   base64-TLV QR code.
 *
 * Browser print (the PrintButton) is the save-as-PDF mechanism — the
 * site chrome is already `print:hidden`, so paper carries just this
 * document. The email receipt links here; WhatsApp delivery is the
 * share button (wa.me) until the Business API lands.
 */
export default async function BookingInvoicePage({ params }: PageParams) {
  const { locale, ref } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;

  if (!UUID_RE.test(ref)) notFound();

  const booking = await getBookingByReferenceForViewer(ref);
  if (!booking) notFound();
  // No money has moved → nothing to document yet. Send the guest to the
  // booking page, which knows how to talk about every pre-payment state.
  if (!booking.paidAt) redirect({ href: `/book/confirmed/${ref}`, locale: loc });

  // Issued invoices are immutable: prefer the settlement snapshots and
  // fall back to live lookups only for rows settled before the columns
  // existed. A later rename never rewrites this document.
  const experience = await getExperienceBySlug(booking.experienceSlug);
  const snapshotTitle = loc === 'ar' ? booking.invoiceItemAr : booking.invoiceItemEn;
  const title =
    snapshotTitle ?? (experience ? (loc === 'ar' ? experience.titleAr : experience.titleEn) : null);
  const billedName = booking.billedName ?? booking.guestName;
  const placeName = experience
    ? loc === 'ar'
      ? toArabicText(experience.placeName)
      : experience.placeName
    : null;

  const t = await getTranslations('invoice');

  const paidAt = new Date(booking.paidAt);
  const startsAt = startInstant(booking.date, booking.startTime);
  // Both snapshot fields or neither — settlement stamps them together.
  const vat =
    booking.vatRateBps && booking.vatRegistrationNumber
      ? { rateBps: booking.vatRateBps, registrationNumber: booking.vatRegistrationNumber }
      : null;
  const vatSar = vat ? vatPortionSar(booking.totalAmountSar, vat.rateBps) : 0;
  const taxableSar = booking.totalAmountSar - vatSar;
  const unitSar = Math.round(booking.totalAmountSar / booking.partySize);
  const brand = booking.paymentBrand ? BRAND_NAMES[booking.paymentBrand] : undefined;
  const refunded = booking.status === 'refunded';

  // ZATCA Phase-1 QR — only meaningful on a tax invoice.
  const qrDataUrl = vat
    ? await QRCode.toDataURL(
        zatcaQrPayload({
          sellerName: SELLER_LEGAL_NAME,
          vatNumber: vat.registrationNumber,
          timestamp: paidAt,
          totalSar: booking.totalAmountSar,
          vatSar,
        }),
        { margin: 1, width: 480, errorCorrectionLevel: 'M' },
      )
    : null;

  // Credit note (ZATCA: a refunded tax invoice must be reversed by a
  // credit note, never by editing the invoice). The note reverses the
  // amount ACTUALLY returned, not the invoice total (2026-07-20 audit —
  // partial policy refunds exist, and a 50% refund must not emit a
  // full-amount credit note that over-reverses the VAT). The reversal is
  // capped at the card-charged consideration: any wallet-credit leg of
  // the refund was never on this tax document. Legacy rows without the
  // stamp were full refunds, so the total is the correct fallback.
  // Non-VAT refunds keep the plain refunded note above — no tax to
  // reverse.
  const refundedSar = refunded
    ? Math.min(booking.refundedAmountSar ?? booking.totalAmountSar, booking.totalAmountSar)
    : 0;
  const creditVatSar = vat ? vatPortionSar(refundedSar, vat.rateBps) : 0;
  const creditNote =
    refunded && vat && booking.refundedAt && refundedSar > 0
      ? {
          refundedAt: new Date(booking.refundedAt),
          vatNumber: vat.registrationNumber,
          rateBps: vat.rateBps,
          amountSar: refundedSar,
          vatSar: creditVatSar,
          taxableSar: refundedSar - creditVatSar,
        }
      : null;
  const creditNoteQrDataUrl = creditNote
    ? await QRCode.toDataURL(
        zatcaQrPayload({
          sellerName: SELLER_LEGAL_NAME,
          vatNumber: creditNote.vatNumber,
          timestamp: creditNote.refundedAt,
          totalSar: creditNote.amountSar,
          vatSar: creditNote.vatSar,
        }),
        { margin: 1, width: 480, errorCorrectionLevel: 'M' },
      )
    : null;

  const invoiceUrl = `${SITE_URL}/${loc}/book/confirmed/${ref}/invoice`;
  const shareHref = whatsappShareLink(
    t('whatsappMessage', { reference: booking.referenceCode, url: invoiceUrl }),
  );

  const labelClass = 'text-sarat-black-600 text-sm';
  const hairline = 'border-sarat-black/8 [border-top-width:0.5px]';

  const identityRows: Array<{ label: string; value: string }> = [
    { label: t('invoiceNumberLabel'), value: booking.referenceCode },
    { label: t('issueDateLabel'), value: formatDate(paidAt, loc, 'gregory', KSA_DATE) },
    { label: t('billedToLabel'), value: billedName },
  ];
  if (vat) {
    identityRows.push({ label: t('vatNumberLabel'), value: vat.registrationNumber });
  }

  return (
    <article className="mx-auto w-full max-w-2xl px-6 py-16 print:max-w-none print:px-0 print:py-0">
      {/* Document header: wordmark + document type. */}
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex flex-col gap-2">
          <div className="text-sarat-black">
            <GharmishLogo className="h-7" />
          </div>
          <p className={labelClass}>{t('sellerRegion')}</p>
          <p className={labelClass}>
            {t('crLabel')} {COMMERCIAL_REGISTRATION}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 text-end">
          <h1 className="font-display text-2xl font-medium tracking-[-0.025em]">
            {vat ? t('taxInvoiceTitle') : t('receiptTitle')}
          </h1>
          {refunded && (
            <p className="text-al-qatt-red-800 border-al-qatt-red/40 rounded-full border px-3 py-0.5 text-sm font-medium">
              {t('refundedStamp')}
            </p>
          )}
        </div>
      </header>

      {/* Identity block: number, issue date, buyer, VAT number. */}
      <dl className={cn('mt-10 grid gap-4 pt-6 sm:grid-cols-2', hairline)}>
        {identityRows.map((row) => (
          <div key={row.label} className="flex flex-col gap-1">
            <dt className={labelClass}>{row.label}</dt>
            <dd className="text-base font-medium" dir="auto">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      {/* Line item. */}
      <section className={cn('mt-8 pt-6', hairline)}>
        <div className="flex items-baseline justify-between gap-6">
          <div className="flex flex-col gap-1">
            <p className={labelClass}>{t('itemLabel')}</p>
            <p className="text-base font-medium">
              {title
                ? t('itemDescription', {
                    title,
                    date: formatDate(startsAt, loc, 'gregory', KSA_DATE),
                    time: formatTime(startsAt, loc, KSA_TIME),
                  })
                : booking.referenceCode}
            </p>
            {placeName && <p className={labelClass}>{placeName}</p>}
          </div>
        </div>
        <dl className="mt-4 flex flex-col gap-2">
          <div className="flex items-baseline justify-between text-sm">
            <dt className={labelClass}>{t('qtyLabel')}</dt>
            <dd>{formatInteger(booking.partySize, loc)}</dd>
          </div>
          <div className="flex items-baseline justify-between text-sm">
            <dt className={labelClass}>{t('unitPriceLabel')}</dt>
            <dd>
              <Price amount={unitSar} locale={loc} />
            </dd>
          </div>
        </dl>
      </section>

      {/* Totals: receipt = one line; tax invoice = taxable / VAT / total. */}
      <section className={cn('mt-6 flex flex-col gap-2 pt-6', hairline)}>
        {vat ? (
          <>
            <div className="flex items-baseline justify-between text-sm">
              <p className={labelClass}>{t('taxableLabel')}</p>
              <Price amount={taxableSar} locale={loc} />
            </div>
            <div className="flex items-baseline justify-between text-sm">
              <p className={labelClass}>{t('vatLabel', { pct: vatRatePercent(vat.rateBps) })}</p>
              <Price amount={vatSar} locale={loc} />
            </div>
            <div className="flex items-baseline justify-between text-lg font-medium">
              <p>{t('totalInclVatLabel')}</p>
              <Price amount={booking.totalAmountSar} locale={loc} />
            </div>
            <p className={cn(labelClass, 'mt-1')}>{t('vatNote')}</p>
          </>
        ) : (
          <div className="flex items-baseline justify-between text-lg font-medium">
            <p>{t('totalPaidLabel')}</p>
            <Price amount={booking.totalAmountSar} locale={loc} />
          </div>
        )}
        <dl className="mt-2 flex flex-col gap-2">
          <div className="flex items-baseline justify-between text-sm">
            <dt className={labelClass}>{t('paymentMethodLabel')}</dt>
            <dd>{brand ?? '—'}</dd>
          </div>
          <div className="flex items-baseline justify-between text-sm">
            <dt className={labelClass}>{t('paidOnLabel')}</dt>
            <dd>{formatDate(paidAt, loc, 'gregory', KSA_DATE)}</dd>
          </div>
        </dl>
        {refunded && booking.refundedAt && (
          <p className="text-al-qatt-red-800 mt-2 text-sm">
            {t('refundedNote', {
              date: formatDate(new Date(booking.refundedAt), loc, 'gregory', KSA_DATE),
            })}
          </p>
        )}
      </section>

      {/* ZATCA QR — tax-invoice mode only. */}
      {qrDataUrl && (
        <section className={cn('mt-6 flex items-center gap-5 pt-6', hairline)}>
          <Image
            src={qrDataUrl}
            alt={t('qrCaption')}
            width={120}
            height={120}
            unoptimized
            className="rounded-image size-30 shrink-0"
          />
          <p className={cn(labelClass, 'max-w-56 leading-relaxed')}>{t('qrCaption')}</p>
        </section>
      )}

      {/* Credit note — full reversal of a refunded tax invoice. */}
      {creditNote && (
        <section className="border-al-qatt-red/30 rounded-card mt-10 flex flex-col gap-4 [border-width:0.5px] p-6 print:break-inside-avoid">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-display text-xl font-medium tracking-[-0.025em]">
              {t('creditNoteTitle')}
            </h2>
            <p className="text-sm font-medium" dir="ltr">
              CN-{booking.referenceCode}
            </p>
          </div>
          <p className={labelClass}>
            {t('creditNoteAgainst', {
              invoice: booking.referenceCode,
              date: formatDate(creditNote.refundedAt, loc, 'gregory', KSA_DATE),
            })}
          </p>
          <dl className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between text-sm">
              <dt className={labelClass}>{t('taxableLabel')}</dt>
              <dd>
                <Price amount={creditNote.taxableSar} locale={loc} />
              </dd>
            </div>
            <div className="flex items-baseline justify-between text-sm">
              <dt className={labelClass}>
                {t('vatLabel', { pct: vatRatePercent(creditNote.rateBps) })}
              </dt>
              <dd>
                <Price amount={creditNote.vatSar} locale={loc} />
              </dd>
            </div>
            <div className="flex items-baseline justify-between text-base font-medium">
              <dt>{t('creditTotalLabel')}</dt>
              <dd>
                <Price amount={creditNote.amountSar} locale={loc} />
              </dd>
            </div>
          </dl>
          {creditNoteQrDataUrl && (
            <div className="flex items-center gap-5">
              <Image
                src={creditNoteQrDataUrl}
                alt={t('qrCaption')}
                width={96}
                height={96}
                unoptimized
                className="rounded-image size-24 shrink-0"
              />
              <p className={cn(labelClass, 'max-w-56 leading-relaxed')}>{t('qrCaption')}</p>
            </div>
          )}
        </section>
      )}

      {/* Seller footer. */}
      <footer className={cn('mt-8 flex flex-col gap-1 pt-6', hairline)}>
        <p className="text-sm font-medium">
          {SITE_NAME} · {t('sellerRegion')}
        </p>
        <p className={labelClass}>{t('footerNote', { email: SUPPORT_EMAIL })}</p>
      </footer>

      {/* Actions — never printed. */}
      <div className="mt-10 flex flex-wrap items-center gap-3 print:hidden">
        <PrintButton label={t('printAction')} />
        <a
          href={shareHref}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: 'secondary', size: 'md' }), 'gap-2')}
        >
          <MessageCircle className="size-4 shrink-0" aria-hidden />
          {t('whatsappAction')}
        </a>
        <Link
          href={`/book/confirmed/${ref}`}
          className="text-sarat-black-600 inline-flex min-h-11 items-center gap-2 text-sm font-medium transition-opacity duration-200 hover:opacity-60"
        >
          <ArrowLeft className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
          {t('backToBooking')}
        </Link>
      </div>
    </article>
  );
}
