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
        className="text-sarat-black-600 inline-flex min-h-11 items-center px-2 text-sm font-medium transition-opacity duration-200 hover:opacity-60"
      >
        {label}
      </button>
    </form>
  );
}
