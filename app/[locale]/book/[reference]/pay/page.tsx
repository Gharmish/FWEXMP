import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, Lock } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { MountFade } from '@/components/ui/motion';
import { hasHyperpay, hasHyperpayApplePay } from '@/lib/env';
import { formatDate, formatInteger, formatSAR, formatTime } from '@/lib/format';
import { Price } from '@/components/ui/price';
import { getBookingByReferenceForViewer } from '@/features/bookings/queries';
import { getStoredBillingForBooking } from '@/features/payments/queries';
import { vatPortionSar, vatRatePercent } from '@/features/bookings/lib/vat';
import { getPlatformSettings } from '@/lib/platform-settings';
import { isHoldExpired } from '@/features/bookings/lib/availability';
import { freeCancellationDeadline } from '@/features/bookings/lib/cancellation';
import { getExperienceBySlug } from '@/features/experiences/queries';
import { hyperpayBaseUrl } from '@/features/payments/lib/hyperpay';
import {
  PaymentDetailsForm,
  type PaymentDetailsCopy,
} from '@/features/payments/components/payment-details-form';
import { PaymentDeadlineNote } from '@/features/payments/components/payment-deadline-note';
import { PromoCodeField } from '@/features/promo-codes/components/promo-code-field';
import { WalletCheckoutField } from '@/features/wallet/components/wallet-checkout-field';
import { getSessionGuestId } from '@/features/wallet/queries';
import { getWalletBalanceSar } from '@/features/wallet/ledger';
import { PaymentMarks } from '@/components/layout/payment-marks';
import { cn } from '@/lib/utils';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PageParams {
  params: Promise<{ locale: string; reference: string }>;
  searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'payment.meta' });
  return {
    title: t('title'),
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

  // Wallet credit is strictly session-owned — a cookie-only viewer can
  // pay, but never sees another account's balance. Balance is read at
  // render; the apply action re-reads it under lock, so staleness here
  // only affects the button label, never the money.
  const sessionGuestId = await getSessionGuestId();
  const walletOwner = sessionGuestId !== null && sessionGuestId === booking.guestId;
  const walletBalanceSar =
    walletOwner && booking.walletAppliedSar === 0 ? await getWalletBalanceSar(booking.guestId) : 0;
  const showWalletField = walletOwner && (walletBalanceSar > 0 || booking.walletAppliedSar > 0);

  // Platform settings feed the VAT disclosure in the summary below.
  const { vatEnabled, vatRateBps } = await getPlatformSettings();

  // The consent line links to the generic policy page; this note states
  // what the policy means for THIS booking, from its own cancellation-
  // policy snapshot (the tier's full-refund window at booking time).
  const freeCancelUntil = freeCancellationDeadline(
    booking.date,
    booking.startTime,
    booking.policy.freeCancelHours,
  );
  const cancellationNote =
    new Date().getTime() < freeCancelUntil.getTime()
      ? t('cancellationFreeUntil', {
          deadline:
            loc === 'ar'
              ? `${formatDate(freeCancelUntil, loc)}، ${formatTime(freeCancelUntil, loc)}`
              : `${formatDate(freeCancelUntil, loc)}, ${formatTime(freeCancelUntil, loc)}`,
        })
      : t('cancellationInsideWindow');

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
    cancellationNote,
    payHeading: t('payHeading'),
    // The widget's pay button carries the exact charged amount — by the
    // time the guest reaches it, the summary total is screens away.
    payAmount: t('payAmount', { amount: formatSAR(booking.totalAmountSar, loc) }),
    widgetLoading: t('widgetLoading'),
    widgetError: t('widgetError'),
    widgetRetry: t('widgetRetry'),
    methodHeading: t('methodHeading'),
    methodApplePay: t('methodApplePay'),
    methodCard: t('methodCard'),
    changeMethod: t('changeMethod'),
  };

  const promoCopy = {
    label: t('promo.label'),
    placeholder: t('promo.placeholder'),
    apply: t('promo.apply'),
    applying: t('promo.applying'),
    appliedPrefix: t('promo.appliedPrefix'),
    remove: t('promo.remove'),
    removing: t('promo.removing'),
    creditReleased: t('promo.creditReleased'),
    // Raw template — `{min}` is only known client-side after promo
    // validation; PromoCodeField substitutes it (formatting it here would
    // throw a FORMATTING_ERROR for the missing variable).
    errorBelowMin: t.raw('promo.errorBelowMin'),
    errors: {
      invalid: t('promo.errors.invalid'),
      too_many: t('promo.errors.tooMany'),
      exhausted: t('promo.errors.exhausted'),
      already_used: t('promo.errors.alreadyUsed'),
      already_paid: t('promo.errors.alreadyPaid'),
      checkout_in_progress: t('promo.errors.checkoutInProgress'),
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

  // The booking's facts (date/time/guests) render as a two-column grid;
  // the experience itself gets a thumbnail header and the money gets its
  // own emphasized block — three visual tiers instead of one flat list.
  const startsAt = new Date(`${booking.date}T${booking.startTime}:00`);
  const facts: Array<{ label: string; value: string }> = [
    { label: t('dateLabel'), value: formatDate(startsAt, loc) },
    { label: t('timeLabel'), value: formatTime(startsAt, loc) },
    { label: t('partyLabel'), value: formatInteger(booking.partySize, loc) },
  ];

  return (
    <article className="mx-auto w-full max-w-6xl px-6 py-16">
      {/* Entrance on the header only. The HyperPay widget below stays
          motion-free: payment must read rock-solid, and iframes repaint
          badly under transforms. */}
      <MountFade eager>
        <header className="flex max-w-2xl flex-col gap-3">
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
              hoursLeftTemplate={t.raw('hoursLeft')}
              hoursOnlyLeftTemplate={t.raw('hoursOnlyLeft')}
            />
          )}
        </header>
      </MountFade>

      {/* Two-column checkout ≥lg (checkout-audit P1): form on the inline-
          start side, order summary as a sticky rail on the inline-end side
          so the total stays on screen at the moment of payment. On mobile
          the summary leads (DOM order), as before. Grid columns follow the
          writing direction, so RTL mirrors without extra rules. */}
      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-12">
        <aside className="flex flex-col lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1">
          <section
            className="border-sarat-black/8 rounded-card flex flex-col gap-4 [border-width:0.5px] p-6"
            aria-label={t('summaryLabel')}
          >
            {title && (
              <div className="flex items-center gap-4">
                {experience?.heroImage && (
                  <Image
                    src={experience.heroImage}
                    alt=""
                    width={128}
                    height={128}
                    className="rounded-image size-16 shrink-0 object-cover"
                  />
                )}
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sarat-black-600 text-sm">{t('experienceLabel')}</span>
                  <span className="text-base font-medium">{title}</span>
                </div>
              </div>
            )}
            <dl
              className={cn(
                'grid grid-cols-2 gap-3',
                title && 'border-sarat-black/8 [border-top-width:0.5px] pt-4',
              )}
            >
              {facts.map((row) => (
                <div key={row.label} className="flex flex-col gap-1">
                  <dt className="text-sarat-black-600 text-sm">{row.label}</dt>
                  <dd className="text-base font-medium">{row.value}</dd>
                </div>
              ))}
            </dl>
            <div className="border-sarat-black/8 flex flex-col gap-2 [border-top-width:0.5px] pt-4">
              {/* A promo or applied credit shows as subtotal (full base) +
                  reduction lines above the charged total. `totalAmountSar`
                  is always the amount the card is charged. */}
              {(booking.discountSar > 0 || booking.walletAppliedSar > 0) && (
                <p className="flex items-baseline justify-between gap-4 text-sm">
                  <span className="text-sarat-black-600">{t('subtotalLabel')}</span>
                  <Price
                    amount={booking.totalAmountSar + booking.discountSar + booking.walletAppliedSar}
                    locale={loc}
                  />
                </p>
              )}
              {booking.discountSar > 0 && (
                <p className="text-juniper-green-800 flex items-baseline justify-between gap-4 text-sm">
                  <span>
                    {booking.promoCode
                      ? t('promo.discountLabel', { code: booking.promoCode })
                      : t('promo.discountLabelGeneric')}
                  </span>
                  <span>
                    −<Price amount={booking.discountSar} locale={loc} />
                  </span>
                </p>
              )}
              {booking.walletAppliedSar > 0 && (
                <p className="text-juniper-green-800 flex items-baseline justify-between gap-4 text-sm">
                  <span>{t('walletCredit.summaryLabel')}</span>
                  <span>
                    −<Price amount={booking.walletAppliedSar} locale={loc} />
                  </span>
                </p>
              )}
              <p className="flex items-baseline justify-between gap-4 text-base font-medium">
                <span>{t('totalLabel')}</span>
                <Price amount={booking.totalAmountSar} locale={loc} className="text-lg" />
              </p>
              {/* Prices are VAT-inclusive — while the platform VAT toggle is
                  on, this pre-payment step discloses the portion the
                  settlement will stamp. Never add on top; never mention VAT
                  while the toggle is off. */}
              {vatEnabled && (
                <p className="text-sarat-black-600 flex items-baseline justify-between gap-4 text-sm">
                  <span>{t('vatIncludedLabel', { pct: vatRatePercent(vatRateBps) })}</span>
                  <Price amount={vatPortionSar(booking.totalAmountSar, vatRateBps)} locale={loc} />
                </p>
              )}
            </div>
            {showWalletField && (
              <div className="border-sarat-black/8 [border-top-width:0.5px] pt-4">
                <WalletCheckoutField
                  reference={reference}
                  locale={loc}
                  balanceSar={walletBalanceSar}
                  appliedSar={booking.walletAppliedSar}
                  copy={{
                    // Raw template — `{amount}` is substituted client-side
                    // (same trap as promo.errorBelowMin: formatting it here
                    // would throw for the missing variable).
                    available: t.raw('walletCredit.available'),
                    apply: t('walletCredit.apply'),
                    applying: t('walletCredit.applying'),
                    appliedPrefix: t('walletCredit.appliedPrefix'),
                    remove: t('walletCredit.remove'),
                    removing: t('walletCredit.removing'),
                    errors: {
                      nothing_to_apply: t('walletCredit.errors.nothingToApply'),
                      already_paid: t('walletCredit.errors.alreadyPaid'),
                      unavailable: t('walletCredit.errors.unavailable'),
                      not_found: t('walletCredit.errors.notFound'),
                      validation: t('walletCredit.errors.validation'),
                      no_db: t('walletCredit.errors.noDb'),
                      server: t('walletCredit.errors.server'),
                    },
                  }}
                />
              </div>
            )}
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
        </aside>

        <div className="lg:col-start-1 lg:row-start-1">
          {/* Warm up the COPYandPAY origin while the guest fills the form —
              the widget script is injected client-side after hydration, so
              without this the DNS+TLS handshake happens serially at the worst
              moment. React hoists <link> into <head>. */}
          {hasHyperpay() && <link rel="preconnect" href={new URL(hyperpayBaseUrl()).origin} />}

          <PaymentDetailsForm
            reference={reference}
            locale={loc}
            slug={experienceSlug ?? ''}
            totalSar={booking.totalAmountSar}
            copy={copy}
            applePayEnabled={hasHyperpayApplePay()}
            defaults={defaults}
          />

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
        </div>
      </div>
    </article>
  );
}
