'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface AnnouncementTickerProps {
  /**
   * The announcement in the active locale — composed by the server page
   * from platform settings, so it arrives as a prop rather than through
   * a translation hook.
   */
  text: string;
}

/**
 * Loop duration bucketed by text length so short and long notices read
 * at roughly the same speed in both scripts. Whole class strings so
 * Tailwind can see them; a per-character inline style would need an
 * untyped custom-property cast for no visible gain.
 */
function durationClass(text: string): string {
  if (text.length > 90) return '[--ticker-duration:32s]';
  if (text.length > 45) return '[--ticker-duration:22s]';
  return '[--ticker-duration:14s]';
}

/**
 * How many copies of the notice the track holds. One loop slides the
 * track by exactly one copy (`--ticker-end` = 100% / COPIES), so the
 * seam never shows as long as the other copies cover the band's full
 * width. Two copies only covered a phone: on a desktop viewport a short
 * notice filled a third of the band and the rest scrolled past empty
 * before the loop visibly jumped (2026-10-12). Every copy also gets a
 * `min-w-[10vw]` floor, so the eleven copies behind the leading one
 * always cover at least 110 % of the band whatever the text length
 * (a ~12-character notice alone would fall short on a 1920 px screen).
 * The clones are aria-hidden and hidden under reduced motion, so the
 * cost is a few hundred bytes of markup. The `12` in the `--ticker-end`
 * classes below must equal this constant: Tailwind needs the literal.
 */
const COPIES = 12;
const CLONES = Array.from({ length: COPIES - 1 }, (_, i) => i);

/**
 * The home-page announcement band as a one-line ticker. The text never
 * wraps: it scrolls continuously in the reading direction (leftward in
 * English, rightward in Arabic — `rtl:` flips `--ticker-end`), with
 * aria-hidden clones behind it so the loop is seamless at any viewport
 * width. The keyframe and the duration/direction vars live in
 * globals.css (`animate-ticker`).
 *
 * Moving content needs a way to stop (WCAG 2.2.2), and the house rule
 * from the retired category marquee is a PERMANENT stop on interaction —
 * no auto-resume. Hovering pauses; focusing or tapping the band stops it
 * for good and lets the notice wrap so nothing is clipped. Under
 * `prefers-reduced-motion` the band never moves and renders the same
 * wrapped, centred layout from the first paint (CSS variants, so there
 * is no hydration flash). `role="marquee"` is the ARIA live-region role
 * for exactly this — non-essential, continuously changing presentation —
 * and the tab stop is what gives keyboard users the stop mechanism.
 */
export function AnnouncementTicker({ text }: AnnouncementTickerProps) {
  const [stopped, setStopped] = useState(false);
  const stop = () => setStopped(true);

  return (
    <div
      role="marquee"
      tabIndex={0}
      onFocus={stop}
      onPointerDown={stop}
      className={cn(
        'border-habala-mist-200 bg-info-surface text-info border-b py-3 text-sm leading-relaxed outline-none',
        'focus-visible:ring-sarawat-blue focus-visible:ring-2 focus-visible:ring-inset',
        stopped
          ? 'px-6 text-center'
          : 'overflow-hidden motion-reduce:px-6 motion-reduce:text-center',
      )}
    >
      <span
        className={cn(
          stopped
            ? 'block'
            : cn(
                // The divisor must equal COPIES (one copy per loop).
                'animate-ticker flex w-max [--ticker-end:calc(-100%/12)] hover:[animation-play-state:paused] rtl:[--ticker-end:calc(100%/12)]',
                'motion-reduce:block motion-reduce:w-auto motion-reduce:animate-none',
                durationClass(text),
              ),
        )}
      >
        <span
          className={cn(
            !stopped &&
              'min-w-[10vw] shrink-0 pe-16 whitespace-nowrap motion-reduce:min-w-0 motion-reduce:pe-0 motion-reduce:whitespace-normal',
          )}
        >
          {text}
        </span>
        {!stopped &&
          CLONES.map((i) => (
            <span
              key={i}
              aria-hidden
              className="min-w-[10vw] shrink-0 pe-16 whitespace-nowrap motion-reduce:hidden"
            >
              {text}
            </span>
          ))}
      </span>
    </div>
  );
}
