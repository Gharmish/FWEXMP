import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('admin/auth', () => {
  const originalEnv = process.env.ADMIN_PHONES;

  beforeEach(() => {
    // Cached env is parsed at module load — bypass the cache by
    // re-importing under modified process.env via vi.resetModules.
    vi.resetModules();
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.ADMIN_PHONES;
    else process.env.ADMIN_PHONES = originalEnv;
  });

  async function loadModule() {
    return await import('./auth');
  }

  it('returns an empty allowlist when ADMIN_PHONES is unset', async () => {
    delete process.env.ADMIN_PHONES;
    const { getAdminAllowlist, isAdminPhone } = await loadModule();
    expect(getAdminAllowlist()).toEqual([]);
    expect(isAdminPhone('+966512345678')).toBe(false);
  });

  it('canonicalises both the allowlist and the lookup', async () => {
    process.env.ADMIN_PHONES = '+966 51 234 5678 , 0599999999';
    const { getAdminAllowlist, isAdminPhone } = await loadModule();
    expect(getAdminAllowlist()).toEqual(['+966512345678', '+966599999999']);
    // Same number, different format — still matches.
    expect(isAdminPhone('0512345678')).toBe(true);
    expect(isAdminPhone('+966512345678')).toBe(true);
    expect(isAdminPhone('+966599999999')).toBe(true);
    // Not on the list.
    expect(isAdminPhone('+966500000000')).toBe(false);
    // Garbage input.
    expect(isAdminPhone('hello')).toBe(false);
    expect(isAdminPhone('')).toBe(false);
  });

  it('silently drops invalid entries from ADMIN_PHONES', async () => {
    process.env.ADMIN_PHONES = '+966512345678,not-a-phone,0599999999';
    const { getAdminAllowlist } = await loadModule();
    expect(getAdminAllowlist()).toEqual(['+966512345678', '+966599999999']);
  });

  it('isAdminUser returns false for null', async () => {
    process.env.ADMIN_PHONES = '+966512345678';
    const { isAdminUser } = await loadModule();
    expect(isAdminUser(null)).toBe(false);
  });

  it('isAdminUser passes through to the phone check', async () => {
    process.env.ADMIN_PHONES = '+966512345678';
    const { isAdminUser } = await loadModule();
    expect(isAdminUser({ id: 'x', phone: '+966512345678', email: undefined, isStub: true })).toBe(
      true,
    );
    expect(isAdminUser({ id: 'x', phone: '+966500000000', email: undefined, isStub: true })).toBe(
      false,
    );
  });
});
