import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Host notification preferences at the contact resolver (2026-08-22):
 * a switched-off channel reads as "no address", so every sender and the
 * dispatcher behave as if the host had never given that address.
 */

let hostRow: Record<string, unknown> | null = null;
let applicationRow: Record<string, unknown> | null = null;

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({
  db: {
    query: {
      hosts: { findFirst: async () => hostRow },
      hostApplications: { findFirst: async () => applicationRow },
    },
  },
}));

import { applyChannelPrefs, hostNotificationContact } from '@/lib/notifications/host-contact';

beforeEach(() => {
  applicationRow = null;
  hostRow = {
    id: 'host-1',
    name: 'Abdulaziz',
    languages: ['ar', 'en'],
    contactEmail: 'host@example.com',
    contactPhone: '+966559002592',
    notifyEmail: true,
    notifyWhatsapp: true,
    notifyReminders: true,
    notifyReviews: true,
  };
});

describe('applyChannelPrefs', () => {
  it('nulls the address of a switched-off channel and keeps the rest', () => {
    expect(
      applyChannelPrefs(
        { email: 'a@b.c', phone: '+966500000000', extra: 1 },
        { notifyEmail: false, notifyWhatsapp: true },
      ),
    ).toEqual({ email: null, phone: '+966500000000', extra: 1 });
  });
});

describe('hostNotificationContact', () => {
  it('returns both addresses and the category opt-ins by default', async () => {
    expect(await hostNotificationContact('host-1')).toEqual({
      email: 'host@example.com',
      phone: '+966559002592',
      locale: 'ar',
      name: 'Abdulaziz',
      prefs: { reminders: true, reviews: true },
    });
  });

  it('drops the WhatsApp address when the host switched WhatsApp off', async () => {
    hostRow = { ...hostRow!, notifyWhatsapp: false, notifyReminders: false };
    const contact = await hostNotificationContact('host-1');
    expect(contact?.phone).toBeNull();
    expect(contact?.email).toBe('host@example.com');
    expect(contact?.prefs).toEqual({ reminders: false, reviews: true });
  });

  it('applies the toggles AFTER the application-row fallback', async () => {
    hostRow = { ...hostRow!, contactEmail: null, contactPhone: null, notifyEmail: false };
    applicationRow = { contactEmail: 'app@example.com', contactPhone: '+966511111111' };
    const contact = await hostNotificationContact('host-1');
    expect(contact?.email).toBeNull();
    expect(contact?.phone).toBe('+966511111111');
  });

  it('still answers null when neither channel is addressable', async () => {
    hostRow = { ...hostRow!, contactEmail: null, notifyWhatsapp: false };
    expect(await hostNotificationContact('host-1')).toBeNull();
  });
});
