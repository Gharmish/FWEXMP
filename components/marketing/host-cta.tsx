import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/utils';
import { Link } from '@/lib/i18n';
import { buttonVariants } from '@/components/ui/button';
import { FadeIn } from '@/components/ui/motion';

/**
 * Host recruitment band — supply is the scarcest pre-launch resource, so
 * the highest-traffic page closes with the partnership pitch. Sarat Black
 * band with the premium (Saffron Gold) CTA — the Originals treatment,
 * pointed at hosts.
 */
export async function HostCta() {
  const t = await getTranslations('home.hostCta');
  // Arabic reads one type-scale step up (BRIEF §3): 11px + tracking is an
  // EN small-caps treatment — Arabic gets 13px with no added tracking.
  const eyebrowClassName = cn('text-saffron-gold font-medium', 'text-eyebrow');

  return (
    <section className="bg-sarat-black text-white">
      <FadeIn className="mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-6 py-20">
        <p className={eyebrowClassName}>{t('eyebrow')}</p>
        <h2 className="text-h2-xl max-w-2xl text-balance">{t('title')}</h2>
        <p className="max-w-xl text-lg leading-relaxed text-white/70 rtl:text-xl">{t('body')}</p>
        <Link
          href="/hosting"
          className={cn(buttonVariants({ variant: 'premium', size: 'lg' }), 'mt-2')}
        >
          {t('cta')}
        </Link>
      </FadeIn>
    </section>
  );
}
