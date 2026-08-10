'use client';

import { ParallaxY, RiseIn, TracePath } from '@/components/ui/motion';

/**
 * Living Sarat highlands — the hero's animated backdrop. Three ridge
 * silhouettes in atmospheric-perspective tints (far = lightest habala
 * mist, near = juniper) settle upward on load, drift apart on scroll via
 * ParallaxY, and two crest hairlines trace themselves in. Soft mist
 * bands drift continuously between the ridges (CSS `animate-mist-*`,
 * globals.css — ambient loops can't ride the one spring, same precedent
 * as the category-tile marquee; the global reduced-motion rule freezes
 * them).
 *
 * Craft notes:
 * - Purely decorative: aria-hidden, pointer-events-none, and every tint
 *   is light enough that sarat-black text keeps AA contrast on top of it.
 * - Layers are separate SVGs so each can parallax independently; fixed
 *   heights + `preserveAspectRatio="xMidYMax slice"` crop the composition
 *   instead of stretching it (organic art is never stretched — same rule
 *   as the ridgeline flourish).
 * - Everything on the load path is transform-only (RiseIn) — the scene
 *   never SSRs at opacity 0 under the LCP headline. The traced crests are
 *   the one exception (eager TracePath, undrawn until hydration): they
 *   are hairlines, never content.
 * - `rtl:-scale-x-100` mirrors the whole scene so the tallest peak keeps
 *   to the inline-end side, away from the text, in Arabic.
 */

/** Far ridge crest (also the top edge of RIDGE_FAR's fill). */
const CREST_FAR =
  'M0 208 C 90 170 150 140 230 148 C 300 155 340 120 420 112 C 500 104 560 140 640 150 C 720 160 780 120 860 108 C 930 98 990 130 1070 142 C 1150 154 1210 118 1290 122 C 1350 125 1400 145 1440 138';
/** Mid ridge crest. */
const CREST_MID =
  'M0 252 C 80 235 140 200 220 205 C 310 210 360 178 450 182 C 540 186 600 220 690 226 C 780 232 840 196 930 190 C 1020 184 1080 214 1170 222 C 1260 230 1320 200 1440 208';
/** Near ridge crest. */
const CREST_NEAR =
  'M0 292 C 110 280 180 258 280 262 C 380 266 450 246 560 250 C 670 254 740 276 850 280 C 960 284 1040 258 1150 260 C 1260 262 1340 278 1440 272';

const CLOSE = ' L1440 320 L0 320 Z';

interface RidgeLayerProps {
  /** Crest path; the fill closes it to the bottom edge. */
  crest: string;
  /** Fill class for the silhouette. */
  fill: string;
  /** Optional stroke class — renders the crest as a traced hairline. */
  stroke?: string;
  /** Scroll drift in px (deeper layers drift less). */
  parallax: number;
  /** Load settle: initial offset px and delay s. */
  rise: { y: number; delay: number };
}

function RidgeLayer({ crest, fill, stroke, parallax, rise }: RidgeLayerProps) {
  return (
    <ParallaxY distance={parallax} className="absolute inset-0">
      <RiseIn y={rise.y} delay={rise.delay} className="absolute inset-0">
        <svg
          viewBox="0 0 1440 320"
          preserveAspectRatio="xMidYMax slice"
          aria-hidden
          className="absolute inset-0 size-full"
        >
          <path d={crest + CLOSE} className={fill} />
          {stroke && <TracePath d={crest} className={stroke} delay={rise.delay + 0.2} eager />}
        </svg>
      </RiseIn>
    </ParallaxY>
  );
}

export function HeroHighlands() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 h-56 overflow-hidden select-none sm:h-72 lg:h-80 rtl:-scale-x-100"
    >
      <RidgeLayer
        crest={CREST_FAR}
        fill="fill-habala-mist-100/80"
        stroke="text-habala-mist-200"
        parallax={6}
        rise={{ y: 34, delay: 0.3 }}
      />
      {/* Mist between far and mid ridges. */}
      <div className="animate-mist-a absolute bottom-[38%] start-[6%] h-16 w-[45%] rounded-full bg-white/60 blur-2xl" />
      <RidgeLayer
        crest={CREST_MID}
        fill="fill-habala-mist-200/70"
        parallax={12}
        rise={{ y: 26, delay: 0.2 }}
      />
      <div className="animate-mist-b absolute bottom-[16%] end-[4%] h-20 w-[55%] rounded-full bg-habala-mist-100/70 blur-3xl" />
      <RidgeLayer
        crest={CREST_NEAR}
        fill="fill-juniper-green-100/60"
        stroke="text-juniper-green-200"
        parallax={20}
        rise={{ y: 18, delay: 0.1 }}
      />
      <div className="animate-mist-a absolute bottom-[4%] start-[24%] h-14 w-[40%] rounded-full bg-white/50 blur-2xl" />
      {/* Hand-off: the scene dissolves into the white catalog surface. */}
      <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-white to-transparent" />
    </div>
  );
}
