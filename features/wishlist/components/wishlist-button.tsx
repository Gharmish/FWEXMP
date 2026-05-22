'use client';

import { useOptimistic, useTransition } from 'react';
import { Heart } from 'lucide-react';
import { useTranslations } from 'next-intl';
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
 * Optimistic UI: clicking flips the heart immediately via
 * useOptimistic, the server action runs in a transition, and when
 * revalidation settles the optimistic value is replaced by the new
 * server truth (`isSaved` prop). If the action fails or the
 * transition unwinds, React reverts the optimistic value
 * automatically — no manual rollback.
 *
 * BRIEF §3 bans filled icons, so the saved-state cue is colour
 * (saffron-gold heart + 15% gold tint background) rather than a fill.
 */
export function WishlistButton({ slug, isSaved, surface = 'light' }: WishlistButtonProps) {
  const t = useTranslations('wishlistButton');
  const [optimisticSaved, setOptimisticSaved] = useOptimistic(isSaved);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      setOptimisticSaved(!optimisticSaved);
      await toggleWishlist(slug);
    });
  }

  const baseBg =
    surface === 'dark'
      ? 'bg-fog-white/10 hover:bg-fog-white/15'
      : 'bg-fog-white/85 hover:bg-fog-white';
  const savedBg = 'bg-saffron-gold/15 hover:bg-saffron-gold/20';

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={optimisticSaved}
      aria-label={optimisticSaved ? t('remove') : t('save')}
      // Disabling-while-pending would block double-tap retries; we
      // leave the button live but de-emphasise it via opacity so it
      // doesn't *look* tappable mid-flight.
      data-pending={isPending ? 'true' : undefined}
      className={cn(
        'inline-flex size-11 items-center justify-center rounded-full transition-transform duration-200 hover:-translate-y-px',
        'border-sarat-black/10 [border-width:0.5px]',
        optimisticSaved ? savedBg : baseBg,
        isPending && 'opacity-80',
      )}
    >
      <Heart
        className={cn(
          'size-5 shrink-0',
          optimisticSaved
            ? 'text-saffron-gold'
            : surface === 'dark'
              ? 'text-fog-white'
              : 'text-sarat-black-600',
        )}
        aria-hidden
      />
    </button>
  );
}
