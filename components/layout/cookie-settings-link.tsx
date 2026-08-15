'use client';

import { clearConsent } from '@/components/layout/consent';

interface CookieSettingsLinkProps {
  label: string;
}

/**
 * Footer "Cookie settings" affordance — clears the stored consent cookie
 * and reloads, so the notice banner re-asks. The reload is load-bearing:
 * granted-then-withdrawn marketing pixels are already-mounted scripts
 * that only a fresh document can actually unload.
 */
export function CookieSettingsLink({ label }: CookieSettingsLinkProps) {
  return (
    <button
      type="button"
      onClick={() => {
        clearConsent();
        window.location.reload();
      }}
      className="text-sarat-black inline-flex min-h-11 items-center text-sm font-medium transition-opacity duration-200 hover:opacity-60"
    >
      {label}
    </button>
  );
}
