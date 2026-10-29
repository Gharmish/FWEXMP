import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Moderation notices go out before approval, while a draft may be in one
 * language only: the listing name must fall back to the real title, never
 * the TODO(ar) marker or an empty string.
 */

vi.mock('server-only', () => ({}));
const dispatchNotification = vi.fn<(input: unknown) => Promise<void>>(async () => undefined);
vi.mock('@/lib/notifications/dispatch', () => ({
  notificationsConfigured: () => true,
  dispatchNotification: (input: unknown) => dispatchNotification(input),
}));
let hostLocale: 'ar' | 'en' = 'ar';
vi.mock('@/lib/notifications/host-contact', () => ({
  hostNotificationContact: async () => ({
    name: 'Host',
    email: 'host@example.com',
    phone: '+966500000000',
    locale: hostLocale,
  }),
}));
vi.mock('@/lib/notifications/whatsapp', () => ({
  whatsappPayload: (template: string, locale: string, vars: Record<string, string>) => ({
    template,
    locale,
    vars,
  }),
}));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${String(values.experience)}` : key,
}));
vi.mock('@/features/bookings/lib/booking-email-render', () => ({
  renderReceiptEmail: (input: { rows: { value: string }[] }) => ({
    html: input.rows.map((r) => r.value).join('|'),
    text: '',
  }),
}));

let experience: Record<string, unknown>;
vi.mock('@/lib/db', () => ({
  db: { query: { experiences: { findFirst: async () => experience } } },
}));

const { sendExperienceModerationEmail } = await import('./moderation-email');
const { AR_PLACEHOLDER } = await import('@/lib/ar-placeholder');

interface Dispatched {
  email: { subject: string; html: string };
  whatsapp?: { vars: { experienceName: string } };
}

function lastDispatch(): Dispatched {
  const call = dispatchNotification.mock.calls.at(-1);
  return call?.[0] as Dispatched;
}

beforeEach(() => {
  dispatchNotification.mockClear();
});

describe('sendExperienceModerationEmail title', () => {
  it('uses the English title for an Arabic-locale host whose Arabic title is still the marker', async () => {
    hostLocale = 'ar';
    experience = {
      id: 'e1',
      slug: 'sunrise-hike',
      titleEn: 'Sunrise hike',
      titleAr: AR_PLACEHOLDER,
      hostId: 'h1',
    };
    await sendExperienceModerationEmail('e1', 'changes_requested');
    const sent = lastDispatch();
    expect(sent.email.subject).toBe('changesSubject:Sunrise hike');
    expect(sent.email.html).toBe('Sunrise hike');
    expect(sent.whatsapp?.vars.experienceName).toBe('Sunrise hike');
  });

  it('uses the Arabic title for an English-locale host on an Arabic-only draft', async () => {
    hostLocale = 'en';
    experience = {
      id: 'e1',
      slug: 'sunrise-hike',
      titleEn: '',
      titleAr: 'رحلة الشروق',
      hostId: 'h1',
    };
    await sendExperienceModerationEmail('e1', 'rejected');
    const sent = lastDispatch();
    expect(sent.email.subject).toBe('rejectedSubject:رحلة الشروق');
    expect(sent.email.html).toBe('رحلة الشروق');
  });

  it("keeps the host's own language when both titles are real", async () => {
    hostLocale = 'ar';
    experience = {
      id: 'e1',
      slug: 'sunrise-hike',
      titleEn: 'Sunrise hike',
      titleAr: 'رحلة الشروق',
      hostId: 'h1',
    };
    await sendExperienceModerationEmail('e1', 'approved');
    expect(lastDispatch().whatsapp?.vars.experienceName).toBe('رحلة الشروق');
  });
});
