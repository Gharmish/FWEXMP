import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { formatDate, formatInteger } from '@/lib/format';
import { Price } from '@/components/ui/price';
import { isAdminAndDbReady, listGuestsForAdmin } from '@/features/admin/guests/queries';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === 'ar' ? 'الضيوف' : 'Guests',
    robots: { index: false, follow: false },
  };
}

export default async function AdminGuestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;
  const t = await getTranslations('admin');
  const eyebrowClassName = cn(
    'text-sarat-black-600 text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  const backLink = (
    <Link
      href="/admin"
      className="text-sarat-black-600 inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium transition-opacity duration-200 hover:opacity-60"
    >
      <ArrowLeft className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
      {t('backToAdmin')}
    </Link>
  );

  const block = await isAdminAndDbReady();
  if (block?.reason === 'not_admin') notFound();
  if (block?.reason === 'no_db') {
    return (
      <div className="flex flex-col gap-10">
        {backLink}
        <div className="border-sarat-black/8 rounded-card flex flex-col items-start gap-4 [border-width:0.5px] p-10">
          <p className={eyebrowClassName}>{t('noDb.eyebrow')}</p>
          <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
            {t('noDb.title')}
          </h2>
          <p className="text-sarat-black-600 max-w-xl text-base">{t('noDb.description')}</p>
        </div>
      </div>
    );
  }

  const sp = await searchParams;
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q)?.slice(0, 80) ?? '';
  const rows = await listGuestsForAdmin(q);

  return (
    <div className="flex flex-col gap-10">
      {backLink}
      <div className="flex flex-col gap-4">
        <p className={eyebrowClassName}>{t('guestsList.eyebrow')}</p>
        <h1 className="font-display text-4xl font-medium tracking-[-0.035em] text-balance sm:text-5xl">
          {t('guestsList.title')}
        </h1>
        <p className="text-sarat-black-600 max-w-2xl text-base leading-relaxed">
          {t('guestsList.intro')}
        </p>
      </div>

      <form
        method="get"
        className="border-sarat-black/8 rounded-card flex flex-wrap items-end gap-3 [border-width:0.5px] p-4"
      >
        <label className="flex min-w-50 flex-1 flex-col gap-1">
          <span className="text-sarat-black-600 text-sm">{t('guestsList.search')}</span>
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder={t('guestsList.searchPlaceholder')}
            className="rounded-input border-sarat-black/20 bg-fog-white text-sarat-black h-11 w-full [border-width:0.5px] px-3 text-base"
          />
        </label>
        <button
          type="submit"
          className="rounded-button bg-sarat-black text-fog-white h-11 px-5 text-sm font-medium"
        >
          {t('guestsList.searchSubmit')}
        </button>
      </form>

      {rows.length === 0 ? (
        <p className="text-sarat-black-600 text-base">{t('guestsList.empty')}</p>
      ) : (
        <ul className="border-sarat-black/8 rounded-card flex flex-col divide-y divide-[var(--color-sarat-black)]/8 [border-width:0.5px]">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`/admin/guests/${row.id}`}
                className="group flex items-center justify-between gap-4 p-5 transition-colors duration-200 hover:bg-[var(--color-sarat-black)]/[0.02]"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-base font-medium">{row.name}</span>
                  <div className="text-sarat-black-600 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span dir="ltr">{row.phone}</span>
                    {row.email && (
                      <>
                        <span aria-hidden>·</span>
                        <span dir="ltr">{row.email}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  <div className="flex flex-col items-end gap-1 text-sm">
                    <span className="font-medium">
                      {t('guestsList.bookingsCount', { count: row.bookings })}
                    </span>
                    <span className="text-sarat-black-600">
                      <Price amount={row.spentSar} locale={loc} />
                    </span>
                    {row.lastBookingAt && (
                      <span className="text-sarat-black-600">
                        {t('guestsList.lastBooking', {
                          date: formatDate(new Date(row.lastBookingAt), loc),
                        })}
                      </span>
                    )}
                  </div>
                  <ArrowRight
                    className="text-sarat-black-600 size-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
                    aria-hidden
                  />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="text-sarat-black-600 text-sm">
        {t('guestsList.shownCount', { count: formatInteger(rows.length, loc) })}
      </p>
    </div>
  );
}
