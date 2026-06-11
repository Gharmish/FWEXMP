import type { Metadata } from 'next';
import { ChevronDown } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/lib/i18n';
import { InfoPage } from '@/components/layout/info-page';
import { getPlatformSettings } from '@/features/admin/settings/queries';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale, namespace: 'helpFaq' });
  return { title: t('title'), description: t('intro') };
}

const FAQ_KEYS = ['booking', 'payment', 'pending', 'cancel', 'contactHost', 'becomeHost'] as const;

export default async function HelpPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;
  const [t, settings] = await Promise.all([getTranslations('helpFaq'), getPlatformSettings()]);
  const values = {
    approvalHours: settings.approvalWindowHours,
    cancelHours: settings.cancellationWindowHours,
  };

  return (
    <InfoPage
      locale={loc}
      eyebrow={t('eyebrow')}
      title={t('title')}
      intro={t('intro')}
      sections={[]}
    >
      {/* Native-disclosure FAQ — zero client JS, fully keyboard accessible. */}
      <div className="border-sarat-black/8 flex flex-col [border-top-width:0.5px]">
        {FAQ_KEYS.map((key) => (
          <details key={key} className="border-sarat-black/8 group [border-bottom-width:0.5px]">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 py-5 text-lg font-medium [&::-webkit-details-marker]:hidden">
              {t(`items.${key}.q`, values)}
              <ChevronDown
                className="text-sarat-black-600 size-5 shrink-0 transition-transform duration-200 group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <p className="text-sarat-black-600 pb-6 text-base leading-relaxed">
              {t(`items.${key}.a`, values)}
            </p>
          </details>
        ))}
      </div>
    </InfoPage>
  );
}
