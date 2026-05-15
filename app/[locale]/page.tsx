import { getTranslations, setRequestLocale } from 'next-intl/server';

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  return (
    <section className="mx-auto flex max-w-3xl flex-1 flex-col justify-center gap-4 p-8">
      <p className="text-sarat-black-600 text-sm tracking-[0.2em] uppercase">{t('nav.discover')}</p>
      <h1 className="font-display text-4xl font-medium tracking-[-0.035em] text-balance sm:text-6xl">
        {t('home.welcome')}
      </h1>
    </section>
  );
}
