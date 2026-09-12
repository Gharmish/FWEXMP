import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbFake } from '@/lib/test/db-fake';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/cache-tags', () => ({ revalidateExperienceCaches: vi.fn() }));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
let actor: Record<string, unknown> = { adminUserId: 'admin-1' };
vi.mock('@/features/admin/guard', () => ({
  requireAdminActor: async () => actor,
  adminGateRefused: (a: Record<string, unknown>) => 'refused' in a,
  adminFailureMessage: () => 'forbidden',
}));
const targets = vi.hoisted(() => ({
  value: { guestId: 'g1', hostId: 'h1', authUserId: 'u1' } as {
    guestId: string | null;
    hostId: string | null;
    authUserId: string | null;
  } | null,
}));
vi.mock('@/features/admin/users/queries', () => ({
  resolveEditTargets: async () => targets.value,
}));
vi.mock('@/lib/pii-crypto', () => ({
  encryptPii: (v: string | null) => (v ? `enc:${v}` : v),
  decryptPii: (v: string | null) => v?.replace(/^enc:/, '') ?? null,
}));

type Row = Record<string, unknown>;
let guest: Row | undefined;
let host: Row | undefined;
let phoneTaken = false;
const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof createDbFake> | null }));
vi.mock('@/lib/db', () => ({
  get db() {
    return fake.current;
  },
}));

import { updateGuestProfile, updateHostProfile } from './actions';

const IBAN = 'SA0380000000608010167519';
const guestForm = (over: Record<string, string> = {}) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries({
    key: 'auth:u1',
    name: 'Sara',
    email: 'sara@example.com',
    phone: '+966512345678',
    preferredLanguage: 'ar',
    billingCountry: 'sa',
    ...over,
  }))
    fd.set(k, v);
  return fd;
};
const hostForm = (over: Record<string, string> = {}, languages = ['ar', 'en', 'ar']) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries({
    key: 'auth:u1',
    name: 'Sara Coffee',
    bioEn: 'x'.repeat(40),
    bioAr: '',
    contactEmail: '',
    city: 'Abha',
    region: 'Aseer',
    nationalId: '1234567890',
    crNumber: '',
    payoutIban: IBAN,
    ...over,
  }))
    fd.set(k, v);
  for (const l of languages) fd.append('languages', l);
  return fd;
};
const initial = { success: false };

beforeEach(() => {
  actor = { adminUserId: 'admin-1' };
  targets.value = { guestId: 'g1', hostId: 'h1', authUserId: 'u1' };
  phoneTaken = false;
  guest = {
    id: 'g1',
    name: 'Sara',
    email: null,
    phone: '+966500000000',
    preferredLanguage: 'en',
    billingStreet1: null,
    billingCity: null,
    billingState: null,
    billingPostcode: null,
    billingCountry: null,
  };
  host = {
    id: 'h1',
    name: 'Sara Coffee',
    bioEn: 'x'.repeat(40),
    bioAr: 'ب'.repeat(40),
    contactEmail: null,
    city: 'Abha',
    region: 'Aseer',
    languages: ['ar'],
    nationalId: null,
    crNumber: null,
    payoutIban: 'enc:SA0380000000608010167000',
  };
  fake.current = createDbFake({
    query: { guests: { findFirst: () => guest }, hosts: { findFirst: () => host } },
    update: (values) => {
      if (phoneTaken && 'phone' in values) throw Object.assign(new Error('dup'), { code: '23505' });
      return [];
    },
  });
});

describe('updateGuestProfile', () => {
  it('flags invalid fields and echoes the values', async () => {
    expect(await updateGuestProfile(initial, guestForm({ name: 'S', phone: '12' }))).toMatchObject({
      message: 'validation',
      fields: { name: true, phone: true },
      values: { name: 'S', phone: '12' },
    });
  });

  it('is not_found without a guest facet and phone_taken on the unique index', async () => {
    targets.value = { guestId: null, hostId: 'h1', authUserId: 'u1' };
    expect(await updateGuestProfile(initial, guestForm())).toMatchObject({ message: 'not_found' });
    targets.value = { guestId: 'g1', hostId: null, authUserId: 'u1' };
    phoneTaken = true;
    expect(await updateGuestProfile(initial, guestForm())).toMatchObject({
      message: 'phone_taken',
      fields: { phone: true },
    });
  });

  it('writes the row and journals every changed field with sensitive values masked', async () => {
    expect(await updateGuestProfile(initial, guestForm())).toEqual({ success: true });
    expect(fake.current?.updates[0]).toMatchObject({
      name: 'Sara',
      email: 'sara@example.com',
      phone: '+966512345678',
      preferredLanguage: 'ar',
      billingCountry: 'SA',
    });
    const audit = fake.current?.inserts[0] as Row[];
    expect(audit.map((r) => r.field)).toEqual([
      'guest.email',
      'guest.phone',
      'guest.preferredLanguage',
      'guest.billingCountry',
    ]);
    const phone = audit.find((r) => r.field === 'guest.phone') as Row;
    expect(phone.newValue).not.toContain('123456');
    expect(audit.every((r) => r.actorUserId === 'admin-1' && r.subjectGuestId === 'g1')).toBe(true);
  });
});

describe('updateHostProfile', () => {
  it('rejects a non-Saudi IBAN before any read', async () => {
    expect(
      await updateHostProfile(initial, hostForm({ payoutIban: 'GB82WEST12345698765432' })),
    ).toMatchObject({
      message: 'iban_invalid',
      fields: { payoutIban: true },
      valuesLanguages: ['ar', 'en', 'ar'],
    });
    expect(fake.current?.updates).toEqual([]);
  });

  it('dedupes languages, keeps the Arabic bio when blank, encrypts ids and journals the IBAN change', async () => {
    expect(await updateHostProfile(initial, hostForm())).toEqual({ success: true });
    expect(fake.current?.updates[0]).toMatchObject({
      languages: ['ar', 'en'],
      bioAr: 'ب'.repeat(40),
      nationalId: 'enc:1234567890',
      crNumber: null,
      payoutIban: `enc:${IBAN}`,
    });
    const inserts = fake.current?.inserts as Array<Row | Row[]>;
    expect(inserts[0]).toMatchObject({ hostId: 'h1', actorUserId: 'admin-1' });
    const ibanEvent = inserts[0] as Row;
    expect(String(ibanEvent.newIbanMasked)).not.toContain('6080101675');
    const audit = inserts[1] as Row[];
    expect(audit.map((r) => r.field)).toEqual(
      expect.arrayContaining(['host.languages', 'host.nationalId', 'host.payoutIban']),
    );
  });
});
