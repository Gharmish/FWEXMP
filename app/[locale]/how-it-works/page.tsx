import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/lib/i18n';
import { InfoPage } from '@/components/layout/info-page';
import { getPlatformSettings } from '@/features/admin/settings/queries';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale, namespace: 'howItWorks' });
  return { title: t('title'), description: t('intro') };
}

/** Ordered numbered steps under a guest/host heading. */
function Steps({ items }: { items: readonly string[] }) {
  return (
    <ol className="flex list-none flex-col gap-3">
      {items.map((item, i) => (
        <li key={item} className="flex items-start gap-3">
          <span
            className="border-sarat-black/8 text-sarat-black flex size-7 shrink-0 items-center justify-center rounded-full [border-width:0.5px] text-sm font-medium"
            aria-hidden
          >
            {i + 1}
          </span>
          <span className="pt-0.5">{item}</span>
        </li>
      ))}
    </ol>
  );
}

export default async function HowItWorksPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;
  const [t, settings] = await Promise.all([getTranslations('howItWorks'), getPlatformSettings()]);
  const hours = settings.approvalWindowHours;

  const sections = [
    {
      heading: t('guests.heading'),
      body: (
        <>
          <p>{t('guests.intro', { hours })}</p>
          <Steps
            items={[
              t('guests.step1'),
              t('guests.step2', { hours }),
              t('guests.step3'),
              t('guests.step4'),
            ]}
          />
        </>
      ),
    },
    {
      heading: t('bookingTypes.heading'),
      body: (
        <>
          <p>{t('bookingTypes.instant')}</p>
          <p>{t('bookingTypes.request', { hours })}</p>
        </>
      ),
    },
    {
      heading: t('hosts.heading'),
      body: (
        <>
          <p>{t('hosts.intro')}</p>
          <Steps items={[t('hosts.step1'), t('hosts.step2'), t('hosts.step3'), t('hosts.step4')]} />
        </>
      ),
    },
  ];

  return (
    <InfoPage
      locale={loc}
      eyebrow={t('eyebrow')}
      title={t('title')}
      intro={t('intro')}
      sections={sections}
    />
  );
}
