import { NextResponse, type NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { reportError } from '@/lib/log';
import {
  BOOKING_LINK_TOKEN_PARAM,
  bookingManageUrl,
} from '@/features/bookings/lib/link-token';
import { renderBookingIcs } from '@/features/bookings/lib/booking-ics';
import { calendarEventDescription, googleMapsLink } from '@/features/bookings/lib/calendar-links';
import { startInstant } from '@/features/bookings/lib/cancellation';
import { getBookingViewForViewer } from '@/features/bookings/queries';
import { getExperienceBySlug } from '@/features/experiences/queries';
import { toArabicText } from '@/features/experiences/lib/arabic-content';

/** UUID v4 shape — the only thing we accept as a public reference. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `.ics` download behind the "Add to calendar" button on the booking
 * confirmation page (Apple Calendar / Outlook; Google gets a template
 * deep link instead). Viewer-gated exactly like the page itself, and
 * it answers each withheld state the way the page does (2026-08-08):
 * an unknown reference 404s, while a REAL booking whose viewer can't
 * prove ownership here — the URL opened on a second device, after a
 * cookie clear, or after a newer booking replaced the cookie — is sent
 * to the confirmation page, which explains the state and offers the way
 * back in. A bare 404 there reads as "your booking is gone". Access
 * itself is unchanged: the reference alone still authorizes nothing.
 * Same UID as the email attachment, so a guest who uses both ends up
 * with one event, not two.
 *
 * Only a fully-settled confirmed booking is a calendar event: nothing
 * owed (paid, or a booking that never required online payment) and not
 * yet cancelled/completed. Mirrors the page's e-ticket gate.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ref: string }> },
): Promise<NextResponse> {
  const { ref } = await params;
  if (!UUID_RE.test(ref)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const localeParam = request.nextUrl.searchParams.get('locale');
  const locale = localeParam === 'ar' ? 'ar' : 'en';
  // Signed proof from a link we sent — the confirmation page forwards it
  // onto this href so the .ics stays reachable for a cookieless browser.
  const token = request.nextUrl.searchParams.get(BOOKING_LINK_TOKEN_PARAM);

  // Degrade on a hung/failed DB read instead of 500ing — the guest can
  // retry from the still-open confirmation page.
  let view;
  try {
    view = await getBookingViewForViewer(ref, token);
  } catch (error) {
    reportError(error, { surface: 'bookings:calendarRoute', reference: ref });
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }

  if (view.state === 'forbidden') {
    // Hand the guest to the page that can talk to them. Only reachable
    // by opening this URL directly: the "Add to calendar" button renders
    // solely for a viewer who has already passed this same check.
    const redirect = NextResponse.redirect(
      new URL(`/${locale}/book/confirmed/${ref}`, request.nextUrl),
      303,
    );
    redirect.headers.set('Cache-Control', 'no-store');
    return redirect;
  }

  // Everything else — unknown reference, no DB, or a booking that isn't
  // a settled confirmed event — is the same opaque 404 as before.
  const booking = view.state === 'ok' ? view.booking : undefined;
  if (
    !booking ||
    booking.status !== 'confirmed' ||
    !(booking.paymentStatus === 'paid' || booking.paymentDeadline === null)
  ) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const [experience, t, tEmail] = await Promise.all([
    getExperienceBySlug(booking.experienceSlug),
    getTranslations({ locale, namespace: 'bookingConfirmed' }),
    getTranslations({ locale, namespace: 'bookingEmail' }),
  ]);

  const title = experience ? (locale === 'ar' ? experience.titleAr : experience.titleEn) : null;
  const placeName = experience
    ? locale === 'ar'
      ? toArabicText(experience.placeName)
      : experience.placeName
    : null;

  const referenceCode = booking.referenceCode ?? ref;
  const ics = renderBookingIcs({
    uid: `${referenceCode}@gharmish.com`,
    start: startInstant(booking.date, booking.startTime),
    durationMinutes: experience?.durationMinutes ?? 180,
    summary: title ?? tEmail('genericExperience'),
    location: placeName,
    description: calendarEventDescription({
      referenceLine: `${t('referenceLabel')}: ${referenceCode}`,
      manageUrl: bookingManageUrl(locale, ref),
      mapUrl: experience ? googleMapsLink(experience.lat, experience.lng) : null,
    }),
  });

  return new NextResponse(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="Gharmish-${referenceCode}.ics"`,
      // Private, capability-URL content — never cache-shared.
      'Cache-Control': 'no-store',
    },
  });
}
