import { Skeleton } from '@/components/ui/skeleton';

/**
 * Admin segment loading state — a layout-mirroring skeleton (no spinner,
 * BRIEF §3) shown on first navigation into the dashboard while its
 * aggregate queries run. Filter changes don't hit this: the picker uses a
 * React transition that keeps the current view visible while it refetches.
 */
export default function AdminLoading() {
  return (
    <div className="flex flex-col gap-12" aria-busy>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-12 w-72" radius="sm" />
        <Skeleton className="h-4 w-96 max-w-full" />
        <Skeleton className="h-16 w-full" radius="card" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" radius="card" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-64 w-full lg:col-span-2" radius="card" />
        <Skeleton className="h-64 w-full" radius="card" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-40 w-full" radius="card" />
        <Skeleton className="h-40 w-full" radius="card" />
      </div>
    </div>
  );
}
