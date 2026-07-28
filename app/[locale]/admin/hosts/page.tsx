import type { Metadata } from 'next';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/format';
import { isAdminAndDbReady, listHostsForAdmin } from '@/features/admin/hosts/queries';
import type { HostVerificationStatus } from '@/features/admin/hosts/types';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin.meta' });
  return {
    title: t('hostsTitle'),
    robots: { index: false, follow: false },
  };
}

const STATUS_TONE: Record<HostVerificationStatus, string> = {
  verified: 'bg-juniper-green/15 text-juniper-green',
  pending: 'bg-saffron-gold/20 text-sarat-black',
  suspended: 'bg-al-qatt-red/15 text-al-qatt-red',
};

export default async function AdminHostsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;

  const [block, rows, t] = await Promise.all([
    isAdminAndDbReady(),
    listHostsForAdmin(),
    getTranslations('admin'),
  ]);

  const eyebrowClassName = cn(
    'text-sarat-black-600 text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        <Link
          href="/admin"
          className="text-sarat-black-600 inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium transition-opacity duration-200 hover:opacity-60"
        >
          <ArrowLeft className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
          {t('backToAdmin')}
        </Link>
        <p className={eyebrowClassName}>{t('hostsList.eyebrow')}</p>
        <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
          {t('hostsList.title')}
        </h1>
        <p className="text-sarat-black-600 max-w-2xl text-base leading-relaxed">
          {t('hostsList.intro')}
        </p>
      </div>

      {block?.reason === 'no_db' ? (
        <div className="border-sarat-black/8 rounded-card flex flex-col items-start gap-4 [border-width:0.5px] p-10">
          <p className={eyebrowClassName}>{t('noDb.eyebrow')}</p>
          <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
            {t('noDb.title')}
          </h2>
          <p className="text-sarat-black-600 max-w-xl text-base">{t('noDb.description')}</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="border-sarat-black/8 rounded-card flex flex-col items-start gap-4 [border-width:0.5px] p-10">
          <p className={eyebrowClassName}>{t('hostsList.empty.eyebrow')}</p>
          <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
            {t('hostsList.empty.title')}
          </h2>
          <p className="text-sarat-black-600 max-w-xl text-base">
            {t('hostsList.empty.description')}
          </p>
        </div>
      ) : (
        <ul className="border-sarat-black/8 rounded-card flex flex-col divide-y divide-[var(--color-sarat-black)]/8 [border-width:0.5px]">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`/admin/hosts/${row.id}`}
                className="hover:bg-sarat-black/[0.02] flex items-center justify-between gap-4 p-5 transition-colors duration-200"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="truncate text-base font-medium">{row.name}</span>
                    <Badge className={STATUS_TONE[row.status]}>
                      {t(`hostStatus.${row.status}`)}
                    </Badge>
                  </div>
                  <div className="text-sarat-black-600 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span>
                      {t('hostsList.publishedCount', {
                        count: row.publishedExperiences,
                      })}
                    </span>
                    <span aria-hidden>·</span>
                    <span>{t('hostsList.bookingsCount', { count: row.liveBookings })}</span>
                    <span aria-hidden>·</span>
                    <span>
                      {t('hostsList.joinedOn', {
                        date: formatDate(new Date(row.createdAt), loc),
                      })}
                    </span>
                  </div>
                </div>
                <ArrowRight
                  className="text-sarat-black-600 size-4 shrink-0 rtl:rotate-180"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
