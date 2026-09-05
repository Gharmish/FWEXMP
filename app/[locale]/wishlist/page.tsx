import type { Metadata } from 'next';
import { Heart } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SITE_URL } from '@/lib/site';
import { cn } from '@/lib/utils';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Stagger, StaggerItem } from '@/components/ui/motion';
import { ExperienceCard } from '@/features/experiences/components/experience-card';
import { getWishlistExperiences } from '@/features/wishlist/queries';
import { WishlistButton } from '@/features/wishlist/components/wishlist-button';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'wishlist.meta' });
  const title = t('title');
  const tSite = await getTranslations({ locale, namespace: 'siteMeta' });
  return {
    title,
    // Wishlist URLs are per-guest and shouldn't be indexed.
    robots: { index: false, follow: false },
    // Personal pages still get pasted into chats, so the preview should
    // name the page. Generic copy only — never per-guest state. Declaring
    // openGraph replaces the parent's resolved block wholesale, so the
    // [locale]-level brand card must be re-attached explicitly.
    openGraph: {
      title,
      description: tSite('description'),
      images: [{ url: `${SITE_URL}/${locale}/opengraph-image`, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: tSite('description'),
      images: [`${SITE_URL}/${locale}/opengraph-image`],
    },
  };
}

export default async function WishlistPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;
  const t = await getTranslations('wishlist');

  const experiences = await getWishlistExperiences();
  const eyebrowClassName = cn(
    'text-sarat-black-600 font-medium text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  return (
    <div className="flex flex-col">
      <section className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-24">
        <div className="flex max-w-3xl flex-col gap-6">
          <p className={eyebrowClassName}>{t('eyebrow')}</p>
          <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-6xl">
            {t('title')}
          </h1>
          <p className="text-sarat-black-600 max-w-2xl text-lg leading-relaxed">
            {experiences.length === 0 ? t('introEmpty') : t('intro')}
          </p>
        </div>
      </section>

      <section className="border-sarat-black/8 [border-top-width:0.5px]">
        <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
          {experiences.length === 0 ? (
            <EmptyState
              icon={Heart}
              eyebrow={t('emptyEyebrow')}
              title={t('emptyTitle')}
              description={t('emptyDescription')}
              action={
                <Link
                  href="/experiences"
                  className={cn(buttonVariants({ variant: 'primary', size: 'lg' }))}
                >
                  {t('emptyCta')}
                </Link>
              }
            />
          ) : (
            <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {experiences.map((experience) => (
                <StaggerItem key={experience.slug}>
                  <ExperienceCard
                    experience={experience}
                    locale={loc}
                    actions={
                      <WishlistButton
                        slug={experience.slug}
                        isSaved
                        surface={experience.featured ? 'dark' : 'light'}
                      />
                    }
                  />
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </div>
      </section>
    </div>
  );
}
