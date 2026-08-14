import { ImageResponse } from 'next/og';
import { getTranslations } from 'next-intl/server';
import { loadOgFonts } from '@/lib/og/og-fonts';
import { nbspJoin, splitBalanced, splitDashAsides } from '@/lib/og/satori-arabic';
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
export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const isAr = locale === 'ar';
  const fonts = await loadOgFonts();
  const tOg = await getTranslations({ locale, namespace: 'ogImage' });
  const tSite = await getTranslations({ locale, namespace: 'siteMeta' });

  // Arabic tagline lines are pre-split so no line ever wraps or carries a
  // neutral mark mid-run (Satori scrambles both): the em-dash aside becomes a
  // line break, each part balances under a hard width budget, and the final
  // period ends the last line — the one spot Satori renders it correctly.
  // Content box 1056px / (0.5 × 54px font) ≈ 39 chars.
  const taglineLines = isAr
    ? splitDashAsides(tSite('description')).flatMap((part) =>
        splitBalanced(part, Math.floor(1056 / (54 * 0.5))).map(nbspJoin),
      )
    : [];

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

      {/* Arabic is set smaller (54 vs 68) so the pre-split lines always fit
          the content box; English keeps Satori's native Latin wrapping in a
          plain block. See lib/og/satori-arabic for the Arabic rules. */}
      {isAr ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            alignSelf: 'flex-end',
            gap: 6,
            fontSize: 54,
            fontWeight: 600,
            lineHeight: 1.3,
            maxWidth: 1056,
            // Yeh-dot room below the last line (satori-arabic rule 4).
            paddingBottom: 24,
            overflow: 'hidden',
          }}
        >
          {taglineLines.map((line, i) => (
            <div key={i} style={{ display: 'flex' }}>
              {line}
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            display: 'block',
            textAlign: 'left',
            fontSize: 68,
            fontWeight: 600,
            lineHeight: 1.3,
            // ANY letterSpacing value (even 0) would push Satori into its
            // per-cluster layout path — Latin-only branch, so it's safe here.
            letterSpacing: '-0.035em',
            maxWidth: 1010,
            maxHeight: 360,
            overflow: 'hidden',
          }}
        >
          {tSite('description')}
        </div>
      )}

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
