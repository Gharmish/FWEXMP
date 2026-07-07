import { describe, expect, it } from 'vitest';
import { parseHostApplicationCookie, serializeHostApplicationCookie } from './cookie';
import type { HostApplicationView } from './types';

const sample: HostApplicationView = {
  id: null,
  userId: 'abc123',
  contactPhone: '+966512345678',
  contactEmail: 'host@example.com',
  displayName: 'Layla',
  bioEn:
    'Born and raised in Abha. Twenty years guiding small groups through the hidden trails of the Sarawat range.',
  bioAr: null,
  languages: ['ar', 'en'],
  identityType: 'national_id',
  identityNumber: '1010101010',
  legalName: 'Layla bint Ahmad Al-Asmari',
  dateOfBirth: '1985-03-12',
  iban: 'SA0380000000608010167519',
  bankName: 'Al Rajhi Bank',
  bankAccountHolder: 'Layla bint Ahmad Al-Asmari',
  vatNumber: null,
  city: 'Abha',
  region: 'Asir',
  status: 'pending',
  reviewerNotes: null,
  createdAt: '2026-05-22T10:00:00.000Z',
  reviewedAt: null,
  documents: [],
};

describe('parseHostApplicationCookie', () => {
  it('returns null for undefined / empty / non-JSON input', () => {
    expect(parseHostApplicationCookie(undefined)).toBeNull();
    expect(parseHostApplicationCookie('')).toBeNull();
    expect(parseHostApplicationCookie('not json')).toBeNull();
    expect(parseHostApplicationCookie('[]')).toBeNull();
  });

  it('rejects bad status / identityType', () => {
    expect(parseHostApplicationCookie(JSON.stringify({ ...sample, status: 'bogus' }))).toBeNull();
    expect(
      parseHostApplicationCookie(JSON.stringify({ ...sample, identityType: 'bogus' })),
    ).toBeNull();
  });

  it('rejects missing required fields', () => {
    const partial = { ...sample } as Partial<HostApplicationView>;
    delete partial.displayName;
    expect(parseHostApplicationCookie(JSON.stringify(partial))).toBeNull();
  });

  it('rejects when no valid languages remain', () => {
    expect(
      parseHostApplicationCookie(JSON.stringify({ ...sample, languages: ['klingon'] })),
    ).toBeNull();
    expect(parseHostApplicationCookie(JSON.stringify({ ...sample, languages: [] }))).toBeNull();
  });

  it('filters unknown languages but keeps known ones', () => {
    const view = parseHostApplicationCookie(
      JSON.stringify({ ...sample, languages: ['ar', 'klingon', 'en'] }),
    );
    expect(view?.languages).toEqual(['ar', 'en']);
  });

  it('round-trips a valid application', () => {
    const round = parseHostApplicationCookie(serializeHostApplicationCookie(sample));
    expect(round).not.toBeNull();
    expect(round?.userId).toBe(sample.userId);
    expect(round?.languages).toEqual(sample.languages);
    expect(round?.status).toBe('pending');
    expect(round?.identityType).toBe('national_id');
    // Cookie-mode rows never carry a row id.
    expect(round?.id).toBeNull();
  });

  it('defaults city and region when blank', () => {
    const view = parseHostApplicationCookie(JSON.stringify({ ...sample, city: '', region: '' }));
    expect(view?.city).toBe('Abha');
    expect(view?.region).toBe('Asir');
  });
});

describe('serializeHostApplicationCookie', () => {
  it('drops the id field so the payload stays compact', () => {
    const serialized = serializeHostApplicationCookie(sample);
    expect(serialized).not.toMatch(/"id"/);
  });
});
