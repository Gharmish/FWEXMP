/**
 * Detail-shaped Suspense fallback. This route was previously falling back
 * to the catalog-grid skeleton at app/[locale]/loading.tsx, which is the
 * wrong shape AND too short — so the framework kept the previous (scrolled)
 * page painted near its footer, then snapped to the top once the detail
 * page committed. A route-level fallback paints instantly at the top, so
 * there is no footer flash and no late scroll jump on entry.
 */
export default function ExperienceDetailLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-12" aria-busy="true">
      {/* Back link */}
      <div className="bg-sarat-black/8 rounded-button h-4 w-40 animate-pulse" />

      {/* Gallery mosaic: one large hero + a 2×2 grid on wide screens. */}
      <div className="mt-8 grid gap-2 sm:aspect-[3/2] sm:grid-cols-2">
        <div className="bg-sarat-black/8 rounded-image aspect-[3/2] animate-pulse sm:aspect-auto" />
        <div className="hidden grid-cols-2 gap-2 sm:grid">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="bg-sarat-black/8 rounded-image animate-pulse" />
          ))}
        </div>
      </div>

      {/* Header */}
      <div className="border-sarat-black/8 mt-10 flex flex-col gap-4 [border-bottom-width:0.5px] pb-10">
        <div className="bg-sarat-black/8 rounded-button h-3 w-24 animate-pulse" />
        <div className="bg-sarat-black/8 rounded-input h-12 w-full max-w-2xl animate-pulse" />
        <div className="flex flex-wrap gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="bg-sarat-black/8 rounded-button h-6 w-28 animate-pulse" />
          ))}
        </div>
      </div>

      {/* Body: content column + sticky booking panel */}
      <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-6">
          <div className="bg-sarat-black/8 rounded-input h-8 w-56 animate-pulse" />
          <div className="flex flex-col gap-3">
            <div className="bg-sarat-black/8 rounded-button h-4 w-full animate-pulse" />
            <div className="bg-sarat-black/8 rounded-button h-4 w-11/12 animate-pulse" />
            <div className="bg-sarat-black/8 rounded-button h-4 w-3/4 animate-pulse" />
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="bg-sarat-black/8 rounded-input h-16 animate-pulse" />
            ))}
          </div>
        </div>
        <div className="rounded-card border-sarat-black/8 flex flex-col gap-5 [border-width:0.5px] p-6">
          <div className="bg-sarat-black/8 rounded-input h-7 w-32 animate-pulse" />
          <div className="bg-sarat-black/8 rounded-input h-9 w-40 animate-pulse" />
          <div className="bg-sarat-black/8 rounded-button h-20 w-full animate-pulse" />
          <div className="bg-sarat-black/8 rounded-button h-11 w-full animate-pulse" />
        </div>
      </div>
    </div>
  );
}
