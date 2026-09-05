import { Skeleton } from '@/components/ui/skeleton';

/**
 * Host dashboard segment loading state — a layout-mirroring skeleton (no
 * spinner, BRIEF §3) shown while the page queries run. Mirrors the Today
 * page: eyebrow + greeting, an attention/coming-up panel, then the two
 * side-by-side cards (money, your numbers) — close enough to every
 * dashboard page that the swap doesn't jump.
 */
export default function HostDashboardLoading() {
  return (
    <div className="flex flex-col gap-12" aria-busy>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-12 w-72 max-w-full" radius="sm" />
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-7 w-40" radius="sm" />
        <Skeleton className="h-48 w-full" radius="card" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-56 w-full" radius="card" />
        <Skeleton className="h-56 w-full" radius="card" />
      </div>
    </div>
  );
}
