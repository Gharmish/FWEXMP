import { describe, expect, it } from 'vitest';
import en from '@/messages/en.json';
import ar from '@/messages/ar.json';
import { statusActions } from './status-actions';

describe('statusActions', () => {
  it('sends an approved applicant to the host dashboard that approval already created (#396)', () => {
    const actions = statusActions('approved');
    const primary = actions.find((a) => a.variant === 'primary');
    expect(primary).toEqual({ href: '/host', labelKey: 'openDashboard', variant: 'primary' });
  });

  it('keeps a pending applicant on browse + back to activity, with no dashboard link', () => {
    const actions = statusActions('pending');
    expect(actions.map((a) => a.href)).toEqual(['/experiences', '/me']);
    expect(actions.some((a) => a.href === '/host')).toBe(false);
  });

  it('has copy for every label in both locales', () => {
    for (const status of ['approved', 'pending'] as const) {
      for (const { labelKey } of statusActions(status)) {
        expect(en.hostApply.actions[labelKey]).toBeTruthy();
        expect(ar.hostApply.actions[labelKey]).toBeTruthy();
      }
    }
  });

  it('no longer tells an approved host to wait for the team', () => {
    expect(en.hostApply.status.approved.description).not.toMatch(/will reach out/);
  });
});
