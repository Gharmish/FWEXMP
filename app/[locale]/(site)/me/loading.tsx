import { Skeleton } from '@/components/ui/skeleton';

/**
 * L3 (2026-09 audit): /me had no loading.tsx, so a slow profile/booking
 * fetch left the previous route's UI frozen instead of a boundary. Mirrors
 * the real page's shape (eyebrow + title + profile card, then a card
 * grid) so hydration causes no layout shift (no spinner, BRIEF §3).
 */
export default function MeLoading() {
  return (
    <div className="flex flex-col" aria-busy>
      <section className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-24">
        <div className="flex max-w-3xl flex-col gap-6">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-12 w-72" radius="sm" />
          <Skeleton className="h-6 w-full max-w-xl" />
          <div className="border-sarat-black/8 rounded-card mt-2 flex flex-wrap items-center gap-6 [border-width:0.5px] p-6 sm:p-6">
            <Skeleton className="size-16 shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-1 basis-48 flex-col gap-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
        </div>
      </section>

      <section className="border-sarat-black/8 [border-top-width:0.5px]">
        <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
          <div className="mb-8 flex flex-col gap-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-9 w-56" radius="sm" />
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-40 w-full" radius="card" />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
