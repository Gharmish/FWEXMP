import { NextResponse } from 'next/server';
import { toCsv } from '@/lib/csv';
import { adminGuard } from '@/features/admin/guard';
import { listUsersForAdmin } from '@/features/admin/users/queries';

/**
 * People (User-360) CSV export. Same gate posture as the bookings
 * export: non-admins get 404, and the list query self-gates. PII note —
 * this includes phone/email in cleartext, so it's admin-only like the
 * directory it mirrors.
 *
 * Gated on `adminGuard()`, second factor included. This is the single
 * highest-value object in the system — every guest's name, phone and
 * email in one file — and until 2026-08-21 it was reachable with the
 * WhatsApp OTP alone, because a route handler never renders the admin
 * layout that shows the TOTP screen.
 */
export async function GET(): Promise<NextResponse> {
  const block = await adminGuard();
  if (block) {
    return block.reason === 'no_db'
      ? NextResponse.json({ error: 'no_db' }, { status: 503 })
      : NextResponse.json({ error: 'not_found' }, { status: 404 });
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
