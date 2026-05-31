import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/empty-state';
import { Compass } from 'lucide-react';
import { getMyProfile } from '@/features/account/profile/queries';
import { getBookingsForGuest } from '@/features/bookings/queries';
import { ProfileForm } from '@/features/account/profile/components/profile-form';
import { AvatarUpload } from '@/features/account/profile/components/avatar-upload';
import { WalletCard } from '@/features/account/profile/components/wallet-card';
import { PaymentMethodsSection } from '@/features/account/profile/components/payment-methods-section';
import { BookingHistory } from '@/features/account/profile/components/booking-history';
import type { Booking } from '@/db/schema';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === 'ar' ? 'ملفك الشخصي' : 'Your profile',
    // Per-guest state — never indexed.
    robots: { index: false, follow: false },
  };
}

export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;

  const profile = await getMyProfile();
  if (!profile) {
    redirect({ href: '/sign-in?next=/me/profile', locale: loc });
  }

  const [bookings, t] = await Promise.all([
    getBookingsForGuest(profile.id),
    getTranslations('me.profile'),
  ]);

  const eyebrowClassName = cn(
    'text-sarat-black-600 text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  const statusLabels = {
    pending: t('history.status.pending'),
    confirmed: t('history.status.confirmed'),
    completed: t('history.status.completed'),
    cancelled: t('history.status.cancelled'),
    refunded: t('history.status.refunded'),
  } satisfies Record<Booking['status'], string>;

  return (
    <div className="flex flex-col">
      {/* Header */}
      <section className="mx-auto w-full max-w-4xl px-6 py-16 sm:py-20">
        <div className="flex flex-col gap-6">
          <p className={eyebrowClassName}>{t('eyebrow')}</p>
          <h1 className="font-display text-4xl font-medium tracking-[-0.035em] text-balance sm:text-5xl">
            {t('title')}
          </h1>
          <AvatarUpload
            name={profile.name}
            avatarUrl={profile.avatarUrl}
            copy={{
              alt: t('photo.alt', { name: profile.name }),
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
      </section>

      {/* Personal details */}
      <section className="border-sarat-black/8 [border-top-width:0.5px]">
        <div className="mx-auto w-full max-w-4xl px-6 py-14 sm:py-16">
          <h2 className="font-display mb-8 text-3xl font-medium tracking-[-0.03em]">
            {t('details.title')}
          </h2>
          <ProfileForm
            profile={profile}
            copy={{
              nameLabel: t('details.nameLabel'),
              emailLabel: t('details.emailLabel'),
              emailOptional: t('details.emailOptional'),
              phoneLabel: t('details.phoneLabel'),
              phoneHint: t('details.phoneHint'),
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
        </div>
      </section>

      {/* Wallet + payment methods */}
      <section className="border-sarat-black/8 [border-top-width:0.5px]">
        <div className="mx-auto w-full max-w-4xl px-6 py-14 sm:py-16">
          <div className="grid gap-10 lg:grid-cols-[20rem_1fr]">
            <WalletCard
              locale={loc}
              copy={{
                title: t('wallet.title'),
                balanceLabel: t('wallet.balanceLabel'),
                note: t('wallet.note'),
              }}
            />
            <div className="flex flex-col gap-6">
              <h2 className="font-display text-3xl font-medium tracking-[-0.03em]">
                {t('payment.title')}
              </h2>
              <PaymentMethodsSection
                copy={{
                  eyebrow: t('payment.eyebrow'),
                  emptyTitle: t('payment.emptyTitle'),
                  emptyDescription: t('payment.emptyDescription'),
                }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Booking history */}
      <section className="border-sarat-black/8 [border-top-width:0.5px]">
        <div className="mx-auto w-full max-w-4xl px-6 py-14 sm:py-16">
          <h2 className="font-display mb-8 text-3xl font-medium tracking-[-0.03em]">
            {t('history.title')}
          </h2>
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
            <EmptyState
              icon={Compass}
              title={t('history.emptyTitle')}
              description={t('history.emptyDescription')}
            />
          )}
        </div>
      </section>
    </div>
  );
}
