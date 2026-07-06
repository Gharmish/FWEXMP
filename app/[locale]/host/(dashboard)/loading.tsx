import { Skeleton } from '@/components/ui/skeleton';

/**
 * Host dashboard segment loading state — a layout-mirroring skeleton (no
 * spinner, BRIEF §3) shown while the overview/bookings/earnings queries
 * run. Mirrors the admin segment skeleton: heading block, KPI row, then
 * two content panels, which is the rough shape of every dashboard page.
 */
export default function HostDashboardLoading() {
  return (
    <div className="flex flex-col gap-12" aria-busy>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-12 w-72" radius="sm" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" radius="card" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-64 w-full lg:col-span-2" radius="card" />
        <Skeleton className="h-64 w-full" radius="card" />
      </div>
    </div>
  );
}
