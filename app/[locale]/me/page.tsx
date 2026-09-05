import type { Metadata } from 'next';
import { ArrowRight, Star } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SITE_URL } from '@/lib/site';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Avatar } from '@/components/ui/avatar';
import { Stagger, StaggerItem } from '@/components/ui/motion';
import { Compass } from 'lucide-react';
import { ExperienceCard } from '@/features/experiences/components/experience-card';
import { WishlistButton } from '@/features/wishlist/components/wishlist-button';
import { getWishlistExperiences } from '@/features/wishlist/queries';
import { getLastBookingView } from '@/features/account/queries';
import { getMyProfile } from '@/features/account/profile/queries';
import { getBookingsForGuest } from '@/features/bookings/queries';
import { BookingHistory } from '@/features/account/profile/components/booking-history';
import { BookingStatusBadge } from '@/features/bookings/components/booking-status-badge';
import { CheckoutProgress } from '@/features/payments/components/checkout-progress';
import { checkoutJourneyStep } from '@/features/bookings/lib/checkout-journey';
import { buildBookingStatusLabels } from '@/features/bookings/lib/status-labels';
import { ReviewForm } from '@/features/reviews/components/review-form';
import { toArabicText } from '@/features/experiences/lib/arabic-content';
import { formatDate, formatInteger } from '@/lib/format';
import { startInstant } from '@/features/bookings/lib/cancellation';
import { Price } from '@/components/ui/price';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'me.meta' });
  const title = t('title');
  const tSite = await getTranslations({ locale, namespace: 'siteMeta' });
  return {
    title,
    // Per-guest state — never indexed.
    robots: { index: false, follow: false },
    // Personal pages still get pasted into chats, so the preview should
    // name the page. Generic copy only — never per-guest state. Declaring
    // openGraph replaces the parent's resolved block wholesale, so the
    // [locale]-level brand card must be re-attached explicitly.
    openGraph: {
      title,
      description: tSite('description'),
      images: [{ url: `${SITE_URL}/${locale}/opengraph-image`, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: tSite('description'),
      images: [`${SITE_URL}/${locale}/opengraph-image`],
    },
  };
}

export default async function MePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;

  const [wishlist, lastBooking, profile, t, tp, tSteps] = await Promise.all([
    getWishlistExperiences(),
    getLastBookingView(),
    getMyProfile(),
    getTranslations('me'),
    getTranslations('me.profile'),
    getTranslations('payment.steps'),
  ]);
  const stepsCopy = {
    label: tSteps('label'),
    details: tSteps('details'),
    payment: tSteps('payment'),
    confirmed: tSteps('confirmed'),
  };
  // Journey stepper for the last-booking card — same live-checkout rule
  // as the history rows (null for settled/terminal states).
  const lastBookingStep = lastBooking?.booking
    ? checkoutJourneyStep({
        status: lastBooking.booking.status,
        paymentStatus: lastBooking.booking.paymentStatus,
        paymentDeadline: lastBooking.booking.paymentDeadline,
        now: new Date(),
      })
    : null;

  // Full history for signed-in guests — the hub must reach every booking,
  // not just the cookie-hinted last one (which can expire or point at a
  // different device's booking).
  const allBookings = profile ? await getBookingsForGuest(profile.id) : [];
  // The last-booking card above already shows this one in full.
  const earlierBookings = allBookings.filter((b) => b.reference !== lastBooking?.hint.reference);

  const eyebrowClassName = cn(
    'text-sarat-black-600 font-medium text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  const hasAnything = wishlist.length > 0 || lastBooking !== null || allBookings.length > 0;

  const statusLabels = buildBookingStatusLabels(tp);

  return (
    <div className="flex flex-col">
      <section className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-24">
        <div className="flex max-w-3xl flex-col gap-6">
          <p className={eyebrowClassName}>{t('eyebrow')}</p>
          <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-6xl">
            {t('title')}
          </h1>
          <p className="text-sarat-black-600 max-w-2xl text-lg leading-relaxed">
            {profile ? (hasAnything ? t('intro') : t('introEmpty')) : t('introSignedOut')}
          </p>
          {/* Signed out: the hub can only show what this device's cookies
              hint at, so say so and offer the way in — "Nothing here yet"
              told a returning guest on a new phone that their bookings
              didn't exist (2026-09 UX audit P1-4). */}
          {!profile && (
            <div className="mt-2 flex flex-wrap gap-3">
              <Link
                href="/sign-in?next=/me"
                className={cn(buttonVariants({ variant: 'primary', size: 'lg' }))}
              >
                {t('signInCta')}
              </Link>
              {!hasAnything && (
                <Link
                  href="/experiences"
                  className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }))}
                >
                  {t('emptyCta')}
                </Link>
              )}
            </div>
          )}
          {profile && (
            <div className="border-sarat-black/8 rounded-card mt-2 flex flex-wrap items-center gap-x-6 gap-y-6 [border-width:0.5px] p-6 sm:p-6">
              <Avatar name={profile.name} src={profile.avatarUrl ?? undefined} size="lg" />
              <div className="flex min-w-0 flex-1 basis-48 flex-col gap-1">
                <span className="font-display truncate text-xl font-medium tracking-[-0.02em]">
                  {profile.name}
                </span>
                {/* Phone (or email) stays LTR-isolated so it reads correctly in RTL. */}
                {(profile.phone || profile.email) && (
                  <span className="text-sarat-black-600 truncate text-sm" dir="ltr">
                    {profile.phone ?? profile.email}
                  </span>
                )}
                <div className="text-sarat-black-600 mt-1 flex flex-wrap items-center gap-x-2 text-sm">
                  <span>
                    {t('statBookings')}{' '}
                    <span className="text-sarat-black font-medium">
                      {formatInteger(allBookings.length, loc)}
                    </span>
                  </span>
                  <span aria-hidden>·</span>
                  <span>
                    {t('statSaved')}{' '}
                    <span className="text-sarat-black font-medium">
                      {formatInteger(wishlist.length, loc)}
                    </span>
                  </span>
                </div>
              </div>
              <Link
                href="/me/profile"
                className={cn(buttonVariants({ variant: 'secondary', size: 'md' }))}
              >
                {t('editProfile')}
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* The empty state is for a signed-in guest with nothing yet; signed
          out, the sign-in prompt above is the whole message (one empty
          state, not two stacked ones). */}
      {profile && !hasAnything && (
        <section className="border-sarat-black/8 [border-top-width:0.5px]">
          <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
            <EmptyState
              icon={Compass}
              eyebrow={t('emptyEyebrow')}
              title={t('emptyTitle')}
              description={t('emptyDescription')}
              action={
                <Link
                  href="/experiences"
                  className={cn(buttonVariants({ variant: 'primary', size: 'lg' }))}
                >
                  {t('emptyCta')}
                </Link>
              }
            />
          </div>
        </section>
      )}

      {lastBooking && (
        <section className="border-sarat-black/8 [border-top-width:0.5px]">
          <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
            <div className="mb-8 flex flex-col gap-2">
              <p className={eyebrowClassName}>{t('lastBookingEyebrow')}</p>
              <h2 className="font-display text-3xl font-medium tracking-[-0.03em]">
                {lastBooking.experience
                  ? loc === 'ar'
                    ? lastBooking.experience.titleAr
                    : lastBooking.experience.titleEn
                  : t('lastBookingFallbackTitle')}
              </h2>
              {lastBooking.experience && (
                <p className="text-sarat-black-600 text-base">
                  {loc === 'ar'
                    ? toArabicText(lastBooking.experience.placeName)
                    : lastBooking.experience.placeName}
                </p>
              )}
            </div>

            <div className="border-sarat-black/8 rounded-card flex flex-col gap-4 [border-width:0.5px] p-6">
              {lastBookingStep !== null && (
                <CheckoutProgress
                  steps={[stepsCopy.details, stepsCopy.payment, stepsCopy.confirmed]}
                  current={lastBookingStep}
                  label={stepsCopy.label}
                  locale={loc}
                />
              )}
              <p className={eyebrowClassName}>{t('referenceLabel')}</p>
              {/* Human reference (GH-XXXXXX); UUID only when the row is
                  unavailable (no-DB preview). */}
              <p
                className="font-display text-2xl font-medium tracking-[0.04em] break-all"
                dir="ltr"
              >
                {lastBooking.booking?.referenceCode ?? lastBooking.hint.reference}
              </p>

              {lastBooking.booking && (
                <dl className="mt-2 grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <dt className="text-sarat-black-600 text-sm">{t('statusLabel')}</dt>
                    {/* Semantic tone (BRIEF §3) — pending amber vs confirmed
                        green is the one thing a guest checks here. */}
                    <dd className="flex">
                      <BookingStatusBadge
                        status={lastBooking.booking.status}
                        label={t(`status.${lastBooking.booking.status}`)}
                      />
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1">
                    <dt className="text-sarat-black-600 text-sm">{t('dateLabel')}</dt>
                    <dd className="text-base font-medium">
                      {formatDate(
                        startInstant(lastBooking.booking.date, lastBooking.booking.startTime),
                        loc,
                      )}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1">
                    <dt className="text-sarat-black-600 text-sm">{t('partyLabel')}</dt>
                    <dd className="text-base font-medium">
                      {formatInteger(lastBooking.booking.partySize, loc)}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1">
                    <dt className="text-sarat-black-600 text-sm">{t('totalLabel')}</dt>
                    <dd className="text-base font-medium">
                      <Price amount={lastBooking.booking.totalAmountSar} locale={loc} />
                    </dd>
                  </div>
                </dl>
              )}

              <div className="mt-2 flex flex-wrap gap-3">
                <Link
                  href={`/book/confirmed/${lastBooking.hint.reference}?slug=${encodeURIComponent(lastBooking.hint.experienceSlug)}`}
                  className={cn(
                    buttonVariants({ variant: 'primary', size: 'md' }),
                    'inline-flex items-center gap-2',
                  )}
                >
                  {t('viewConfirmation')}
                  <ArrowRight className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
                </Link>
                {lastBooking.experience && (
                  <Link
                    href={`/experiences/${lastBooking.experience.slug}`}
                    className={cn(buttonVariants({ variant: 'secondary', size: 'md' }))}
                  >
                    {t('viewExperience')}
                  </Link>
                )}
              </div>
            </div>

            {lastBooking.booking?.status === 'completed' && (
              <div className="border-sarat-black/8 rounded-card mt-6 flex flex-col gap-4 [border-width:0.5px] p-6">
                {lastBooking.review?.editable ? (
                  // Inside the 24h window the review stays editable —
                  // the form re-submits to updateReview, prefilled.
                  <ReviewForm
                    bookingReference={lastBooking.hint.reference}
                    locale={loc}
                    guestName={profile?.name}
                    mode="edit"
                    initialRating={lastBooking.review.rating}
                    initialText={
                      (loc === 'ar' ? lastBooking.review.textAr : lastBooking.review.textEn) ?? ''
                    }
                    copy={{
                      heading: t('review.editHeading'),
                      ratingLabel: t('review.ratingLabel'),
                      ratingValueLabels: [1, 2, 3, 4, 5].map((n) =>
                        t('review.ratingValue', { rating: n }),
                      ) as [string, string, string, string, string],
                      ratingRequired: t('review.ratingRequired'),
                      commentLabel: t('review.commentLabel'),
                      commentOptional: t('review.commentOptional'),
                      commentPlaceholder: t('review.commentPlaceholder'),
                      submit: t('review.update'),
                      submitting: t('review.updating'),
                      errors: {
                        no_db: t('review.errors.noDb'),
                        not_found: t('review.errors.notFound'),
                        wrong_state: t('review.errors.wrongState'),
                        already_reviewed: t('review.errors.alreadyReviewed'),
                        forbidden: t('review.errors.forbidden'),
                        expired: t('review.errors.expired'),
                        throttled: t('review.errors.throttled'),
                        validation: t('review.errors.validation'),
                        server: t('review.errors.server'),
                      },
                    }}
                  />
                ) : lastBooking.review ? (
                  <div className="flex flex-col gap-3">
                    <p className={eyebrowClassName}>{t('review.reviewedEyebrow')}</p>
                    <div
                      className="flex gap-1"
                      aria-label={t('review.ratingValue', { rating: lastBooking.review.rating })}
                    >
                      {[1, 2, 3, 4, 5].map((value) => (
                        <Star
                          key={value}
                          className={cn(
                            'size-5 fill-current',
                            value <= lastBooking.review!.rating
                              ? 'text-saffron-gold'
                              : 'text-sarat-black/20',
                          )}
                          aria-hidden
                        />
                      ))}
                    </div>
                    {(loc === 'ar' ? lastBooking.review.textAr : lastBooking.review.textEn) && (
                      <p className="text-sarat-black-600 text-base leading-relaxed">
                        {loc === 'ar' ? lastBooking.review.textAr : lastBooking.review.textEn}
                      </p>
                    )}
                  </div>
                ) : (
                  <ReviewForm
                    bookingReference={lastBooking.hint.reference}
                    locale={loc}
                    guestName={profile?.name}
                    copy={{
                      heading: t('review.heading'),
                      ratingLabel: t('review.ratingLabel'),
                      ratingValueLabels: [1, 2, 3, 4, 5].map((n) =>
                        t('review.ratingValue', { rating: n }),
                      ) as [string, string, string, string, string],
                      ratingRequired: t('review.ratingRequired'),
                      commentLabel: t('review.commentLabel'),
                      commentOptional: t('review.commentOptional'),
                      commentPlaceholder: t('review.commentPlaceholder'),
                      submit: t('review.submit'),
                      submitting: t('review.submitting'),
                      errors: {
                        no_db: t('review.errors.noDb'),
                        not_found: t('review.errors.notFound'),
                        wrong_state: t('review.errors.wrongState'),
                        already_reviewed: t('review.errors.alreadyReviewed'),
                        forbidden: t('review.errors.forbidden'),
                        expired: t('review.errors.expired'),
                        throttled: t('review.errors.throttled'),
                        validation: t('review.errors.validation'),
                        server: t('review.errors.server'),
                      },
                    }}
                  />
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {earlierBookings.length > 0 && (
        <section className="border-sarat-black/8 [border-top-width:0.5px]">
          <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
            <div className="mb-8 flex flex-col gap-2">
              <p className={eyebrowClassName}>{t('bookingsEyebrow')}</p>
              <h2 className="font-display text-3xl font-medium tracking-[-0.03em]">
                {t('bookingsTitle')}
              </h2>
            </div>
            <BookingHistory
              bookings={earlierBookings}
              locale={loc}
              copy={{
                partyLabel: tp('history.partyLabel'),
                statusLabels,
                view: tp('history.view'),
                payNow: t('payNow'),
                steps: stepsCopy,
              }}
            />
          </div>
        </section>
      )}

      {wishlist.length > 0 && (
        <section className="border-sarat-black/8 [border-top-width:0.5px]">
          <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
            <div className="mb-8 flex items-baseline justify-between gap-4">
              <h2 className="font-display text-3xl font-medium tracking-[-0.03em]">
                {t('wishlistTitle')}
              </h2>
              <Link
                href="/wishlist"
                className="inline-flex min-h-11 items-center gap-2 text-sm font-medium transition-opacity duration-200 hover:opacity-60"
              >
                {t('wishlistViewAll')}
                <ArrowRight className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
              </Link>
            </div>
            <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {wishlist.slice(0, 6).map((experience) => (
                <StaggerItem key={experience.slug}>
                  <ExperienceCard
                    experience={experience}
                    locale={loc}
                    actions={
                      <WishlistButton
                        slug={experience.slug}
                        isSaved
                        surface={experience.featured ? 'dark' : 'light'}
                      />
                    }
                  />
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>
      )}
    </div>
  );
}
