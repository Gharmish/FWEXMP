import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/features/auth/queries';
import { isAdminUser } from '@/features/admin/auth';

/**
 * Admin gate. Anyone not on the `ADMIN_PHONES` allowlist gets a 404 —
 * not a 401, not a redirect. We don't want to advertise that `/admin`
 * exists to logged-in non-admins or signed-out crawlers.
 *
 * The check runs on every request to every child route, so individual
 * pages don't need to re-gate. They still call queries that re-gate
 * defensively (defence in depth).
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!isAdminUser(user)) notFound();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-12 sm:py-16">
      {children}
    </div>
  );
}
