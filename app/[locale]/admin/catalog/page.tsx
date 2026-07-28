import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { Category } from '@/lib/colors';
import { Badge } from '@/components/ui/badge';
import { isAdminAndDbReady } from '@/features/admin/guard';
import { getCatalogOverview } from '@/features/admin/catalog/queries';
import { CategoryToggleForm } from '@/app/[locale]/admin/catalog/category-toggle-form';
import { CityRowForm } from '@/app/[locale]/admin/catalog/city-row-form';
import { AddCityForm } from '@/app/[locale]/admin/catalog/add-city-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin.meta' });
  return {
    title: t('catalogTitle'),
    robots: { index: false, follow: false },
  };
}

// Literal classes per category so Tailwind sees them (CATEGORY_DOT pattern).
const DOT: Record<Category, string> = {
  nature: 'bg-juniper-green',
  heritage: 'bg-al-qatt-red',
  food: 'bg-saffron-gold',
  wellness: 'bg-wadi-mint',
  adventure: 'bg-soudah-sunset',
  family: 'bg-sarawat-blue',
  women_only: 'bg-tihama-coral',
};

export default async function AdminCatalogPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;
  const [t, tCat] = await Promise.all([
    getTranslations('admin'),
    getTranslations('hostExperiences.form.categories'),
  ]);
  const eyebrowClassName = cn(
    'text-sarat-black-600 text-[11px]',
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
      <div className="flex flex-col gap-10">
        {backLink}
        <div className="border-sarat-black/8 rounded-card flex flex-col items-start gap-4 [border-width:0.5px] p-10">
          <p className={eyebrowClassName}>{t('noDb.eyebrow')}</p>
          <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
            {t('noDb.title')}
          </h2>
          <p className="text-sarat-black-600 max-w-xl text-base">{t('noDb.description')}</p>
        </div>
      </div>
    );
  }

  const overview = await getCatalogOverview();
  if (!overview) notFound();

  const cityLabel = (nameEn: string, nameAr: string) => (loc === 'ar' ? nameAr : nameEn);

  const toggleCopy = {
    enable: t('catalog.enable'),
    disable: t('catalog.disable'),
    pending: t('catalog.saving'),
    lastCategory: t('catalog.lastCategory'),
    formServer: t('catalog.formServer'),
    formForbidden: t('catalog.formForbidden'),
  };

  const cityRowCopy = {
    cityNameArLabel: t('catalog.cityNameArLabel'),
    regionLabel: t('catalog.regionLabel'),
    enabledLabel: t('catalog.cityEnabledLabel'),
    save: t('catalog.save'),
    saving: t('catalog.saving'),
    success: t('catalog.success'),
    fieldInvalid: t('catalog.fieldInvalid'),
    formServer: t('catalog.formServer'),
    formForbidden: t('catalog.formForbidden'),
    notFound: t('catalog.cityNotFound'),
  };

  const addCityCopy = {
    nameEnLabel: t('catalog.cityNameEnLabel'),
    nameArLabel: t('catalog.cityNameArLabel'),
    regionLabel: t('catalog.regionLabel'),
    submit: t('catalog.addCity'),
    submitPending: t('catalog.addCityPending'),
    success: t('catalog.success'),
    fieldInvalid: t('catalog.fieldInvalid'),
    duplicateCity: t('catalog.duplicateCity'),
    formServer: t('catalog.formServer'),
    formForbidden: t('catalog.formForbidden'),
    formValidation: t('catalog.formValidation'),
  };

  const panelClass =
    'border-sarat-black/8 rounded-card flex flex-col gap-6 [border-width:0.5px] p-6 sm:p-8';

  return (
    <div className="flex flex-col gap-10">
      {backLink}

      <div className="flex flex-col gap-4">
        <p className={eyebrowClassName}>{t('catalog.eyebrow')}</p>
        <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
          {t('sections.catalog.title')}
        </h1>
        <p className="text-sarat-black-600 max-w-2xl text-base leading-relaxed">
          {t('catalog.intro')}
        </p>
      </div>

      {/* Categories */}
      <section className={panelClass} aria-labelledby="catalog-categories">
        <div className="flex flex-col gap-1">
          <h2 id="catalog-categories" className="text-xl font-medium tracking-[-0.025em]">
            {t('catalog.categoriesTitle')}
          </h2>
          <p className="text-sarat-black-600 text-sm">{t('catalog.categoriesHint')}</p>
        </div>
        <ul className="flex flex-col">
          {overview.categories.map((row) => (
            <li
              key={row.category}
              className="border-sarat-black/8 flex flex-wrap items-center gap-4 border-b [border-bottom-width:0.5px] py-4 first:pt-0 last:border-b-0 last:pb-0"
            >
              <span
                aria-hidden
                className={cn('size-2.5 shrink-0 rounded-full', DOT[row.category])}
              />
              <span className="min-w-32 text-base font-medium">{tCat(row.category)}</span>
              <Badge variant={row.enabled ? 'verified' : 'neutral'}>
                {row.enabled ? t('catalog.enabledBadge') : t('catalog.disabledBadge')}
              </Badge>
              <span className="text-sarat-black-600 ms-auto text-sm tabular-nums">
                {t('catalog.liveCount', { count: row.liveCount })}
                {' · '}
                {t('catalog.totalCount', { count: row.totalCount })}
              </span>
              <CategoryToggleForm
                category={row.category}
                enabled={row.enabled}
                locale={loc}
                copy={toggleCopy}
              />
            </li>
          ))}
        </ul>
      </section>

      {/* Cities */}
      <section className={panelClass} aria-labelledby="catalog-cities">
        <div className="flex flex-col gap-1">
          <h2 id="catalog-cities" className="text-xl font-medium tracking-[-0.025em]">
            {t('catalog.citiesTitle')}
          </h2>
          <p className="text-sarat-black-600 text-sm">{t('catalog.citiesHint')}</p>
        </div>
        <ul className="flex flex-col gap-6">
          {overview.cities.map((city) => (
            <li
              key={city.id}
              className="border-sarat-black/8 flex flex-col gap-3 border-b [border-bottom-width:0.5px] pb-6 last:border-b-0 last:pb-0"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-base font-medium">{cityLabel(city.nameEn, city.nameAr)}</span>
                {city.registered ? (
                  <Badge variant={city.enabled ? 'verified' : 'neutral'}>
                    {city.enabled ? t('catalog.cityOpenBadge') : t('catalog.cityClosedBadge')}
                  </Badge>
                ) : (
                  <Badge variant="soldOut">{t('catalog.unregisteredBadge')}</Badge>
                )}
                <span className="text-sarat-black-600 ms-auto text-sm tabular-nums">
                  {t('catalog.liveCount', { count: city.liveCount })}
                  {' · '}
                  {t('catalog.totalCount', { count: city.totalCount })}
                </span>
              </div>
              {city.registered ? (
                <CityRowForm
                  cityId={city.id}
                  nameAr={city.nameAr}
                  region={city.region}
                  enabled={city.enabled}
                  locale={loc}
                  copy={cityRowCopy}
                />
              ) : (
                <p className="text-sarat-black-600 text-sm">{t('catalog.unregisteredHint')}</p>
              )}
            </li>
          ))}
        </ul>
        <div className="border-sarat-black/8 flex flex-col gap-3 border-t [border-top-width:0.5px] pt-6">
          <h3 className="text-base font-medium">{t('catalog.addCityTitle')}</h3>
          <AddCityForm locale={loc} copy={addCityCopy} />
        </div>
      </section>

      {/* Coverage matrix */}
      <section className={panelClass} aria-labelledby="catalog-coverage">
        <div className="flex flex-col gap-1">
          <h2 id="catalog-coverage" className="text-xl font-medium tracking-[-0.025em]">
            {t('catalog.coverageTitle')}
          </h2>
          <p className="text-sarat-black-600 text-sm">{t('catalog.coverageHint')}</p>
        </div>
        {overview.matrix.rows.length === 0 ? (
          <p className="text-sarat-black-600 text-sm">{t('catalog.coverageEmpty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="bg-mist">
                  <th scope="col" className="rounded-s-lg px-4 py-3 text-start font-medium">
                    {t('catalog.cityColumn')}
                  </th>
                  {overview.matrix.categories.map((category, i) => (
                    <th
                      scope="col"
                      key={category}
                      className={cn(
                        'px-4 py-3 text-center font-medium whitespace-nowrap',
                        i === overview.matrix.categories.length - 1 && 'rounded-e-lg',
                      )}
                    >
                      <span className="inline-flex items-center gap-2">
                        <span
                          aria-hidden
                          className={cn('size-2 shrink-0 rounded-full', DOT[category])}
                        />
                        {tCat(category)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {overview.matrix.rows.map(({ city, liveByCategory }) => (
                  <tr
                    key={city.id}
                    className="border-sarat-black/8 border-b [border-bottom-width:0.5px] last:border-b-0"
                  >
                    <th scope="row" className="px-4 py-3 text-start font-medium whitespace-nowrap">
                      {cityLabel(city.nameEn, city.nameAr)}
                    </th>
                    {overview.matrix.categories.map((category) => {
                      const count = liveByCategory[category];
                      const enabledCategory = overview.categories.some(
                        (c) => c.category === category && c.enabled,
                      );
                      const isGap = count === 0 && city.enabled && enabledCategory;
                      return (
                        <td
                          key={category}
                          className={cn(
                            'px-4 py-3 text-center tabular-nums',
                            count === 0 && 'text-sarat-black-600',
                            isGap && 'bg-saffron-gold-50',
                          )}
                        >
                          {count === 0 ? '—' : count}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-sarat-black-600 text-xs">{t('catalog.coverageLegend')}</p>
      </section>
    </div>
  );
}
