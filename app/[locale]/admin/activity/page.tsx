import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { isAdminAndDbReady, listActivity } from '@/features/admin/activity/queries';
import type { ActivityKind } from '@/features/admin/activity/queries';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin.meta' });
  return {
    title: t('activityTitle'),
    robots: { index: false, follow: false },
  };
}

const KIND_TONE: Record<ActivityKind, string> = {
  experience: 'bg-sarawat-blue/15 text-sarawat-blue',
  application: 'bg-saffron-gold/20 text-sarat-black',
  host: 'bg-juniper-green/15 text-juniper-green',
};

/** Which i18n namespace resolves the event label for each kind. */
const EVENT_NS: Record<ActivityKind, string> = {
  experience: 'moderationEvent',
  application: 'applicationEvent',
  host: 'hostStatusEvent',
};

export default async function AdminActivityPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;
  const t = await getTranslations('admin');
  const eyebrowClassName = cn(
    'text-sarat-black-600 font-medium text-[11px]',
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
      <div className="flex flex-col gap-12">
        {backLink}
        <div className="border-sarat-black/8 rounded-card flex flex-col items-start gap-4 [border-width:0.5px] p-12">
          <p className={eyebrowClassName}>{t('noDb.eyebrow')}</p>
          <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
            {t('noDb.title')}
          </h2>
          <p className="text-sarat-black-600 max-w-xl text-base">{t('noDb.description')}</p>
        </div>
      </div>
    );
  }

  const items = await listActivity();

  return (
    <div className="flex flex-col gap-12">
      {backLink}
      <div className="flex flex-col gap-4">
        <p className={eyebrowClassName}>{t('activityLog.eyebrow')}</p>
        <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
          {t('activityLog.title')}
        </h1>
        <p className="text-sarat-black-600 max-w-2xl text-base leading-relaxed">
          {t('activityLog.intro')}
        </p>
      </div>

      {items.length === 0 ? (
        <p className="text-sarat-black-600 text-base">{t('activityLog.empty')}</p>
      ) : (
        <ol className="border-sarat-black/8 rounded-card divide-hairline flex flex-col divide-[var(--color-sarat-black)]/8 [border-width:0.5px]">
          {items.map((item) => (
            <li key={`${item.kind}-${item.id}`} className="flex flex-col gap-2 p-6">
              <div className="flex flex-wrap items-center gap-3">
                <Badge className={KIND_TONE[item.kind]}>{t(`activityLog.kind.${item.kind}`)}</Badge>
                <span className="text-base font-medium">
                  {t(`${EVENT_NS[item.kind]}.${item.event}`)}
                </span>
                <span aria-hidden className="text-sarat-black-600">
                  ·
                </span>
                <Link
                  href={item.targetHref}
                  className="text-sarat-black truncate text-base underline-offset-4 hover:underline"
                >
                  {item.targetLabel}
                </Link>
              </div>
              <span className="text-sarat-black-600 text-sm">
                {formatDate(new Date(item.at), loc)}
              </span>
              {item.notes && (
                <p className="text-sarat-black-600 text-sm leading-relaxed whitespace-pre-line">
                  {item.notes}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
