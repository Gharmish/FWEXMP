import { Skeleton } from '@/components/ui/skeleton';

/**
 * Loading stand-in shaped like the real ExperienceCard (16:9 media block,
 * then the p-6 content column: badge row, title, meta, price row). Loading
 * surfaces must mirror the final layout so the reveal causes no shift —
 * hand-rolled skeletons had drifted to 4:5 images and different gaps.
 */
export function ExperienceCardSkeleton() {
  return (
    <div className="rounded-card border-sarat-black/8 flex h-full flex-col overflow-hidden [border-width:0.5px]">
      <Skeleton className="aspect-[16/9] w-full" radius="none" />
      <div className="flex flex-1 flex-col gap-4 p-6">
        <Skeleton className="h-5 w-24" radius="button" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-4/5" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <div className="mt-auto flex items-baseline justify-between gap-4">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-4 w-12" />
        </div>
      </div>
    </div>
  );
}
