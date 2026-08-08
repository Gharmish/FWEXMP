import { LogOut } from 'lucide-react';
import { signOut } from '@/features/auth/actions';
import type { Locale } from '@/lib/i18n';

interface SignOutButtonProps {
  locale: Locale;
  label: string;
}

/**
 * Server-action sign-out trigger. A plain `<form>` so we ship zero
 * client JS for the signed-in nav. The form posts to the `signOut`
 * action, which clears the session and redirects to /[locale].
 */
export function SignOutButton({ locale, label }: SignOutButtonProps) {
  return (
    <form action={signOut}>
      <input type="hidden" name="locale" value={locale} />
      <button
        type="submit"
        aria-label={label}
        // Below `sm` the label is hidden, so without a min width this
        // collapses to a 36px icon-only tap target.
        className="text-sarat-black-600 inline-flex min-h-11 min-w-11 items-center justify-center gap-2 px-2 text-sm font-medium transition-opacity duration-200 hover:opacity-60 sm:justify-start"
      >
        <LogOut className="size-5 shrink-0 rtl:rotate-180" strokeWidth={1.5} aria-hidden />
        <span className="hidden sm:inline">{label}</span>
      </button>
    </form>
  );
}
