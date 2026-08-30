'use client';

import { useOptimistic, useState, useTransition } from 'react';
import { Heart } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { SPRING } from '@/components/ui/motion';
import { toast } from '@/components/ui/toast';
import { toggleWishlist } from '@/features/wishlist/actions';

interface WishlistButtonProps {
  slug: string;
  isSaved: boolean;
  /** Tone of the card the button sits on — affects the resting colour. */
  surface?: 'light' | 'dark';
}

const SAVED_TOAST_KEY = 'gharmish-wishlist-saved-toast';
// In-memory fallback dedupe for browsers where sessionStorage throws
// (private modes) — at worst the toast repeats on a full page load.
let savedToastShown = false;

/** True exactly once per session — the first save gets the affordance. */
function isFirstSaveThisSession(): boolean {
  if (savedToastShown) return false;
  savedToastShown = true;
  try {
    if (sessionStorage.getItem(SAVED_TOAST_KEY)) return false;
    sessionStorage.setItem(SAVED_TOAST_KEY, '1');
  } catch {
    // No storage — the module flag above still dedupes this page load.
  }
  return true;
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
  const reduce = useReducedMotion();
  // Springs support exactly two keyframes, so the pop is initial→animate on a
  // keyed remount — and only after a real toggle, never on page load.
  const [interacted, setInteracted] = useState(false);

  function handleClick() {
    setInteracted(true);
    const saving = !optimisticSaved;
    startTransition(async () => {
      setOptimisticSaved(!optimisticSaved);
      await toggleWishlist(slug);
      // After the action settled (a thrown action never reaches this):
      // the first save of the session points at the list it landed in —
      // hearts otherwise have no visible destination.
      if (saving && isFirstSaveThisSession()) {
        toast({
          title: t('savedToastTitle'),
          tone: 'success',
          action: { label: t('savedToastCta'), href: '/wishlist' },
        });
      }
    });
  }

  const baseBg =
    surface === 'dark' ? 'bg-white/10 hover:bg-white/15' : 'bg-white/85 hover:bg-white';
  const savedBg = 'bg-saffron-gold/15 hover:bg-saffron-gold/20';

  // Quiet "alive" cue: a spring scale-pop on the heart each time the saved
  // state flips on (keyed re-mount drives the keyframe). Tap gives a small
  // press. Both disabled under prefers-reduced-motion (BRIEF §3).
  const Icon = (
    <Heart
      className={cn(
        'size-5 shrink-0',
        optimisticSaved
          ? 'text-saffron-gold'
          : surface === 'dark'
            ? 'text-white'
            : 'text-sarat-black-600',
      )}
      aria-hidden
    />
  );

  const buttonClassName = cn(
    'inline-flex size-11 items-center justify-center rounded-full transition-transform duration-200 hover:-translate-y-px active:translate-y-0',
    'border-sarat-black/10 [border-width:0.5px]',
    optimisticSaved ? savedBg : baseBg,
    isPending && 'opacity-80',
  );

  const sharedProps = {
    type: 'button' as const,
    onClick: handleClick,
    'aria-pressed': optimisticSaved,
    'aria-label': optimisticSaved ? t('remove') : t('save'),
    // Disabling-while-pending would block double-tap retries; we leave the
    // button live but de-emphasise it via opacity so it doesn't *look*
    // tappable mid-flight.
    'data-pending': isPending ? ('true' as const) : undefined,
    className: buttonClassName,
  };

  if (reduce) {
    return <button {...sharedProps}>{Icon}</button>;
  }

  return (
    <motion.button {...sharedProps} whileTap={{ scale: 0.88 }}>
      <motion.span
        key={optimisticSaved ? 'saved' : 'unsaved'}
        initial={interacted ? { scale: optimisticSaved ? 1.35 : 0.85 } : false}
        animate={{ scale: 1 }}
        transition={SPRING}
      >
        {Icon}
      </motion.span>
    </motion.button>
  );
}
