import { getTranslations } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import { buttonVariants } from '@/components/ui/button';
import { MountFade } from '@/components/ui/motion';
import { cn } from '@/lib/utils';

/**
 * The branded 404 body. Rendered inside the (site) layout's <main> for
 * public pages, and inside its own <main> by the locale-level boundary
 * that catches the dashboards' notFound() (third-round verification N3).
 */
export async function NotFoundPage() {
  const t = await getTranslations('notFound');
  const eyebrowClassName = cn('text-sarat-black-600 text-eyebrow');

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-1 items-center px-6 py-24">
      <MountFade eager className="flex max-w-2xl flex-col gap-6">
        <p className={eyebrowClassName}>{t('eyebrow')}</p>
        <h1 className="text-h1-lg">{t('title')}</h1>
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
      </MountFade>
    </section>
  );
}
