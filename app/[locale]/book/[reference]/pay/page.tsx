import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/lib/i18n';
import { hasHyperpay } from '@/lib/env';
import { formatDate, formatInteger } from '@/lib/format';
import { Price } from '@/components/ui/price';
import { getBookingByReference } from '@/features/bookings/queries';
import { getExperienceBySlug } from '@/features/experiences/queries';
import {
  PaymentDetailsForm,
  type PaymentDetailsCopy,
} from '@/features/payments/components/payment-details-form';

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

  const booking = await getBookingByReference(reference);
  if (!booking) redirect(confirmedHref);
  if (booking.paymentStatus === 'paid') redirect(confirmedHref);

  const experienceSlug = booking.experienceSlug ?? slugFromQuery;
  const experience = experienceSlug ? await getExperienceBySlug(experienceSlug) : undefined;
  const title = experience ? (loc === 'ar' ? experience.titleAr : experience.titleEn) : null;

  const t = await getTranslations('payment');
  const copy: PaymentDetailsCopy = {
    heading: t('detailsHeading'),
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
    invalid: t('invalid'),
    errorValidation: t('errorValidation'),
    errorServer: t('errorServer'),
    errorUnavailable: t('errorUnavailable'),
    errorNotFound: t('errorNotFound'),
    errorAlreadyPaid: t('errorAlreadyPaid'),
    payHeading: t('payHeading'),
    widgetLoading: t('widgetLoading'),
  };

  const summary: Array<{ label: string; value: ReactNode }> = [];
  if (title) summary.push({ label: t('experienceLabel'), value: title });
  summary.push({
    label: t('dateLabel'),
    value: formatDate(new Date(`${booking.date}T${booking.startTime}:00`), loc),
  });
  summary.push({ label: t('partyLabel'), value: formatInteger(booking.partySize, loc) });
  summary.push({
    label: t('totalLabel'),
    value: <Price amount={booking.totalAmountSar} locale={loc} />,
  });

  return (
    <article className="mx-auto w-full max-w-2xl px-6 py-16">
      <header className="flex flex-col gap-3">
        <p className="text-juniper-green-800 text-[11px] tracking-[0.2em] uppercase">
          {t('eyebrow')}
        </p>
        <h1 className="font-display text-4xl font-medium tracking-[-0.035em] text-balance">
          {t('title')}
        </h1>
        <p className="text-sarat-black-600 text-lg leading-relaxed">{t('intro')}</p>
      </header>

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
      </section>

      <p className="text-sarat-black-600 mt-6 text-sm">{t('madaFirst')}</p>

      <section className="mt-4">
        <PaymentDetailsForm
          reference={reference}
          locale={loc}
          slug={experienceSlug ?? ''}
          copy={copy}
        />
      </section>
    </article>
  );
}
