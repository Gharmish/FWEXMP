import { ImageResponse } from 'next/og';
import { getTranslations } from 'next-intl/server';
import { loadOgFonts } from '@/lib/og/og-fonts';
import { SITE_NAME } from '@/lib/site';

// loadOgFonts reads TTFs off disk, so this must run on Node, not Edge.
export const runtime = 'nodejs';
export const alt = SITE_NAME;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * Default social card for every page without its own opengraph-image
 * (home, /experiences, /hosts, /hosting, legal). Replaces the static
 * `public/images/gharmish-og.png` lockup-only card (2026-08 brand
 * audit): locale-correct wordmark and tagline in the brand faces, with
 * the Saffron Gold accent. Per-experience and per-host cards keep their
 * richer segment-level renderers.
 */
function splitBalanced(text: string): string[] {
  const words = text.split(' ');
  if (words.length < 4) return [text];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
}

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const isAr = locale === 'ar';
  const fonts = await loadOgFonts();
  const tOg = await getTranslations({ locale, namespace: 'ogImage' });
  const tSite = await getTranslations({ locale, namespace: 'siteMeta' });

  return new ImageResponse(
    <div
      lang={locale}
      dir={isAr ? 'rtl' : 'ltr'}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: '#FFFFFF',
        color: '#0A0A0A',
        fontFamily: isAr ? 'PlexArabic' : 'Bricolage',
        padding: 72,
      }}
    >
      {/* Satori ignores `dir` for box alignment, so RTL mirroring is done
          manually: rows reverse and the tagline column right-aligns. */}
      <div
        style={{
          display: 'flex',
          flexDirection: isAr ? 'row-reverse' : 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
        }}
      >
        <div style={{ display: 'flex', fontSize: 40, fontWeight: 600 }}>{tOg('wordmark')}</div>
        <div
          style={{
            display: 'flex',
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: '#F5B800',
          }}
        />
      </div>

      {/* Satori fuses and mis-spaces Arabic the moment a text run has to
          WRAP (the same bug mangles the live per-experience cards). Runs
          that fit on one line render correctly — so the tagline is
          pre-split into balanced lines and sized so no line ever wraps.
          Arabic is set smaller for that reason (54 vs 68). */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: isAr ? 'flex-end' : 'flex-start',
          gap: 6,
          fontSize: isAr ? 54 : 68,
          fontWeight: 600,
          lineHeight: 1.3,
          // Latin-only: ANY letterSpacing value (even 0) pushes Satori into
          // its per-cluster layout path, which destroys Arabic word spacing.
          ...(isAr ? {} : { letterSpacing: '-0.035em' }),
        }}
      >
        {splitBalanced(tSite('description')).map((line, i) => (
          <div key={i} style={{ display: 'flex' }}>
            {/* NBSP-join Arabic words: Satori splits normal spaces into
                per-word flex boxes and mis-spaces RTL runs; an unbreakable
                run goes through text shaping whole and comes out right. */}
            {isAr ? line.replaceAll(' ', ' ') : line}
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: isAr ? 'row-reverse' : 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          fontSize: 26,
          color: '#686868',
        }}
      >
        <div style={{ display: 'flex' }}>{isAr ? 'أبها · عسير' : 'Abha · Aseer'}</div>
        <div style={{ display: 'flex' }}>gharmish.com</div>
      </div>
    </div>,
    { ...size, fonts },
  );
}
