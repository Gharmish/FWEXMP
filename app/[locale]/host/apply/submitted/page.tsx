import type { Metadata } from 'next';
import { CheckCircle2 } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect, Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { getCurrentUser } from '@/features/auth/queries';
import { getCurrentUserHostApplication } from '@/features/host-applications/queries';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const title = locale === 'ar' ? 'تم استلام طلبك' : 'Application received';
  return {
    title,
    robots: { index: false, follow: false },
  };
}

export default async function HostApplySubmittedPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;

  const user = await getCurrentUser();
  if (!user) {
    redirect({ href: '/sign-in?next=/host/apply', locale: loc });
    throw new Error('unreachable');
  }

  const application = await getCurrentUserHostApplication();
  // Reached without an application? Send them to the form instead of
  // a confusing dead end.
  if (!application) {
    redirect({ href: '/host/apply', locale: loc });
    throw new Error('unreachable');
  }

  const t = await getTranslations('hostApply.submitted');
  const eyebrowClassName = cn(
    'text-sarat-black-600 text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  return (
    <div className="flex flex-col">
      <section className="mx-auto w-full max-w-2xl px-6 py-20 sm:py-24">
        <div className="flex flex-col items-start gap-5">
          <CheckCircle2 className="text-juniper-green size-10" aria-hidden strokeWidth={1.5} />
          <p className={eyebrowClassName}>{t('eyebrow')}</p>
          <h1 className="font-display text-4xl font-medium tracking-[-0.035em] text-balance sm:text-5xl">
            {t('title')}
          </h1>
          <p className="text-sarat-black-600 text-lg leading-relaxed">{t('description')}</p>
        </div>

        <ol className="border-sarat-black/8 rounded-card mt-12 grid gap-4 [border-width:0.5px] p-6">
          <li className="flex gap-4">
            <span className="text-sarat-black-600 text-sm tabular-nums">01</span>
            <p className="text-base leading-relaxed">{t('step1')}</p>
          </li>
          <li className="flex gap-4">
            <span className="text-sarat-black-600 text-sm tabular-nums">02</span>
            <p className="text-base leading-relaxed">{t('step2')}</p>
          </li>
          <li className="flex gap-4">
            <span className="text-sarat-black-600 text-sm tabular-nums">03</span>
            <p className="text-base leading-relaxed">{t('step3')}</p>
          </li>
        </ol>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/experiences"
            className={cn(buttonVariants({ variant: 'secondary', size: 'md' }))}
          >
            {t('browseExperiences')}
          </Link>
          <Link href="/me" className={cn(buttonVariants({ variant: 'primary', size: 'md' }))}>
            {t('backToAccount')}
          </Link>
        </div>
      </section>
    </div>
  );
}
