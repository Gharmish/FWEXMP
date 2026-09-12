import { Skeleton } from '@/components/ui/skeleton';
import { ExperienceCardSkeleton } from '@/features/experiences/components/experience-card-skeleton';

/**
 * Wishlist loading state — heading block plus a card grid matching the
 * saved-experiences layout, so hydration causes no layout shift (no
 * spinner, BRIEF §3).
 *
 * M28: uses the shared ExperienceCardSkeleton (16:9 media, matching gaps)
 * instead of a hand-rolled 4:5 stand-in that had drifted from the real
 * ExperienceCard shape.
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
          <ExperienceCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
