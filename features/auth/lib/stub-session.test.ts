import { describe, expect, it } from 'vitest';
import {
  parseStubSessionCookie,
  stubEmailCookieValue,
  stubUserFromEmail,
  stubUserFromPhone,
} from './stub-session';

describe('stubUserFromPhone', () => {
  it('returns a deterministic id for the same phone', () => {
    const a = stubUserFromPhone('+966512345678');
    const b = stubUserFromPhone('+966512345678');
    expect(a.id).toBe(b.id);
  });

  it('returns different ids for different phones', () => {
    const a = stubUserFromPhone('+966512345678');
    const b = stubUserFromPhone('+966599999999');
    expect(a.id).not.toBe(b.id);
  });

  it('echoes the canonical phone and flags isStub', () => {
    const u = stubUserFromPhone('+966512345678');
    expect(u.phone).toBe('+966512345678');
    expect(u.isStub).toBe(true);
    expect(u.email).toBeUndefined();
  });

  it('returns a 32-char id', () => {
    expect(stubUserFromPhone('+966512345678').id).toHaveLength(32);
  });
});

describe('parseStubSessionCookie', () => {
  it('returns null for undefined / empty input', () => {
    expect(parseStubSessionCookie(undefined)).toBeNull();
    expect(parseStubSessionCookie('')).toBeNull();
  });

  it('returns null for anything that is not canonical E.164 KSA', () => {
    expect(parseStubSessionCookie('hello')).toBeNull();
    expect(parseStubSessionCookie('0512345678')).toBeNull(); // not canonical
    expect(parseStubSessionCookie('+1234567890')).toBeNull(); // non-KSA
    expect(parseStubSessionCookie('+96611234567')).toBeNull(); // landline-ish
  });

  it('round-trips a canonical phone into a user', () => {
    const user = parseStubSessionCookie('+966512345678');
    expect(user).not.toBeNull();
    expect(user?.phone).toBe('+966512345678');
    expect(user?.isStub).toBe(true);
  });

  it('round-trips an email cookie into a user', () => {
    const user = parseStubSessionCookie(stubEmailCookieValue('Sara@Example.com'));
    expect(user).not.toBeNull();
    expect(user?.email).toBe('sara@example.com'); // lower-cased
    expect(user?.phone).toBe(''); // email users have no phone
    expect(user?.isStub).toBe(true);
  });

  it('rejects a malformed email cookie', () => {
    expect(parseStubSessionCookie('email:not-an-email')).toBeNull();
    expect(parseStubSessionCookie('email:')).toBeNull();
  });
});

describe('stubUserFromEmail', () => {
  it('is deterministic and distinct from a phone-derived id', () => {
    const a = stubUserFromEmail('sara@example.com');
    const b = stubUserFromEmail('sara@example.com');
    expect(a.id).toBe(b.id);
    expect(a.id).toHaveLength(32);
    expect(a.id).not.toBe(stubUserFromPhone('+966512345678').id);
  });
});
