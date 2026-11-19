import type { HostApplicationStatus } from '@/features/host-applications/types';

export interface StatusAction {
  href: '/host' | '/me' | '/experiences';
  labelKey: 'openDashboard' | 'backToAccount' | 'browseExperiences';
  variant: 'primary' | 'secondary';
}

/**
 * The buttons under the application status surface. Approval creates
 * the `hosts` row at once and the approval email links to `/host`, so an
 * approved applicant's primary action is the dashboard (#396); a pending
 * one can only browse or go back to their activity.
 */
export function statusActions(status: Exclude<HostApplicationStatus, 'rejected'>): StatusAction[] {
  if (status === 'approved') {
    return [
      { href: '/me', labelKey: 'backToAccount', variant: 'secondary' },
      { href: '/host', labelKey: 'openDashboard', variant: 'primary' },
    ];
  }
  return [
    { href: '/experiences', labelKey: 'browseExperiences', variant: 'secondary' },
    { href: '/me', labelKey: 'backToAccount', variant: 'primary' },
  ];
}
