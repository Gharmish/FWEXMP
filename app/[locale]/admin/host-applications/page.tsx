import type { Metadata } from 'next';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/format';
import {
  isAdminAndDbReady,
  listApplicationsForAdmin,
} from '@/features/host-applications/admin-queries';
import type { HostApplicationStatus } from '@/features/host-applications/types';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: locale === 'ar' ? 'طلبات المضيفين' : 'Host applications',
    robots: { index: false, follow: false },
  };
}

const STATUS_TONE: Record<HostApplicationStatus, string> = {
  pending: 'bg-saffron-gold/20 text-sarat-black',
  approved: 'bg-juniper-green/15 text-juniper-green',
  rejected: 'bg-al-qatt-red/15 text-al-qatt-red',
};

export default async function AdminHostApplicationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;

  const [block, applications, t] = await Promise.all([
    isAdminAndDbReady(),
    listApplicationsForAdmin(),
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
        <p className={eyebrowClassName}>{t('hostApplicationsList.eyebrow')}</p>
        <h1 className="font-display text-4xl font-medium tracking-[-0.035em] text-balance sm:text-5xl">
          {t('hostApplicationsList.title')}
        </h1>
        <p className="text-sarat-black-600 max-w-2xl text-base leading-relaxed">
          {t('hostApplicationsList.intro')}
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
      ) : applications.length === 0 ? (
        <div className="border-sarat-black/8 rounded-card flex flex-col items-start gap-4 [border-width:0.5px] p-10">
          <p className={eyebrowClassName}>{t('hostApplicationsList.empty.eyebrow')}</p>
          <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
            {t('hostApplicationsList.empty.title')}
          </h2>
          <p className="text-sarat-black-600 max-w-xl text-base">
            {t('hostApplicationsList.empty.description')}
          </p>
        </div>
      ) : (
        <ul className="border-sarat-black/8 rounded-card flex flex-col divide-y divide-[var(--color-sarat-black)]/8 [border-width:0.5px]">
          {applications.map((application) => (
            <li key={application.id ?? application.userId}>
              <Link
                href={`/admin/host-applications/${application.id}`}
                className="hover:bg-sarat-black/[0.02] flex items-center justify-between gap-4 p-5 transition-colors duration-200"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-3">
                    <span className="text-base font-medium">{application.displayName}</span>
                    <Badge className={STATUS_TONE[application.status]}>
                      {t(`status.${application.status}`)}
                    </Badge>
                  </div>
                  <div className="text-sarat-black-600 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span dir="ltr">{application.contactPhone}</span>
                    <span aria-hidden>·</span>
                    <span>{t(`identityType.${application.identityType}`)}</span>
                    <span aria-hidden>·</span>
                    <span>{formatDate(new Date(application.createdAt), loc)}</span>
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
