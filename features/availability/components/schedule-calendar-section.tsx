import { getTranslations } from 'next-intl/server';
import type { Locale } from '@/lib/i18n';
import { getScheduleData } from '@/features/availability/queries';
import {
  buildCalendarMonth,
  monthBounds,
  parseYearMonth,
} from '@/features/availability/lib/calendar';
import { AvailabilityCalendar } from '@/features/availability/components/availability-calendar';

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function todayInRiyadh(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
}

/**
 * Drop-in availability calendar: resolves the month (from `?ym` or the
 * current KSA month), loads the schedule + per-day booked counts, builds
 * the grid, and renders it. Shared by the host experience page and the
 * admin editor. Renders nothing when there's no DB (offline/preview).
 */
export async function ScheduleCalendarSection({
  experienceId,
  locale,
  basePath,
  canEdit,
  ym,
}: {
  experienceId: string;
  locale: Locale;
  basePath: string;
  canEdit: boolean;
  ym?: string;
}) {
  const today = todayInRiyadh();
  const [ty, tm] = today.split('-').map(Number);
  const picked = parseYearMonth(ym) ?? { year: ty, month: tm };
  const { from, to } = monthBounds(picked.year, picked.month);

  const data = await getScheduleData(experienceId, from, to);
  if (!data) return null;

  const calendar = buildCalendarMonth({
    year: picked.year,
    month: picked.month,
    availabilityWeekdays: data.availabilityWeekdays,
    blackoutDates: data.blackoutDates,
    stopSellDates: data.stopSellDates,
    maxGroupSize: data.maxGroupSize,
    bookedByDate: data.bookedByDate,
    todayStr: today,
  });

  const [t, tWeek] = await Promise.all([
    getTranslations('availabilityCalendar'),
    getTranslations('hostExperiences.form.weekdays'),
  ]);

  return (
    <AvailabilityCalendar
      experienceId={experienceId}
      calendar={calendar}
      locale={locale}
      basePath={basePath}
      canEdit={canEdit}
      copy={{
        heading: t('heading'),
        intro: canEdit ? t('introEdit') : t('introView'),
        prev: t('prev'),
        next: t('next'),
        closeDay: t('closeDay'),
        openDay: t('openDay'),
        closeToNew: t('closeToNew'),
        reopenToNew: t('reopenToNew'),
        spots: t('spots'),
        legendAvailable: t('legendAvailable'),
        legendFull: t('legendFull'),
        legendStopSell: t('legendStopSell'),
        legendClosed: t('legendClosed'),
        legendOff: t('legendOff'),
        weekdays: WEEKDAY_KEYS.map((k) => tWeek(k)),
      }}
    />
  );
}
