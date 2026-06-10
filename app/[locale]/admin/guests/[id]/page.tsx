import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/format';
import { Price } from '@/components/ui/price';
import { getGuestDetail, isAdminAndDbReady } from '@/features/admin/guests/queries';
import { GuestSuspendButton } from '@/app/[locale]/admin/guests/[id]/suspend-button';
import type { AdminBookingStatus } from '@/features/admin/bookings/types';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === 'ar' ? 'ملف الضيف' : 'Guest profile',
    robots: { index: false, follow: false },
  };
}

const STATUS_TONE: Record<AdminBookingStatus, string> = {
  pending: 'bg-saffron-gold/20 text-sarat-black',
  confirmed: 'bg-juniper-green/15 text-juniper-green',
  completed: 'bg-sarat-black/8 text-sarat-black',
  cancelled: 'bg-al-qatt-red/15 text-al-qatt-red',
  refunded: 'bg-rijal-clay/15 text-rijal-clay',
};

export default async function AdminGuestDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;
  const t = await getTranslations('admin');
  const eyebrowClassName = cn(
    'text-sarat-black-600 text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  const block = await isAdminAndDbReady();
  if (block?.reason === 'not_admin') notFound();

  const guest = block?.reason === 'no_db' ? undefined : await getGuestDetail(id);
  if (!guest) notFound();

  const facts: Array<{ label: string; value: ReactNode; dir?: 'ltr' }> = [
    { label: t('guestDetail.phone'), value: guest.phone ?? '—', dir: 'ltr' },
    { label: t('guestDetail.email'), value: guest.email ?? '—', dir: 'ltr' },
    { label: t('guestDetail.language'), value: guest.preferredLanguage.toUpperCase() },
    { label: t('guestDetail.totalSpent'), value: <Price amount={guest.spentSar} locale={loc} /> },
    { label: t('guestDetail.joined'), value: formatDate(new Date(guest.createdAt), loc) },
  ];

  return (
    <div className="flex flex-col gap-10">
      <Link
        href="/admin/guests"
        className="text-sarat-black-600 inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium transition-opacity duration-200 hover:opacity-60"
      >
        <ArrowLeft className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
        {t('guestDetail.back')}
      </Link>

      <div className="flex flex-col gap-3">
        <p className={eyebrowClassName}>{t('guestDetail.eyebrow')}</p>
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="font-display text-4xl font-medium tracking-[-0.035em] text-balance sm:text-5xl">
            {guest.name}
          </h1>
          {guest.suspendedAt && (
            <Badge className="bg-al-qatt-red/15 text-al-qatt-red">
              {t('guestDetail.suspendedBadge')}
            </Badge>
          )}
        </div>
        <GuestSuspendButton
          guestId={guest.id}
          suspended={guest.suspendedAt !== null}
          copy={{
            suspend: t('guestDetail.suspend'),
            suspendPending: t('guestDetail.suspendPending'),
            suspendConfirm: t('guestDetail.suspendConfirm'),
            restore: t('guestDetail.restore'),
            restorePending: t('guestDetail.restorePending'),
            errors: {
              forbidden: t('guestDetail.errors.forbidden'),
              no_db: t('guestDetail.errors.noDb'),
              not_found: t('guestDetail.errors.notFound'),
              wrong_state: t('guestDetail.errors.wrongState'),
              server: t('guestDetail.errors.server'),
            },
          }}
        />
      </div>

      <dl className="border-sarat-black/8 rounded-card grid gap-5 [border-width:0.5px] p-6 sm:grid-cols-2">
        {facts.map((f) => (
          <div key={f.label} className="flex flex-col gap-1">
            <dt className={eyebrowClassName}>{f.label}</dt>
            <dd className="text-base font-medium" dir={f.dir}>
              {f.value}
            </dd>
          </div>
        ))}
      </dl>

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
          {t('guestDetail.bookingsHeading')}
        </h2>
        {guest.bookingList.length === 0 ? (
          <p className="text-sarat-black-600 text-base">{t('guestDetail.noBookings')}</p>
        ) : (
          <ul className="border-sarat-black/8 rounded-card flex flex-col divide-y divide-[var(--color-sarat-black)]/8 [border-width:0.5px]">
            {guest.bookingList.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <Link
                      href={`/admin/bookings/${b.id}`}
                      className="text-base font-medium underline-offset-4 hover:underline"
                    >
                      {b.experienceTitleEn}
                    </Link>
                    <Badge className={STATUS_TONE[b.status]}>
                      {t(`bookingStatus.${b.status}`)}
                    </Badge>
                  </div>
                  <span className="text-sarat-black-600 text-sm">
                    {formatDate(new Date(b.date), loc)}
                  </span>
                </div>
                <span className="text-base font-medium">
                  <Price amount={b.totalAmountSar} locale={loc} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
