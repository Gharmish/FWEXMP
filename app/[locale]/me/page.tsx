import type { Metadata } from 'next';
import { ArrowRight, Star } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
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
import { buildBookingStatusLabels } from '@/features/bookings/lib/status-labels';
import { ReviewForm } from '@/features/reviews/components/review-form';
import { toArabicText } from '@/features/experiences/lib/arabic-content';
import { formatDate, formatInteger } from '@/lib/format';
import { Price } from '@/components/ui/price';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const title = locale === 'ar' ? 'حسابك' : 'Your activity';
  return {
    title,
    // Per-guest state — never indexed.
    robots: { index: false, follow: false },
  };
}

export default async function MePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;

  const [wishlist, lastBooking, profile, t, tp] = await Promise.all([
    getWishlistExperiences(),
    getLastBookingView(),
    getMyProfile(),
    getTranslations('me'),
    getTranslations('me.profile'),
  ]);

  // Full history for signed-in guests — the hub must reach every booking,
  // not just the cookie-hinted last one (which can expire or point at a
  // different device's booking).
  const allBookings = profile ? await getBookingsForGuest(profile.id) : [];
  // The last-booking card above already shows this one in full.
  const earlierBookings = allBookings.filter((b) => b.reference !== lastBooking?.hint.reference);

  const eyebrowClassName = cn(
    'text-sarat-black-600 text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  const hasAnything = wishlist.length > 0 || lastBooking !== null || allBookings.length > 0;

  const statusLabels = buildBookingStatusLabels(tp);

  return (
    <div className="flex flex-col">
      <section className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-24">
        <div className="flex max-w-3xl flex-col gap-5">
          <p className={eyebrowClassName}>{t('eyebrow')}</p>
          <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-6xl">
            {t('title')}
          </h1>
          <p className="text-sarat-black-600 max-w-2xl text-lg leading-relaxed">
            {hasAnything ? t('intro') : t('introEmpty')}
          </p>
          {profile && (
            <div className="border-sarat-black/8 rounded-card mt-2 flex items-center gap-4 [border-width:0.5px] p-4">
              <Avatar name={profile.name} src={profile.avatarUrl ?? undefined} size="md" />
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{profile.name}</span>
                {/* Phone (or email) stays LTR-isolated so it reads correctly in RTL. */}
                {(profile.phone || profile.email) && (
                  <span className="text-sarat-black-600 truncate text-sm" dir="ltr">
                    {profile.phone ?? profile.email}
                  </span>
                )}
              </div>
              <Link
                href="/me/profile"
                className="ms-auto inline-flex min-h-11 items-center text-sm font-medium whitespace-nowrap transition-opacity duration-200 hover:opacity-60"
              >
                {t('viewProfile')}
              </Link>
            </div>
          )}
        </div>
      </section>

      {!hasAnything && (
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
                    <dd className="text-base font-medium">
                      {t(`status.${lastBooking.booking.status}`)}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1">
                    <dt className="text-sarat-black-600 text-sm">{t('dateLabel')}</dt>
                    <dd className="text-base font-medium">
                      {formatDate(
                        new Date(`${lastBooking.booking.date}T${lastBooking.booking.startTime}:00`),
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
