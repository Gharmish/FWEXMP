import type { Metadata } from 'next';
import { Compass } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link, redirect } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { getMyProfile } from '@/features/account/profile/queries';
import { getMyWalletBalanceSar } from '@/features/wallet/queries';
import {
  getDisputesFiledByGuest,
  getReviewsWrittenByGuest,
} from '@/features/account/profile/activity';
import { getBookingsForGuest } from '@/features/bookings/queries';
import { ProfileForm } from '@/features/account/profile/components/profile-form';
import { AvatarUpload } from '@/features/account/profile/components/avatar-upload';
import { WalletCard } from '@/features/account/profile/components/wallet-card';
import { PaymentMethodsSection } from '@/features/account/profile/components/payment-methods-section';
import { BookingHistory } from '@/features/account/profile/components/booking-history';
import { buildBookingStatusLabels } from '@/features/bookings/lib/status-labels';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'me.profile.meta' });
  return {
    title: t('title'),
    // Per-guest state — never indexed.
    robots: { index: false, follow: false },
  };
}

const sectionTitle = 'font-display text-xl font-medium tracking-[-0.02em]';

export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;

  const profile = await getMyProfile();
  if (!profile) {
    redirect({ href: '/sign-in?next=/me/profile', locale: loc });
  }

  const [bookings, reviewsWritten, disputesFiled, walletBalanceSar, t] = await Promise.all([
    getBookingsForGuest(profile.id),
    getReviewsWrittenByGuest(profile.id, loc),
    getDisputesFiledByGuest(profile.id),
    getMyWalletBalanceSar(profile.id),
    getTranslations('me.profile'),
  ]);

  const eyebrowClassName = cn(
    'text-sarat-black-600 text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  const statusLabels = buildBookingStatusLabels(t);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-14 sm:py-20">
      {/* Page heading */}
      <header className="flex flex-col gap-2">
        <p className={eyebrowClassName}>{t('eyebrow')}</p>
        <h1 className="font-display text-3xl font-semibold tracking-[-0.035em] text-balance sm:text-4xl">
          {t('title')}
        </h1>
      </header>

      {/* Identity */}
      <Card className="p-6 sm:p-8">
        <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:items-center sm:gap-6 sm:text-start">
          <Avatar
            name={profile.name}
            src={profile.avatarUrl ?? undefined}
            size="lg"
            className="size-24 text-2xl"
          />
          <div className="flex flex-1 flex-col items-center gap-4 sm:items-start">
            <div className="flex flex-col gap-1">
              <p className="font-display text-2xl font-medium tracking-[-0.025em]">
                {profile.name}
              </p>
              {/* Phone (or email for email-OTP users) — LTR-isolated so +966
                  and addresses read correctly inside an RTL layout. */}
              {(profile.phone || profile.email) && (
                <p className="text-sarat-black-600 text-sm" dir="ltr">
                  {profile.phone ?? profile.email}
                </p>
              )}
            </div>
            <AvatarUpload
              avatarUrl={profile.avatarUrl}
              copy={{
                change: t('photo.change'),
                uploading: t('photo.uploading'),
                remove: t('photo.remove'),
                removing: t('photo.removing'),
                hint: t('photo.hint'),
                errors: {
                  no_db: t('photo.errors.noDb'),
                  no_auth: t('photo.errors.noAuth'),
                  no_storage: t('photo.errors.noStorage'),
                  no_file: t('photo.errors.noFile'),
                  invalid_type: t('photo.errors.invalidType'),
                  too_large: t('photo.errors.tooLarge'),
                  server: t('photo.errors.server'),
                },
              }}
            />
          </div>
        </div>
      </Card>

      {/* Personal details */}
      <Card className="flex flex-col gap-6 p-6 sm:p-8">
        <h2 className={sectionTitle}>{t('details.title')}</h2>
        <ProfileForm
          profile={profile}
          copy={{
            nameLabel: t('details.nameLabel'),
            emailLabel: t('details.emailLabel'),
            emailOptional: t('details.emailOptional'),
            languageLabel: t('details.languageLabel'),
            submit: t('details.submit'),
            submitting: t('details.submitting'),
            saved: t('details.saved'),
            nameError: t('details.nameError'),
            emailError: t('details.emailError'),
            errors: {
              no_db: t('details.errors.noDb'),
              no_auth: t('details.errors.noAuth'),
              validation: t('details.errors.validation'),
              server: t('details.errors.server'),
            },
          }}
        />
      </Card>

      {/* Wallet + payment methods */}
      <div className="grid items-stretch gap-6 sm:grid-cols-2">
        <WalletCard
          locale={loc}
          balanceSar={walletBalanceSar}
          copy={{
            title: t('wallet.title'),
            balanceLabel: t('wallet.balanceLabel'),
            note: t('wallet.note'),
          }}
        />
        <Card className="flex flex-col gap-6 p-6 sm:p-8">
          <h2 className={sectionTitle}>{t('payment.title')}</h2>
          <PaymentMethodsSection
            copy={{
              emptyTitle: t('payment.emptyTitle'),
              emptyDescription: t('payment.emptyDescription'),
            }}
          />
        </Card>
      </div>

      {/* Booking history */}
      <Card className="flex flex-col gap-6 p-6 sm:p-8">
        <h2 className={sectionTitle}>{t('history.title')}</h2>
        {bookings.length > 0 ? (
          <BookingHistory
            bookings={bookings}
            locale={loc}
            copy={{
              partyLabel: t('history.partyLabel'),
              statusLabels,
              view: t('history.view'),
            }}
          />
        ) : (
          <div className="flex flex-1 flex-col gap-3">
            <span className="bg-sarat-black/5 flex size-10 items-center justify-center rounded-full">
              <Compass className="text-sarat-black-600 size-5 shrink-0" aria-hidden />
            </span>
            <div className="flex flex-col gap-1">
              <p className="font-medium">{t('history.emptyTitle')}</p>
              <p className="text-sarat-black-600 text-sm leading-relaxed">
                {t('history.emptyDescription')}
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* Reviews written */}
      <Card className="flex flex-col gap-6 p-6 sm:p-8">
        <h2 className={sectionTitle}>{t('reviews.title')}</h2>
        {reviewsWritten.length === 0 ? (
          <p className="text-sarat-black-600 text-sm leading-relaxed">{t('reviews.empty')}</p>
        ) : (
          <ul className="border-sarat-black/8 rounded-card flex flex-col divide-y divide-[var(--color-sarat-black)]/8 [border-width:0.5px]">
            {reviewsWritten.map((r) => (
              <li key={r.id} className="flex flex-col gap-1 p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm font-medium">
                    {t('reviews.ratingValue', { rating: r.rating })}
                  </span>
                  <Link
                    href={`/experiences/${r.experienceSlug}`}
                    className="text-sarat-black-600 text-sm underline-offset-4 hover:underline"
                  >
                    {r.experienceTitle}
                  </Link>
                  {r.hidden && (
                    <Badge className="bg-al-qatt-red/15 text-al-qatt-red">
                      {t('reviews.hidden')}
                    </Badge>
                  )}
                </div>
                {r.text && <p className="text-sm leading-relaxed">{r.text}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Disputes filed */}
      <Card className="flex flex-col gap-6 p-6 sm:p-8">
        <h2 className={sectionTitle}>{t('disputes.title')}</h2>
        {disputesFiled.length === 0 ? (
          <p className="text-sarat-black-600 text-sm leading-relaxed">{t('disputes.empty')}</p>
        ) : (
          <ul className="border-sarat-black/8 rounded-card flex flex-col divide-y divide-[var(--color-sarat-black)]/8 [border-width:0.5px]">
            {disputesFiled.map((d) => (
              <li key={d.id} className="flex flex-col gap-1 p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-sm" dir="ltr">
                    {d.bookingReference}
                  </span>
                  <Badge
                    className={
                      d.status === 'open'
                        ? 'bg-saffron-gold/20 text-sarat-black'
                        : 'bg-juniper-green/15 text-juniper-green'
                    }
                  >
                    {t(`disputes.status.${d.status}`)}
                  </Badge>
                </div>
                <p className="text-sm leading-relaxed">{d.message}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
