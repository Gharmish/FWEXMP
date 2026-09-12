import { cookies } from 'next/headers';
import { LAST_BOOKING_COOKIE, serializeLastBookingCookie } from '@/features/account/cookie';

const LAST_BOOKING_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90; // 90 days

/** Remember this device's last request so /me and the throttle copy can point at it. */
export async function writeLastBookingCookie(
  reference: string,
  experienceSlug: string,
): Promise<void> {
  const store = await cookies();
  store.set(LAST_BOOKING_COOKIE, serializeLastBookingCookie({ reference, experienceSlug }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: LAST_BOOKING_COOKIE_MAX_AGE_SECONDS,
  });
}
