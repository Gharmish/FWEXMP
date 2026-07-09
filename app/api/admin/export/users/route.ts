import { NextResponse } from 'next/server';
import { serverEnv } from '@/lib/env';
import { toCsv } from '@/lib/csv';
import { getCurrentUser } from '@/features/auth/queries';
import { isAdminUser } from '@/features/admin/auth';
import { listUsersForAdmin } from '@/features/admin/users/queries';

/**
 * People (User-360) CSV export. Same gate posture as the bookings
 * export: non-admins get 404, and the list query self-gates. PII note —
 * this includes phone/email in cleartext, so it's admin-only like the
 * directory it mirrors.
 */
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!isAdminUser(user)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (!serverEnv.DATABASE_URL) {
    return NextResponse.json({ error: 'no_db' }, { status: 503 });
  }

  const rows = await listUsersForAdmin();
  const csv = toCsv(
    [
      'name',
      'roles',
      'phone',
      'email',
      'host_status',
      'guest_suspended',
      'application_status',
      'bookings',
      'spent_sar',
      'published_experiences',
      'joined_at',
    ],
    rows.map((r) => [
      r.name,
      r.roles.join(';'),
      r.phone,
      r.email,
      r.hostStatus,
      r.guestSuspended ? 'yes' : 'no',
      r.applicationStatus,
      r.bookings,
      r.spentSar,
      r.publishedExperiences,
      r.createdAt,
    ]),
  );

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="gharmish-people.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
