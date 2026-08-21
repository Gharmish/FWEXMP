import { Lock } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/utils';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { buttonVariants } from '@/components/ui/button';
import { getCurrentUser } from '@/features/auth/queries';
import { Pop } from '@/components/ui/motion';

/**
 * What the confirmation page renders when the booking EXISTS but this
 * viewer holds neither proof of ownership (2026-08-08).
 *
 * The anonymous funnel (name + phone, no account) authorizes on a signed
 * per-browser cookie, so this is an everyday state for a real guest —
 * they opened the emailed/WhatsApped link on another device, cleared
 * cookies, or made a second booking (the cookie holds only the last
 * one). Before this existed the page told them their booking "was not
 * stored", which is false and alarming for a paid booking.
 *
 * Deliberately says nothing about the booking itself: no reference, no
 * status, no guest details. The recovery route is sign-in with the
 * EMAIL used at booking time — `/me` runs the identity chokepoint
 * (`resolveGuestForUser`), which links the anonymous guest row once the
 * session proves that address, after which the booking is listed and
 * this page opens normally. That is why the CTA targets `/me` rather
 * than bouncing straight back here: the link has to happen first.
 *
 * It used to say "sign in with the phone number you used" — and that
 * worked, which was the problem (2026-08-21 security audit, H4). The
 * phone on an anonymous booking is typed into a form and never
 * verified, so "complete an OTP on that number" was a recovery route
 * for the wrong holder of a mistyped or recycled number just as much as
 * for the guest. The email is the factor a wrong number does not carry.
 * A guest who booked without one recovers through `/help`, which is why
 * that CTA sits beside the sign-in button rather than below the fold.
 */
interface BookingAccessNoticeProps {
  locale: Locale;
}

export async function BookingAccessNotice({ locale }: BookingAccessNoticeProps) {
  const t = await getTranslations('bookingConfirmed.restricted');
  // Already signed in (just not as the booking's guest) → the sign-in
  // page would bounce them straight to /me, so name the destination.
  const signedIn = Boolean(await getCurrentUser());

  return (
    <article className="mx-auto w-full max-w-3xl px-6 py-10 sm:py-20">
      <header className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <Pop>
            <Lock className="text-sarat-black-600 size-7 shrink-0" aria-hidden />
          </Pop>
          <p
            className={cn(
              'text-sarat-black-600 text-[11px] font-medium',
              locale === 'en' && 'tracking-[0.2em] uppercase',
            )}
          >
            {t('eyebrow')}
          </p>
        </div>
        <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
          {t('title')}
        </h1>
        <p className="text-sarat-black-600 max-w-2xl text-lg leading-relaxed">{t('description')}</p>
        <p className="text-sarat-black-600 max-w-2xl text-base leading-relaxed">
          {t('deviceHint')}
        </p>
      </header>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/sign-in?next=/me"
          className={cn(buttonVariants({ variant: 'primary', size: 'lg' }))}
        >
          {signedIn ? t('myBookings') : t('signIn')}
        </Link>
        <Link href="/help" className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }))}>
          {t('help')}
        </Link>
      </div>
    </article>
  );
}
