import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, Lock } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { MountFade } from '@/components/ui/motion';
import { hasHyperpay } from '@/lib/env';
import { formatDate, formatInteger, formatTime } from '@/lib/format';
import { Price } from '@/components/ui/price';
import { getBookingByReferenceForViewer } from '@/features/bookings/queries';
import { getStoredBillingForBooking } from '@/features/payments/queries';
import { vatPortionSar, vatRatePercent } from '@/features/bookings/lib/vat';
import { getPlatformSettings } from '@/lib/platform-settings';
import { isHoldExpired } from '@/features/bookings/lib/availability';
import { getExperienceBySlug } from '@/features/experiences/queries';
import {
  PaymentDetailsForm,
  type PaymentDetailsCopy,
} from '@/features/payments/components/payment-details-form';
import { PaymentDeadlineNote } from '@/features/payments/components/payment-deadline-note';
import { PromoCodeField } from '@/features/promo-codes/components/promo-code-field';
import { PaymentMarks } from '@/components/layout/payment-marks';
import { cn } from '@/lib/utils';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageParams {
  params: Promise<{ locale: string; reference: string }>;
  searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === 'ar' ? 'إتمام الدفع' : 'Complete payment',
    robots: { index: false, follow: false },
  };
}

function asString(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

export default async function PaymentPage({ params, searchParams }: PageParams) {
  const { locale, reference } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;

  if (!UUID_RE.test(reference)) notFound();

  const sp = await searchParams;
  const slugFromQuery = asString(sp.slug);
  const confirmedHref = `/${locale}/book/confirmed/${reference}${slugFromQuery ? `?slug=${encodeURIComponent(slugFromQuery)}` : ''}`;

  // Payment off (no HyperPay) or nothing to settle → fall back to the
  // request-to-book confirmation page.
  if (!hasHyperpay()) redirect(confirmedHref);

  const booking = await getBookingByReferenceForViewer(reference);
  if (!booking) redirect(confirmedHref);
  if (booking.paymentStatus === 'paid') redirect(confirmedHref);
  // Pay-after-approval: a request the host hasn't accepted (or that was
  // declined/expired/cancelled) has nothing to pay — the confirmation
  // page renders the right state and `createCheckout` refuses it anyway.
  if (booking.status !== 'confirmed') redirect(confirmedHref);
  // A lapsed hold can't be paid (`createCheckout` refuses it) — send the
  // guest to the confirmation page's "payment window closed" state
  // instead of letting them fill the whole form first.
  const holdDeadline = booking.paymentDeadline ? new Date(booking.paymentDeadline) : null;
  if (
    (booking.paymentStatus === 'unpaid' || booking.paymentStatus === 'failed') &&
    isHoldExpired(holdDeadline, new Date())
  ) {
    redirect(confirmedHref);
  }

  const experienceSlug = booking.experienceSlug ?? slugFromQuery;
  const experience = experienceSlug ? await getExperienceBySlug(experienceSlug) : undefined;
  const title = experience ? (loc === 'ar' ? experience.titleAr : experience.titleEn) : null;

  const t = await getTranslations('payment');
  const tFooter = await getTranslations('footer');

  // Clickwrap consent line with inline links to each binding document.
  // Built here (rich text) so the link order reads naturally per locale.
  const consentLinkClassName =
    'font-medium underline underline-offset-4 transition-opacity duration-200 hover:opacity-60';
  const termsLabel = t.rich('termsAgreement', {
    terms: (chunks) => (
      <Link href="/terms" className={consentLinkClassName}>
        {chunks}
      </Link>
    ),
    privacy: (chunks) => (
      <Link href="/privacy" className={consentLinkClassName}>
        {chunks}
      </Link>
    ),
    cancellation: (chunks) => (
      <Link href="/cancellation-policy" className={consentLinkClassName}>
        {chunks}
      </Link>
    ),
  });

  const copy: PaymentDetailsCopy = {
    heading: t('detailsHeading'),
    yourDetails: t('yourDetails'),
    editDetails: t('editDetails'),
    billingAddressHeading: t('billingAddressHeading'),
    billingWhy: t('billingWhy'),
    optionalSuffix: t('optionalSuffix'),
    givenName: t('givenName'),
    surname: t('surname'),
    email: t('email'),
    street1: t('street1'),
    city: t('city'),
    state: t('state'),
    postcode: t('postcode'),
    country: t('country'),
    submit: t('submit'),
    pending: t('pending'),
    invalid: {
      givenName: t('invalid.givenName'),
      surname: t('invalid.surname'),
      email: t('invalid.email'),
      street1: t('invalid.street1'),
      city: t('invalid.city'),
      state: t('invalid.state'),
      postcode: t('invalid.postcode'),
      country: t('invalid.country'),
    },
    errorValidation: t('errorValidation'),
    errorServer: t('errorServer'),
    errorUnavailable: t('errorUnavailable'),
    errorNotFound: t('errorNotFound'),
    errorAlreadyPaid: t('errorAlreadyPaid'),
    errorExpired: t('errorExpired'),
    errorNotApproved: t('errorNotApproved'),
    termsLabel,
    termsRequired: t('termsRequired'),
    payHeading: t('payHeading'),
    widgetLoading: t('widgetLoading'),
    widgetError: t('widgetError'),
    widgetRetry: t('widgetRetry'),
    orPayWithCard: t('orPayWithCard'),
  };

  const promoCopy = {
    label: t('promo.label'),
    placeholder: t('promo.placeholder'),
    apply: t('promo.apply'),
    applying: t('promo.applying'),
    appliedPrefix: t('promo.appliedPrefix'),
    remove: t('promo.remove'),
    removing: t('promo.removing'),
    errorBelowMin: t('promo.errorBelowMin'),
    errors: {
      invalid: t('promo.errors.invalid'),
      exhausted: t('promo.errors.exhausted'),
      already_paid: t('promo.errors.alreadyPaid'),
      unavailable: t('promo.errors.unavailable'),
      not_found: t('promo.errors.notFound'),
      validation: t('promo.errors.validation'),
      no_db: t('promo.errors.noDb'),
      server: t('promo.errors.server'),
    },
  };

  // Split the booking's guest name into given/surname to prefill the form
  // (the server echo still wins on a failed submit). Most names have a final
  // token as the surname; a single token prefills the given name only.
  const fullName = booking.guestName.trim();
  const lastSpace = fullName.lastIndexOf(' ');
  const nameDefaults =
    lastSpace === -1
      ? { givenName: fullName }
      : {
          givenName: fullName.slice(0, lastSpace).trim(),
          surname: fullName.slice(lastSpace + 1).trim(),
        };
  // Billing address the guest saved on a previous checkout — so a returning
  // guest confirms instead of retyping it. `country` falls back to KSA.
  const storedBilling = await getStoredBillingForBooking(reference);
  const defaults = {
    ...nameDefaults,
    ...(booking.guestEmail ? { email: booking.guestEmail } : {}),
    ...storedBilling,
    country: storedBilling.country ?? 'SA',
  };

  const summary: Array<{ label: string; value: ReactNode }> = [];
  if (title) summary.push({ label: t('experienceLabel'), value: title });
  const startsAt = new Date(`${booking.date}T${booking.startTime}:00`);
  summary.push({ label: t('dateLabel'), value: formatDate(startsAt, loc) });
  summary.push({ label: t('timeLabel'), value: formatTime(startsAt, loc) });
  summary.push({ label: t('partyLabel'), value: formatInteger(booking.partySize, loc) });
  // A promo shows as subtotal (pre-discount) + a discount line above the
  // charged total. `totalAmountSar` is always the post-discount amount.
  if (booking.discountSar > 0) {
    summary.push({
      label: t('subtotalLabel'),
      value: <Price amount={booking.totalAmountSar + booking.discountSar} locale={loc} />,
    });
    summary.push({
      label: booking.promoCode
        ? t('promo.discountLabel', { code: booking.promoCode })
        : t('promo.discountLabelGeneric'),
      value: (
        <span className="text-juniper-green-800">
          −<Price amount={booking.discountSar} locale={loc} />
        </span>
      ),
    });
  }
  summary.push({
    label: t('totalLabel'),
    value: <Price amount={booking.totalAmountSar} locale={loc} />,
  });
  // Prices are VAT-inclusive — while the platform VAT toggle is on, this
  // pre-payment step discloses the portion the settlement will stamp.
  // Never add on top; never mention VAT while the toggle is off.
  const { vatEnabled, vatRateBps } = await getPlatformSettings();
  if (vatEnabled) {
    summary.push({
      label: t('vatIncludedLabel', { pct: vatRatePercent(vatRateBps) }),
      value: <Price amount={vatPortionSar(booking.totalAmountSar, vatRateBps)} locale={loc} />,
    });
  }

  return (
    <article className="mx-auto w-full max-w-2xl px-6 py-16">
      {/* Entrance on the header only. The HyperPay widget below stays
          motion-free: payment must read rock-solid, and iframes repaint
          badly under transforms. */}
      <MountFade eager>
        <header className="flex flex-col gap-3">
          <p
            className={cn(
              'text-juniper-green-800 text-[11px]',
              // Letter-spacing severs connected Arabic glyphs — EN only.
              loc === 'en' && 'tracking-[0.2em] uppercase',
            )}
          >
            {t('eyebrow')}
          </p>
          <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance">
            {t('title')}
          </h1>
          <p className="text-sarat-black-600 text-lg leading-relaxed">{t('intro')}</p>
          {holdDeadline && (
            <PaymentDeadlineNote
              deadlineIso={holdDeadline.toISOString()}
              note={t('deadlineNote', {
                deadline:
                  loc === 'ar'
                    ? `${formatDate(holdDeadline, loc)}، ${formatTime(holdDeadline, loc)}`
                    : `${formatDate(holdDeadline, loc)}, ${formatTime(holdDeadline, loc)}`,
              })}
              minutesLeftTemplate={t.raw('minutesLeft')}
            />
          )}
        </header>
      </MountFade>

      <section
        className="border-sarat-black/8 rounded-card mt-8 flex flex-col gap-3 [border-width:0.5px] p-6"
        aria-label={t('summaryLabel')}
      >
        <dl className="grid gap-3 sm:grid-cols-2">
          {summary.map((row) => (
            <div key={row.label} className="flex flex-col gap-1">
              <dt className="text-sarat-black-600 text-sm">{row.label}</dt>
              <dd className="text-base font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>
        <div className="border-sarat-black/8 [border-top-width:0.5px] pt-4">
          <PromoCodeField
            reference={reference}
            slug={experienceSlug ?? ''}
            locale={loc}
            appliedCode={booking.promoCode}
            copy={promoCopy}
          />
        </div>
      </section>

      {experienceSlug && (
        <Link
          // Carry the held choices back so the form opens pre-filled —
          // changing a date must not mean re-entering everything.
          href={`/experiences/${experienceSlug}?date=${booking.date}&party=${booking.partySize}`}
          className="text-sarat-black-600 hover:text-sarat-black mt-4 inline-flex items-center gap-2 text-sm transition-colors duration-200"
        >
          <ArrowLeft className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
          {t('editBooking')}
        </Link>
      )}

      <section className="mt-8">
        <PaymentDetailsForm
          reference={reference}
          locale={loc}
          slug={experienceSlug ?? ''}
          copy={copy}
          defaults={defaults}
        />
      </section>

      {/* Secure-checkout reassurance — PCI posture in plain language plus
          the accepted schemes as the real brand marks (same badges as the
          footer, mirroring the card logos the widget shows). */}
      <section className="border-sarat-black/8 mt-8 flex flex-col gap-3 [border-top-width:0.5px] pt-6">
        <p className="text-sarat-black-600 inline-flex items-start gap-2 text-sm leading-relaxed">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t('secureNote')}
        </p>
        <div className="ms-6 flex flex-col gap-2">
          <p className="text-sarat-black-600 text-sm">{t('acceptedMethods')}</p>
          <PaymentMarks
            label={tFooter('paymentsLabel')}
            names={{
              mada: tFooter('brandMada'),
              visa: tFooter('brandVisa'),
              mastercard: tFooter('brandMastercard'),
              applePay: tFooter('brandApplePay'),
            }}
          />
        </div>
      </section>
    </article>
  );
}
