import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default async function LocaleNotFound() {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations('notFound');
  const eyebrowClassName = cn(
    'text-sarat-black-600 text-[11px]',
    locale === 'en' && 'tracking-[0.2em] uppercase',
  );

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-1 items-center px-6 py-24">
      <div className="flex max-w-2xl flex-col gap-6">
        <p className={eyebrowClassName}>{t('eyebrow')}</p>
        <h1 className="font-display text-4xl font-medium tracking-[-0.035em] text-balance sm:text-6xl">
          {t('title')}
        </h1>
        <p className="text-sarat-black-600 max-w-xl text-lg">{t('description')}</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/" className={cn(buttonVariants({ variant: 'primary', size: 'lg' }))}>
            {t('home')}
          </Link>
          <Link
            href="/experiences"
            className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }))}
          >
            {t('experiences')}
          </Link>
        </div>
      </div>
    </section>
  );
}
