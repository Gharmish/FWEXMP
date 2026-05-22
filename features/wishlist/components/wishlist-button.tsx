import { Heart } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/utils';
import { toggleWishlist } from '@/features/wishlist/actions';

interface WishlistButtonProps {
  slug: string;
  isSaved: boolean;
  /** Tone of the card the button sits on — affects the resting colour. */
  surface?: 'light' | 'dark';
}

/**
 * Heart-shaped toggle that adds/removes the experience to the
 * cookie-backed wishlist via a server action.
 *
 * BRIEF §3 bans filled icons, so the saved-state cue is colour
 * (saffron-gold heart) rather than fill, and a subtle background
 * tint on the button surface to give a clear pressed-state read at
 * a glance. The form fires a server action — no client JS.
 */
export async function WishlistButton({ slug, isSaved, surface = 'light' }: WishlistButtonProps) {
  const t = await getTranslations('wishlistButton');

  const baseBg =
    surface === 'dark'
      ? 'bg-fog-white/10 hover:bg-fog-white/15'
      : 'bg-fog-white/85 hover:bg-fog-white';
  const savedBg = 'bg-saffron-gold/15 hover:bg-saffron-gold/20';

  return (
    <form action={toggleWishlist.bind(null, slug)}>
      <button
        type="submit"
        aria-pressed={isSaved}
        aria-label={isSaved ? t('remove') : t('save')}
        className={cn(
          'inline-flex size-11 items-center justify-center rounded-full transition-transform duration-200 hover:-translate-y-px',
          'border-sarat-black/10 [border-width:0.5px]',
          isSaved ? savedBg : baseBg,
        )}
      >
        <Heart
          className={cn(
            'size-5 shrink-0',
            isSaved
              ? 'text-saffron-gold'
              : surface === 'dark'
                ? 'text-fog-white'
                : 'text-sarat-black-600',
          )}
          aria-hidden
        />
      </button>
    </form>
  );
}
