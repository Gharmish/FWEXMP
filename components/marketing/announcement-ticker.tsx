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
 * The home-page announcement band as a one-line ticker. The text never
 * wraps: it scrolls continuously in the reading direction (leftward in
 * English, rightward in Arabic — `rtl:` flips `--ticker-end`), with an
 * aria-hidden clone behind it so the loop is seamless. The keyframe and
 * the duration/direction vars live in globals.css (`animate-ticker`).
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
                'animate-ticker flex w-max [--ticker-end:-50%] hover:[animation-play-state:paused] rtl:[--ticker-end:50%]',
                'motion-reduce:block motion-reduce:w-auto motion-reduce:animate-none',
                durationClass(text),
              ),
        )}
      >
        <span
          className={cn(
            !stopped &&
              'shrink-0 pe-16 whitespace-nowrap motion-reduce:pe-0 motion-reduce:whitespace-normal',
          )}
        >
          {text}
        </span>
        {!stopped && (
          <span aria-hidden className="shrink-0 pe-16 whitespace-nowrap motion-reduce:hidden">
            {text}
          </span>
        )}
      </span>
    </div>
  );
}
