import { ImageResponse } from 'next/og';
import { getExperiencesByHostSlug, getHostBySlug } from '@/features/hosts/queries';
import { toArabicText } from '@/features/experiences/lib/arabic-content';
import { loadOgFonts } from '@/lib/og/og-fonts';
import { SITE_NAME } from '@/lib/site';

// Queries the DB (Drizzle/postgres), so this must run on Node, not Edge.
export const runtime = 'nodejs';
export const alt = `${SITE_NAME} — host`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * Per-host social card. Every shared host link renders its own branded
 * 1200×630 image — wordmark, a Saffron Gold "verified host" accent, the host
 * name in the brand face, and the count-weighted rating · experience count
 * (the same trust signals the profile header shows). Mirrors the per-experience
 * opengraph-image so shared profiles look as intentional as shared listings.
 */
export default async function Image({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const isAr = locale === 'ar';
  const [host, experiences, fonts] = await Promise.all([
    getHostBySlug(slug),
    getExperiencesByHostSlug(slug),
    loadOgFonts(),
  ]);

  const fontFamily = isAr ? 'PlexArabic' : 'Bricolage';
  const dir = isAr ? 'rtl' : 'ltr';

  // Hosts always render on the white surface with a Saffron Gold accent —
  // they aren't category-bound the way an experience card is.
  const bg = '#FFFFFF';
  const fg = '#0A0A0A';
  const muted = '#686868';
  const accent = '#F5B800';
  const wordmark = isAr ? 'غارميش' : 'Gharmish';

  // Graceful fallback if the slug no longer resolves to a verified host.
  if (!host) {
    return new ImageResponse(
      <div
        lang={locale}
        dir={dir}
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: bg,
          color: fg,
          fontFamily,
          fontSize: 56,
          fontWeight: 600,
          letterSpacing: isAr ? 0 : '-0.03em',
        }}
      >
        {wordmark}
      </div>,
      { ...size, fonts },
    );
  }

  const name = isAr ? toArabicText(host.name) : host.name;

  // Host-level rating: count-weighted merge of each experience's aggregate —
  // the same derivation the profile header uses, so the card never disagrees
  // with the page.
  const ratingCount = experiences.reduce((sum, e) => sum + e.ratingCount, 0);
  const ratingAverage =
    ratingCount > 0
      ? experiences.reduce((sum, e) => sum + (e.ratingAverage ?? 0) * e.ratingCount, 0) /
        ratingCount
      : null;
  const ratingLabel =
    ratingAverage !== null
      ? new Intl.NumberFormat(isAr ? 'ar' : 'en', {
          numberingSystem: 'latn',
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }).format(ratingAverage)
      : null;

  const experienceCount = new Intl.NumberFormat(isAr ? 'ar' : 'en', {
    numberingSystem: 'latn',
  }).format(experiences.length);
  const experienceLabel = isAr
    ? `${experienceCount} ${experiences.length === 1 ? 'تجربة' : 'تجربة'}`
    : `${experienceCount} ${experiences.length === 1 ? 'experience' : 'experiences'}`;

  const hostKicker = host.verified
    ? isAr
      ? 'مضيف موثّق'
      : 'Verified host'
    : isAr
      ? 'مضيف على غارميش'
      : `Host on ${SITE_NAME}`;

  return new ImageResponse(
    <div
      lang={locale}
      dir={dir}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: bg,
        color: fg,
        fontFamily,
        padding: 72,
      }}
    >
      {/* Top: wordmark + verified accent */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
        }}
      >
        <div style={{ display: 'flex', fontSize: 32, fontWeight: 600 }}>{wordmark}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 16,
              height: 16,
              borderRadius: 9999,
              backgroundColor: accent,
              display: 'flex',
            }}
          />
          <div
            style={{
              display: 'flex',
              fontSize: 24,
              fontWeight: 500,
              color: muted,
              letterSpacing: isAr ? 0 : '0.02em',
            }}
          >
            {hostKicker}
          </div>
        </div>
      </div>

      {/* Middle: host name */}
      <div
        style={{
          display: 'block',
          textAlign: isAr ? 'right' : 'left',
          fontSize: name.length > 36 ? 68 : 80,
          fontWeight: 600,
          lineHeight: 1.1,
          letterSpacing: isAr ? 0 : '-0.035em',
          maxWidth: 1010,
          maxHeight: 320,
          overflow: 'hidden',
        }}
      >
        {name}
      </div>

      {/* Bottom: rating · experience count */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          fontSize: 28,
          color: muted,
        }}
      >
        {ratingLabel && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: fg }}>
            {/* Inline SVG star — the Satori font subset has no ★ glyph, so a
                  vector path renders reliably where a text glyph would tofu. */}
            <svg width="28" height="28" viewBox="0 0 24 24" fill={accent}>
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            <div style={{ display: 'flex', fontWeight: 600 }}>{ratingLabel}</div>
          </div>
        )}
        {ratingLabel && <span style={{ display: 'flex' }}>·</span>}
        <div style={{ display: 'flex' }}>{experienceLabel}</div>
      </div>
    </div>,
    { ...size, fonts },
  );
}
