/**
 * Nav link styling shared by the navbar and the auth links it renders.
 * Lives outside the shell component so a feature (features/auth) never
 * has to import the shell to style a link inside it (2026-09 engineering
 * audit ARCH-12, second-pass nit).
 */

/** Compact identity for the nav — last 4 digits of the canonical phone. */
export function phoneTail(phone: string): string {
  return phone.length >= 4 ? `·· ${phone.slice(-4)}` : phone;
}

/**
 * Shared styling for nav links: icon + label, with the label collapsing
 * to icon-only below `sm` to keep the bar uncrowded on mobile. The icon
 * carries the accessible name via the link's `aria-label`, so hiding the
 * label visually is safe.
 */
export const navLinkClass =
  'text-sarat-black inline-flex min-h-11 min-w-11 items-center justify-center gap-2 px-1 text-sm font-medium whitespace-nowrap transition-opacity duration-200 hover:opacity-60 sm:px-2';

/**
 * The host entry point steps out of the bar below 380px.
 *
 * Signed in, the bar carries five 44px targets — 220px of touch target
 * before the wordmark, gaps or padding, which cannot fit 320px however
 * the spacing is tuned; the bar overflowed and scrolled the whole
 * document sideways. Signed out there are four and it fits, which is why
 * this only ever reproduced with a session cookie (2026-08-09).
 *
 * The host link is the one item that is safely droppable: `/hosting` is
 * also in the footer and on the home page. Discover, the account link and
 * the language switcher are all essential, and sign-out lives ONLY here —
 * hiding any of those would strand the user. Shrinking the targets below
 * 44px was the alternative and loses more (BRIEF §6 accessibility).
 */
export const hostNavLinkClass = `${navLinkClass} max-[380px]:hidden`;
