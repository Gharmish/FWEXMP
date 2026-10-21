import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
type DispatchInput = { email: { subject: string } };
const dispatchNotification = vi.fn<(input: DispatchInput) => Promise<void>>(async () => undefined);
vi.mock('@/lib/notifications/dispatch', () => ({
  notificationsConfigured: () => true,
  dispatchNotification: (input: DispatchInput) => dispatchNotification(input),
}));
vi.mock('@/features/marketing/unsubscribe-token', () => ({
  unsubscribeUrl: () => 'https://example.test/unsubscribe',
}));
vi.mock('@/features/experiences/queries', () => ({ getExperiences: async () => [] }));
// Render the subject as `key:city` so the test sees the interpolated city.
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string, values?: Record<string, unknown>) =>
    values && 'city' in values ? `${key}:${String(values.city)}` : key,
}));
const booking = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
}));
vi.mock('@/lib/db', () => ({
  db: { query: { bookings: { findFirst: async () => booking.row } } },
}));

import { sendRebookEmail } from './lifecycle-email';

function completedBooking(locale: 'en' | 'ar') {
  return {
    id: 'b-1',
    status: 'completed',
    referenceCode: 'GH-TEST',
    guest: {
      name: 'Guest',
      email: 'guest@example.com',
      preferredLanguage: locale,
      marketingConsentAt: new Date(),
    },
    experience: {
      slug: 'sunrise-hike',
      city: 'Abha',
      category: 'adventure',
      titleEn: 'Sunrise hike',
      titleAr: 'رحلة الشروق',
    },
  };
}

beforeEach(() => {
  dispatchNotification.mockClear();
});

describe('sendRebookEmail city label', () => {
  it('names the city in Arabic for an Arabic-speaking guest', async () => {
    booking.row = completedBooking('ar');
    await sendRebookEmail('ref');
    expect(dispatchNotification.mock.calls[0][0].email.subject).toBe('rebookSubject:أبها');
  });

  it('keeps the English city name for an English-speaking guest', async () => {
    booking.row = completedBooking('en');
    await sendRebookEmail('ref');
    expect(dispatchNotification.mock.calls[0][0].email.subject).toBe('rebookSubject:Abha');
  });
});
