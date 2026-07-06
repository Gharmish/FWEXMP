import { Skeleton } from '@/components/ui/skeleton';

/**
 * Host profile loading state — avatar + identity block, then the
 * experiences grid, mirroring the profile layout so nothing shifts when
 * the data lands (no spinner, BRIEF §3).
 */
export default function HostProfileLoading() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 py-16" aria-busy>
      <div className="flex items-center gap-6">
        <Skeleton className="size-24 shrink-0" radius="full" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-8 w-56" radius="sm" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <Skeleton className="h-24 w-full max-w-2xl" radius="card" />
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
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
