import type { Metadata } from 'next';
import { ArrowRight } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { ExperienceCard } from '@/features/experiences/components/experience-card';
import { WishlistButton } from '@/features/wishlist/components/wishlist-button';
import { getWishlistExperiences } from '@/features/wishlist/queries';
import { getLastBookingView } from '@/features/account/queries';
import { toArabicText } from '@/features/experiences/lib/arabic-content';
import { formatDate, formatInteger, formatSAR } from '@/lib/format';

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

  const [wishlist, lastBooking, t] = await Promise.all([
    getWishlistExperiences(),
    getLastBookingView(),
    getTranslations('me'),
  ]);

  const eyebrowClassName = cn(
    'text-sarat-black-600 text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  const hasAnything = wishlist.length > 0 || lastBooking !== null;

  return (
    <div className="flex flex-col">
      <section className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-24">
        <div className="flex max-w-3xl flex-col gap-5">
          <p className={eyebrowClassName}>{t('eyebrow')}</p>
          <h1 className="font-display text-4xl font-medium tracking-[-0.035em] text-balance sm:text-6xl">
            {t('title')}
          </h1>
          <p className="text-sarat-black-600 max-w-2xl text-lg leading-relaxed">
            {hasAnything ? t('intro') : t('introEmpty')}
          </p>
        </div>
      </section>

      {!hasAnything && (
        <section className="border-sarat-black/8 [border-top-width:0.5px]">
          <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
            <div className="border-sarat-black/8 rounded-card flex flex-col items-start gap-6 [border-width:0.5px] p-10">
              <p className={eyebrowClassName}>{t('emptyEyebrow')}</p>
              <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
                {t('emptyTitle')}
              </h2>
              <p className="text-sarat-black-600 max-w-xl text-base">{t('emptyDescription')}</p>
              <Link
                href="/experiences"
                className={cn(buttonVariants({ variant: 'primary', size: 'lg' }))}
              >
                {t('emptyCta')}
              </Link>
            </div>
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
              <p className="font-display text-2xl font-medium tracking-[-0.025em] break-all">
                {lastBooking.hint.reference}
              </p>

              {lastBooking.booking && (
                <dl className="mt-2 grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-sarat-black-600 text-sm">{t('statusLabel')}</dt>
                    <dd className="text-base font-medium">
                      {t(`status.${lastBooking.booking.status}`)}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-sarat-black-600 text-sm">{t('dateLabel')}</dt>
                    <dd className="text-base font-medium">
                      {formatDate(
                        new Date(`${lastBooking.booking.date}T${lastBooking.booking.startTime}:00`),
                        loc,
                      )}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-sarat-black-600 text-sm">{t('partyLabel')}</dt>
                    <dd className="text-base font-medium">
                      {formatInteger(lastBooking.booking.partySize, loc)}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-sarat-black-600 text-sm">{t('totalLabel')}</dt>
                    <dd className="text-base font-medium">
                      {formatSAR(lastBooking.booking.totalAmountSar, loc)}
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
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {wishlist.slice(0, 6).map((experience) => (
                <ExperienceCard
                  key={experience.slug}
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
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
