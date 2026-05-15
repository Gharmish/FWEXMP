import { getLocale, getTranslations } from 'next-intl/server';
import type { Locale } from '@/lib/i18n';
import { Wordmark } from '@/components/layout/wordmark';

/**
 * Restrained footer (BRIEF §3): a single 0.5px top hairline, no shadow,
 * brand tokens only. Wordmark, the positioning line, and a quiet
 * copyright row.
 */
export async function Footer() {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations('footer');
  const year = new Date().getFullYear();

  return (
    <footer className="border-sarat-black/8 [border-top-width:0.5px]">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12">
        <div className="flex flex-col gap-3">
          <Wordmark locale={locale} />
          <p className="text-sarat-black-600 max-w-md text-base">{t('tagline')}</p>
        </div>
        <div className="border-sarat-black/8 text-sarat-black-600 flex flex-col gap-1 [border-top-width:0.5px] pt-6 text-sm">
          <span>
            © {year} Gharmish. {t('rights')}
          </span>
          <span>{t('region')}</span>
        </div>
      </div>
    </footer>
  );
}
