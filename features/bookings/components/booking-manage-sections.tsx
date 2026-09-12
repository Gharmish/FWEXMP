import { MessageCircle } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/utils';
import { Link } from '@/lib/i18n';
import { buttonVariants } from '@/components/ui/button';
import { formatDate, formatSAR, formatTime } from '@/lib/format';
import { getHostContactPhoneForBooking } from '@/features/bookings/queries';
import { whatsappLink } from '@/lib/whatsapp';
import { supportWhatsappE164 } from '@/lib/env';
import { ReportProblemForm } from '@/features/disputes/components/report-problem-form';
import { hasOpenDisputeForBooking } from '@/features/disputes/queries';
import { CancelBookingButton } from '@/features/bookings/components/cancel-booking-button';
import { startInstant } from '@/features/bookings/lib/cancellation';
import { VerifiedBadge } from '@/features/hosts/components/verified-badge';
import { RescheduleBooking } from '@/features/bookings/components/reschedule-booking';
import { bookingOptions } from '@/features/bookings/lib/policy';
import {
  addDays,
  bookableDates,
  nowMinutesInRiyadh,
  todayInRiyadh,
} from '@/features/bookings/lib/availability';
import { getScheduleDataBySlug } from '@/features/availability/queries';
import type { BookableOption } from '@/features/bookings/types';
import { toArabicText } from '@/features/experiences/lib/arabic-content';
import type { BookingDetail } from '@/features/bookings/queries';
import type { getExperienceBySlug } from '@/features/experiences/queries';
import type { Locale } from '@/lib/i18n';

export interface BookingManageSectionsProps {
  booking: BookingDetail;
  /** The booking's uuid reference (the URL segment). */
  reference: string;
  locale: Locale;
  experience: Awaited<ReturnType<typeof getExperienceBySlug>>;
  /** Admitted by the read-only link token — every mutating form yields to a sign-in prompt. */
  tokenOnly: boolean;
  isHoldLapsed: boolean;
  bankFieldsCopy: NonNullable<
    React.ComponentProps<typeof CancelBookingButton>['bankFields']
  >['copy'];
}

/**
 * The "manage" tail of the booking confirmation page — report a problem,
 * WhatsApp lines, reschedule and cancel — with the reads only it needs
 * (open dispute, host phone, the reschedule calendar's schedule window).
 * Rendered behind Suspense so those reads stream in after the page's
 * first byte (2026-09 engineering audit REACT-04 / ARCH-06).
 */
export async function BookingManageSections({
  booking,
  reference,
  locale,
  experience,
  tokenOnly,
  isHoldLapsed,
  bankFieldsCopy,
}: BookingManageSectionsProps) {
  const ref = reference;
  const loc = locale;
  const t = await getTranslations('bookingConfirmed');

  /** Money-relevant deadlines carry a time-of-day, so render it. */
  const formatDeadline = (d: Date): string =>
    loc === 'ar'
      ? `${formatDate(d, loc)}، ${formatTime(d, loc)}`
      : `${formatDate(d, loc)}, ${formatTime(d, loc)}`;

  // Guest cancellation & rescheduling, from the booking's own policy
  // snapshot. Computed server-side so the page shows the true consequence
  // (full / partial / forfeited refund) before the guest commits — and so
  // an option is only ever rendered when the server action (which re-runs
  // the same `bookingOptions`) would also allow it.
  const options = booking
    ? bookingOptions({
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        dateStr: booking.date,
        startTime: booking.startTime,
        createdAt: new Date(booking.createdAt),
        // Full paid base (card + redeemed credit) — matches the server
        // action, so the quoted refund equals what actually comes back.
        totalAmountSar: booking.totalAmountSar + booking.walletAppliedSar,
        snapshot: booking.policy,
        rescheduleCount: booking.rescheduleCount,
        rescheduledFromDate: booking.rescheduledFromDate,
        now: new Date(),
      })
    : null;
  const cancelView = options && options.cancel.allowed ? options.cancel : null;
  const rescheduleView = options && options.reschedule.allowed ? options.reschedule : null;

  const RESCHEDULE_HORIZON_DAYS = 60;
  const todayRiyadh = todayInRiyadh();
  // Wave B — the remaining independent reads: the dispute note, the
  // host's WhatsApp line (the query itself enforces confirmed/completed
  // and returns null otherwise), and the reschedule calendar's schedule
  // window; each degrades to its "absent" value when not applicable.
  const [openDispute, hostPhone, schedule, tb] = await Promise.all([
    booking ? hasOpenDisputeForBooking(ref) : Promise.resolve(false),
    booking && (booking.status === 'confirmed' || booking.status === 'completed')
      ? getHostContactPhoneForBooking(ref)
      : Promise.resolve(null),
    booking && rescheduleView && !isHoldLapsed
      ? getScheduleDataBySlug(
          booking.experienceSlug,
          todayRiyadh,
          addDays(todayRiyadh, RESCHEDULE_HORIZON_DAYS),
        )
      : Promise.resolve(null),
    getTranslations('bookingRequest'),
  ]);
  const hostWhatsapp = hostPhone
    ? whatsappLink(hostPhone, t('whatsapp.prefill', { reference: booking?.referenceCode ?? ref }))
    : null;

  // Gharmish support over WhatsApp — every real booking, every state.
  // Pending requests, payment trouble, and cancellations are exactly
  // when guests reach for support, and the host line (above) only
  // exists once the host has accepted.
  const supportPhone = booking ? supportWhatsappE164() : null;
  const supportWhatsapp = supportPhone
    ? whatsappLink(
        supportPhone,
        t('supportWhatsapp.prefill', { reference: booking?.referenceCode ?? ref }),
      )
    : null;

  // Target dates for a reschedule — the same bookable-days computation the
  // experience page feeds its calendar, minus the booking's current date
  // and any day without room for this party. Only built (in wave B) when
  // the option will actually render.
  let rescheduleDates: BookableOption[] = [];
  if (booking && schedule) {
    rescheduleDates = bookableDates({
      fromStr: todayRiyadh,
      days: RESCHEDULE_HORIZON_DAYS + 1,
      availabilityWeekdays: schedule.availabilityWeekdays,
      blackoutDates: schedule.blackoutDates,
      stopSellDates: schedule.stopSellDates,
      maxGroupSize: schedule.maxGroupSize,
      bookedByDate: schedule.bookedByDate,
      startTime: schedule.startTime,
      nowMinutes: nowMinutesInRiyadh(),
      cutoffMinutes: schedule.bookingCutoffHours * 60,
    })
      .filter((d) => d.date !== booking.date && d.remaining >= booking.partySize)
      .map((d) => ({
        value: d.date,
        label: formatDate(new Date(`${d.date}T12:00:00Z`), loc, 'gregory', {
          weekday: 'short',
          day: 'numeric',
          month: 'long',
          timeZone: 'UTC',
        }),
        remaining: d.remaining,
        spotsLabel: tb('spotsLeft', { count: d.remaining }),
      }));
  }
  // The partial-step amount is deterministic from the snapshot, so the
  // confirm/done copy can quote it regardless of which refund state the
  // page happened to render in.
  const partialAmountSar = booking
    ? Math.floor(
        ((booking.totalAmountSar + booking.walletAppliedSar) * booking.policy.partialRefundBps) /
          10_000,
      )
    : 0;

  // Quiet sign-in prompt that stands in for every mutating form when the
  // viewer was admitted by the read-only link token — mirrors the
  // RefundToCardButton owner-check pattern and the booking-access
  // notice's email-evidence copy.
  const signInNotice = (
    <p className="text-sarat-black-600 max-w-xl text-sm leading-relaxed">
      {t('signInToManage')}{' '}
      <Link
        href="/sign-in?next=/me"
        className="text-sarat-black font-medium underline underline-offset-4 transition-opacity duration-200 hover:opacity-60"
      >
        {t('signInToManageCta')}
      </Link>
    </p>
  );

  return (
    <>
      {/* Report a problem — quiet disclosure, any real booking. The
          create-dispute action needs the cookie/session, so token-only
          viewers get the sign-in prompt instead of a doomed form. */}
      {booking && (
        <section className="mt-8 print:hidden">
          {openDispute ? (
            <p className="text-sarat-black-600 max-w-xl text-sm leading-relaxed">
              {t('dispute.openNote')}
            </p>
          ) : tokenOnly ? (
            signInNotice
          ) : (
            <ReportProblemForm
              reference={ref}
              copy={{
                summary: t('dispute.summary'),
                label: t('dispute.label'),
                placeholder: t('dispute.placeholder'),
                submit: t('dispute.submit'),
                pending: t('dispute.pending'),
                success: t('dispute.success'),
                errors: {
                  no_db: t('dispute.errors.noDb'),
                  not_found: t('dispute.errors.notFound'),
                  already_open: t('dispute.errors.alreadyOpen'),
                  throttled: t('dispute.errors.throttled'),
                  validation: t('dispute.errors.validation'),
                  server: t('dispute.errors.server'),
                },
              }}
            />
          )}
        </section>
      )}

      {/* Contact — WhatsApp deep links. The host line appears once the
          booking is accepted; Gharmish support is there in every state. */}
      {(hostWhatsapp || supportWhatsapp) && (
        <section className="border-sarat-black/8 rounded-card mt-12 flex flex-col gap-3 [border-width:0.5px] p-6 print:hidden">
          <h2 className="text-h2">
            {hostWhatsapp ? t('whatsapp.heading') : t('supportWhatsapp.heading')}
          </h2>
          <p className="text-sarat-black-600 max-w-2xl text-base leading-relaxed">
            {hostWhatsapp ? t('whatsapp.description') : t('supportWhatsapp.description')}
          </p>
          {/* "Will anyone show up?" — the verified receipt, one tap away. */}
          {hostWhatsapp && experience?.host.verified && (
            <VerifiedBadge
              variant="line"
              hostName={loc === 'ar' ? toArabicText(experience.host.name) : experience.host.name}
              locale={loc}
              verifiedAt={experience.host.verifiedAt}
            />
          )}
          <a
            href={hostWhatsapp ?? supportWhatsapp ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              buttonVariants({ variant: 'secondary', size: 'md' }),
              'inline-flex items-center gap-2 self-start',
            )}
          >
            <MessageCircle className="size-4 shrink-0" aria-hidden />
            {hostWhatsapp ? t('whatsapp.cta') : t('supportWhatsapp.cta')}
          </a>
          {/* Both lines available: support rides along as a quiet inline
              link under the host CTA. */}
          {hostWhatsapp && supportWhatsapp && (
            <p className="text-sarat-black-600 text-sm leading-relaxed">
              {t('supportWhatsapp.orSupport')}{' '}
              <a
                href={supportWhatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sarat-black font-medium underline underline-offset-4 transition-opacity duration-200 hover:opacity-60"
              >
                {t('supportWhatsapp.orSupportLink')}
              </a>
            </p>
          )}
        </section>
      )}

      {/* Reschedule — rendered ONLY when the booking's policy snapshot
          allows a move right now (same gate the server action re-checks).
          A lapsed hold is about to be released; moving it would imply the
          spot is still held. */}
      {rescheduleView && !isHoldLapsed && (
        <section className="border-sarat-black/8 rounded-card mt-12 flex flex-col gap-3 [border-width:0.5px] p-6 print:hidden">
          <h2 className="text-h2">{t('reschedule.heading')}</h2>
          <p className="text-sarat-black-600 max-w-2xl text-base leading-relaxed">
            {t('reschedule.policy', { deadline: formatDeadline(rescheduleView.deadline) })}
          </p>
          {tokenOnly ? (
            // The reschedule action needs the cookie/session — don't
            // render a calendar whose submit can only fail.
            signInNotice
          ) : rescheduleDates.length === 0 ? (
            <p className="text-sarat-black-600 max-w-2xl text-base leading-relaxed">
              {t('reschedule.noDates')}
            </p>
          ) : (
            <RescheduleBooking
              reference={ref}
              locale={loc}
              minDate={todayInRiyadh()}
              maxDate={addDays(todayInRiyadh(), 60)}
              options={rescheduleDates}
              copy={{
                label: t('reschedule.label'),
                pending: t('reschedule.pending'),
                confirmTitle: t('reschedule.heading'),
                // Raw templates — the client substitutes {date} with the
                // chosen option's pre-formatted label.
                confirm: t.raw('reschedule.confirm'),
                done: t.raw('reschedule.done'),
                calendar: {
                  prevMonth: t('reschedule.prevMonth'),
                  nextMonth: t('reschedule.nextMonth'),
                },
                errors: {
                  no_db: t('reschedule.errors.noDb'),
                  not_found: t('reschedule.errors.notFound'),
                  wrong_state: t('reschedule.errors.wrongState'),
                  already_started: t('reschedule.errors.alreadyStarted'),
                  window_passed: t('reschedule.errors.windowPassed'),
                  limit_reached: t('reschedule.errors.limitReached'),
                  date_unavailable: t('reschedule.errors.dateUnavailable'),
                  date_full: t('reschedule.errors.dateFull'),
                  validation: t('reschedule.errors.validation'),
                  server: t('reschedule.errors.server'),
                },
              }}
            />
          )}
        </section>
      )}

      {/* The reschedule option exists but is spent or expired: say WHY
          instead of silently dropping the section — a guest who saw it
          yesterday reads the disappearance as a bug (2026-08-28 audit).
          `wrong_state`/`already_started` keep the old behaviour: the
          section never applied to those bookings. */}
      {booking &&
        options &&
        !options.reschedule.allowed &&
        (options.reschedule.reason === 'window_passed' ||
          options.reschedule.reason === 'limit_reached') &&
        !isHoldLapsed && (
          <section className="border-sarat-black/8 rounded-card mt-12 flex flex-col gap-3 [border-width:0.5px] p-6 print:hidden">
            <h2 className="text-h2">{t('reschedule.heading')}</h2>
            <p className="text-sarat-black-600 max-w-2xl text-base leading-relaxed">
              {options.reschedule.reason === 'window_passed'
                ? t('reschedule.windowPassed', {
                    deadline: formatDeadline(
                      new Date(
                        startInstant(booking.date, booking.startTime).getTime() -
                          booking.policy.rescheduleCutoffHours * 60 * 60 * 1000,
                      ),
                    ),
                  })
                : t('reschedule.limitReached')}
            </p>
          </section>
        )}

      {/* Cancellation — only while the booking can still be cancelled.
          A lapsed hold is about to be released anyway; offering "cancel"
          there would imply the spot is still held. */}
      {cancelView && !isHoldLapsed && (
        <section className="border-sarat-black/8 rounded-card mt-12 flex flex-col gap-3 [border-width:0.5px] p-6 print:hidden">
          <h2 className="text-h2">{t('cancel.heading')}</h2>
          <p className="text-sarat-black-600 max-w-2xl text-base leading-relaxed">
            {cancelView.refund === 'none_needed'
              ? t('cancel.policyUnpaid')
              : cancelView.refund === 'full'
                ? cancelView.partialDeadline
                  ? // Moderate/strict: disclose the 50% step up front. The
                    // full-refund deadline is the grace-aware one — after a
                    // late booking it can sit past the tier deadline.
                    t('cancel.policyRefundableThenPartial', {
                      deadline: formatDeadline(cancelView.fullRefundUntil),
                      amount: formatSAR(partialAmountSar, loc),
                      partialDeadline: formatDeadline(cancelView.partialDeadline),
                    })
                  : t('cancel.policyRefundable', {
                      deadline: formatDeadline(cancelView.fullRefundUntil),
                    })
                : cancelView.refund === 'partial' && cancelView.partialDeadline
                  ? t('cancel.policyPartial', {
                      amount: formatSAR(cancelView.amountSar, loc),
                      deadline: formatDeadline(cancelView.partialDeadline),
                    })
                  : t('cancel.policyForfeited')}
          </p>
          {tokenOnly ? (
            // The cancel action needs the cookie/session — a token-only
            // viewer's submit would fail with "we couldn't find that
            // booking", so prompt for sign-in instead.
            signInNotice
          ) : (
            <CancelBookingButton
              reference={ref}
              locale={loc}
              copy={{
                label: t('cancel.label'),
                pending: t('cancel.pending'),
                confirm:
                  cancelView.refund === 'forfeited'
                    ? t('cancel.confirmForfeited')
                    : cancelView.refund === 'partial'
                      ? t('cancel.confirmPartial', {
                          amount: formatSAR(cancelView.amountSar, loc),
                        })
                      : cancelView.refund === 'full'
                        ? // Quote the amount and destination, like the
                          // partial branch — a full refund is the one case
                          // the dialog used to leave unstated.
                          t('cancel.confirmFull', {
                            amount: formatSAR(cancelView.amountSar, loc),
                          })
                        : t('cancel.confirm'),
                done: {
                  none: t('cancel.doneUnpaid'),
                  refunded: t('cancel.doneRefunded'),
                  refunded_partial: t('cancel.donePartialRefunded', {
                    amount: formatSAR(partialAmountSar, loc),
                  }),
                  refund_pending: t('cancel.doneRefundPending'),
                  refund_pending_partial: t('cancel.donePartialRefundPending', {
                    amount: formatSAR(partialAmountSar, loc),
                  }),
                  forfeited: t('cancel.doneForfeited'),
                },
                errors: {
                  forbidden: t('cancel.errors.forbidden'),
                  no_db: t('cancel.errors.noDb'),
                  not_found: t('cancel.errors.notFound'),
                  wrong_state: t('cancel.errors.wrongState'),
                  already_started: t('cancel.errors.alreadyStarted'),
                  validation: t('cancel.errors.validation'),
                  bank_details_required: t('cancel.errors.bankDetailsRequired'),
                  server: t('cancel.errors.server'),
                },
              }}
              // A refund is owed → collect the payee up front, in the same
              // form, so the manual queue entry is born with somewhere to go.
              bankFields={
                cancelView.refund === 'full' || cancelView.refund === 'partial'
                  ? { heading: t('refundBank.cancelHeading'), copy: bankFieldsCopy }
                  : undefined
              }
            />
          )}
        </section>
      )}
    </>
  );
}
