import { ExperienceCardSkeleton } from '@/features/experiences/components/experience-card-skeleton';

/**
 * Catalog-grid skeleton for /experiences. This used to live at the
 * [locale] root, but a loading.tsx there wraps EVERY child page in a
 * Suspense boundary whose fallback flushes a 200 shell before any
 * page-level notFound() can throw — turning missing experience/host
 * slugs into soft-404s. Scoped here via the (catalog) route group so it
 * covers only the index page, which never 404s. Do not add a loading.tsx
 * at [locale] or above the [slug] segments.
 *
 * Mirrors the real page's layout (hero padding, search/sort/rail slots,
 * card-shaped grid via ExperienceCardSkeleton) so the reveal causes no
 * shift — hand-rolled text-only cards had drifted from the real cards.
 */
export default function CatalogLoading() {
  return (
    <div className="flex flex-col" aria-busy="true">
      <section className="mx-auto w-full max-w-6xl px-6 py-12 sm:py-24">
        <div className="flex max-w-3xl flex-col gap-6">
          <div className="bg-sarat-black/8 rounded-button h-3 w-24 animate-pulse" />
          <div className="flex flex-col gap-3">
            <div className="bg-sarat-black/8 rounded-input h-10 w-full max-w-2xl animate-pulse sm:h-14" />
            <div className="bg-sarat-black/8 rounded-input h-10 w-full max-w-xl animate-pulse sm:h-14" />
          </div>
          <div className="bg-sarat-black/8 rounded-button h-5 w-full max-w-lg animate-pulse" />
        </div>
        {/* Mobile search + filters entry slot (lg:hidden on the real page). */}
        <div className="mt-8 flex max-w-3xl items-center gap-3 lg:hidden">
          <div className="bg-sarat-black/8 rounded-input h-11 flex-1 animate-pulse" />
          <div className="bg-sarat-black/8 h-11 w-14 shrink-0 animate-pulse rounded-full" />
        </div>
      </section>

      <section className="border-sarat-black/8 [border-top-width:0.5px]">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-12 sm:gap-12 sm:py-20">
          <div className="flex flex-col gap-6">
            {/* "All experiences" heading */}
            <div className="bg-sarat-black/8 rounded-button h-8 w-56 animate-pulse" />
            {/* Search (desktop) + sort row */}
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="bg-sarat-black/8 rounded-input hidden h-11 animate-pulse lg:block lg:max-w-md lg:flex-1" />
              <div className="bg-sarat-black/8 rounded-input h-11 w-full max-w-48 animate-pulse" />
            </div>
            {/* Category strip + filters rail */}
            <div className="flex items-center gap-3">
              <div className="bg-sarat-black/8 h-11 min-w-0 flex-1 animate-pulse rounded-full" />
              <div className="bg-sarat-black/8 h-11 w-14 shrink-0 animate-pulse rounded-full sm:w-28" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <ExperienceCardSkeleton key={index} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
