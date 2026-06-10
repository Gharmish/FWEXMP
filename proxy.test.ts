import { describe, expect, it } from 'vitest';
import { pathRequiresAuth } from '@/proxy';

/**
 * The edge auth gate is the first line of defence for the host and
 * admin surfaces — these tests pin the path rules so a refactor can't
 * silently open them up.
 */
describe('pathRequiresAuth', () => {
  it('gates the host and admin surfaces', () => {
    expect(pathRequiresAuth('/host')).toBe(true);
    expect(pathRequiresAuth('/host/bookings')).toBe(true);
    expect(pathRequiresAuth('/host/earnings')).toBe(true);
    expect(pathRequiresAuth('/host/experiences/new')).toBe(true);
    expect(pathRequiresAuth('/admin')).toBe(true);
    expect(pathRequiresAuth('/admin/bookings')).toBe(true);
    expect(pathRequiresAuth('/admin/payouts')).toBe(true);
  });

  it('keeps the application entry points public', () => {
    expect(pathRequiresAuth('/host/apply')).toBe(false);
    expect(pathRequiresAuth('/host/apply/submitted')).toBe(false);
  });

  it('leaves public surfaces open', () => {
    expect(pathRequiresAuth('/')).toBe(false);
    expect(pathRequiresAuth('/experiences')).toBe(false);
    expect(pathRequiresAuth('/experiences/some-slug')).toBe(false);
    expect(pathRequiresAuth('/hosts/some-host')).toBe(false);
    expect(pathRequiresAuth('/sign-in')).toBe(false);
  });

  it('does not gate lookalike prefixes', () => {
    expect(pathRequiresAuth('/hosts')).toBe(false); // public host directory
    expect(pathRequiresAuth('/hostel')).toBe(false);
    expect(pathRequiresAuth('/administrator')).toBe(false);
  });
});
