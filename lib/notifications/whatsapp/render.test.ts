import { describe, expect, it } from 'vitest';
import { renderWhatsApp } from './render';

const base = {
  experienceName: 'Aseeri coffee ritual and saleeg lunch',
  date: 'Thursday, 27 August',
  time: '9:00 AM',
  guests: '1 guest',
  payout: 'SAR 221',
  bookingPath: 'en/host/bookings/GH-7K3M9X',
  guestsNumber: '1',
  dashboardUrl: 'https://gharmish.com/en/host/bookings',
};

describe('renderWhatsApp', () => {
  it('renders the English host booking with positional variables and a button', () => {
    const out = renderWhatsApp('host_booking_confirmed', 'en', base);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.message.template).toBe('v3/host_booking_confirmed');
    expect(out.message.variables).toEqual({
      '1': base.experienceName,
      '2': base.date,
      '3': base.time,
      '4': base.guests,
      '5': base.payout,
      '6': base.bookingPath,
    });
    expect(out.message.buttons).toEqual([
      { title: 'View booking', url: 'https://gharmish.com/en/host/bookings/GH-7K3M9X' },
    ]);
    expect(out.message.preview).toContain('💰 Your payout: SAR 221');
    expect(out.message.preview).not.toContain('{');
  });

  it('renders the Arabic host booking in the benchmark shape', () => {
    const out = renderWhatsApp('host_booking_confirmed', 'ar', {
      ...base,
      experienceName: 'طقوس القهوة العسيرية وغداء السليق',
      date: 'الخميس، 27 أغسطس',
      time: '9:00 صباحًا',
      guests: 'ضيف واحد',
      payout: '221 ر.س.',
      bookingPath: 'ar/host/bookings/GH-7K3M9X',
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.message.preview).toMatchInlineSnapshot(`
      "✅ تم تأكيد الحجز

      طقوس القهوة العسيرية وغداء السليق

      📅 الخميس، 27 أغسطس
      🕘 9:00 صباحًا
      👤 ضيف واحد

      💰 مستحقاتك: 221 ر.س.

      اكتمل الدفع. نتمنى لك ولضيفك تجربة جميلة."
    `);
    // The URL lives in the button, never inside the Arabic prose.
    expect(out.message.preview).not.toMatch(/https?:|\/host\//);
  });

  it('maps the legacy fallback with its own positional slots', () => {
    const out = renderWhatsApp('host_booking_confirmed', 'en', base);
    expect(out.ok && out.message.fallback).toEqual({
      template: 'host_payment_received',
      variables: {
        '1': base.experienceName,
        '2': base.date,
        '3': base.time,
        '4': base.payout,
        '5': base.dashboardUrl,
      },
    });
  });

  it('refuses to render when a required variable is missing or unusable', () => {
    const missing = renderWhatsApp('host_booking_confirmed', 'en', { ...base, payout: undefined });
    expect(missing).toEqual({ ok: false, error: 'missing required variables: payout', missing: ['payout'] });
    const invalid = renderWhatsApp('host_booking_confirmed', 'en', { ...base, date: 'Invalid Date' });
    expect(invalid.ok).toBe(false);
    const nan = renderWhatsApp('host_booking_confirmed', 'en', { ...base, payout: 'NaN' });
    expect(nan.ok).toBe(false);
  });

  it('rejects unknown templates', () => {
    expect(renderWhatsApp('nope', 'en', {}).ok).toBe(false);
  });

  it('accepts finite numbers and drops extra keys silently', () => {
    const out = renderWhatsApp('support_ticket_update', 'ar', { ticketReference: 'TK-1', extra: 'x' });
    expect(out.ok && out.message.variables).toEqual({ '1': 'TK-1' });
  });
});
