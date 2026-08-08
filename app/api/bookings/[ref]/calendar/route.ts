import { NextResponse, type NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { reportError } from '@/lib/log';
import { SITE_URL } from '@/lib/site';
import { renderBookingIcs } from '@/features/bookings/lib/booking-ics';
import {
  calendarEventDescription,
  googleMapsLink,
} from '@/features/bookings/lib/calendar-links';
import { startInstant } from '@/features/bookings/lib/cancellation';
import { getBookingByReferenceForViewer } from '@/features/bookings/queries';
import { getExperienceBySlug } from '@/features/experiences/queries';
import { toArabicText } from '@/features/experiences/lib/arabic-content';

/** UUID v4 shape — the only thing we accept as a public reference. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `.ics` download behind the "Add to calendar" button on the booking
 * confirmation page (Apple Calendar / Outlook; Google gets a template
 * deep link instead). Viewer-gated exactly like the page itself —
 * `getBookingByReferenceForViewer` returns undefined for a stranger,
 * which surfaces as the same 404 an unknown reference gets (no
 * enumeration signal). Same UID as the email attachment, so a guest
 * who uses both ends up with one event, not two.
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

  // Degrade on a hung/failed DB read instead of 500ing — the guest can
  // retry from the still-open confirmation page.
  let booking;
  try {
    booking = await getBookingByReferenceForViewer(ref);
  } catch (error) {
    reportError(error, { surface: 'bookings:calendarRoute', reference: ref });
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
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

  const title = experience
    ? locale === 'ar'
      ? experience.titleAr
      : experience.titleEn
    : null;
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
      manageUrl: `${SITE_URL}/${locale}/book/confirmed/${ref}`,
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
