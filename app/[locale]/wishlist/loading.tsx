import { Skeleton } from '@/components/ui/skeleton';

/**
 * Wishlist loading state — heading block plus a card grid matching the
 * saved-experiences layout, so hydration causes no layout shift (no
 * spinner, BRIEF §3).
 */
export default function WishlistLoading() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 py-16" aria-busy>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-12 w-64" radius="sm" />
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-3">
            <Skeleton className="aspect-[4/5] w-full" radius="image" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
