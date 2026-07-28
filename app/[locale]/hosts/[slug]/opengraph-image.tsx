import { ImageResponse } from 'next/og';
import { getTranslations } from 'next-intl/server';
import { getExperiencesByHostSlug, getHostBySlug } from '@/features/hosts/queries';
import { toArabicText } from '@/features/experiences/lib/arabic-content';
import { pickLocalized } from '@/lib/ar-placeholder';
import { loadOgFonts } from '@/lib/og/og-fonts';
import { SITE_NAME } from '@/lib/site';

/** First-two-word initials — mirrors components/ui/avatar's fallback. */
function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Fetch the host photo and inline it as a data URI. Satori can't reach the
 * network mid-render, and a failed remote <img> would crash the whole card —
 * so we fetch defensively and fall back to initials (null) on any error.
 */
async function loadPhotoDataUri(photoUrl: string | null): Promise<string | null> {
  if (!photoUrl) return null;
  try {
    const res = await fetch(photoUrl);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    // Guard against a 200 that isn't actually an image — Satori would throw on
    // decode inside ImageResponse, past this try/catch, and 500 the route.
    if (!contentType.startsWith('image/')) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    return `data:${contentType};base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  }
}

/** Trim a bio to a couple of tidy card lines, adding an ellipsis when clipped. */
function truncateBio(bio: string, max = 128): string {
  const clean = bio.trim().replace(/\s+/g, ' ');
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

// Queries the DB (Drizzle/postgres), so this must run on Node, not Edge.
export const runtime = 'nodejs';
export const alt = `${SITE_NAME} — host`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * Per-host social card. Every shared host link (WhatsApp, etc.) renders its own
 * branded 1200×630 image — the Gharmish wordmark, a Saffron Gold "verified host"
 * accent, the host's photo, name, and bio, and the count-weighted rating ·
 * experience count (the same trust signals the profile header shows). The photo
 * is fetched and inlined defensively, falling back to initials on any error.
 * Mirrors the per-experience opengraph-image so shared profiles look as
 * intentional as shared listings.
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
  const t = await getTranslations({ locale, namespace: 'ogImage' });

  const fontFamily = isAr ? 'PlexArabic' : 'Bricolage';
  const dir = isAr ? 'rtl' : 'ltr';

  // Hosts always render on the white surface with a Saffron Gold accent —
  // they aren't category-bound the way an experience card is.
  const bg = '#FFFFFF';
  const fg = '#0A0A0A';
  const muted = '#686868';
  const accent = '#F5B800';
  const wordmark = t('wordmark');

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
  const bioRaw = pickLocalized(locale, host.bioEn, host.bioAr).trim();
  const bio = bioRaw ? truncateBio(bioRaw) : null;
  const photoDataUri = await loadPhotoDataUri(host.photoUrl);
  const initials = initialsOf(host.name);

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
  const experienceLabel = t('host.experienceCount', {
    formatted: experienceCount,
    count: experiences.length,
  });

  const hostKicker = host.verified
    ? t('host.verified')
    : t('host.unverified', { siteName: SITE_NAME });

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

      {/* Middle: host photo + name + bio */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 44, maxHeight: 360 }}>
        {photoDataUri ? (
          <img
            src={photoDataUri}
            alt=""
            width={224}
            height={224}
            style={{
              width: 224,
              height: 224,
              borderRadius: 9999,
              objectFit: 'cover',
              flexShrink: 0,
            }}
          />
        ) : (
          <div
            style={{
              width: 224,
              height: 224,
              borderRadius: 9999,
              backgroundColor: fg,
              color: accent,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 88,
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            {initials}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
            // Explicit width: content box (1056) − photo (224) − gap (44). Satori
            // won't wrap text inside a flex child that has no definite width — it
            // expands the child past the canvas instead — so we pin it.
            width: 788,
            textAlign: isAr ? 'right' : 'left',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'block',
              fontSize: name.length > 28 ? 56 : 68,
              fontWeight: 600,
              lineHeight: 1.05,
              letterSpacing: isAr ? 0 : '-0.035em',
              maxHeight: 150,
              overflow: 'hidden',
            }}
          >
            {name}
          </div>
          {bio && (
            <div
              style={{
                display: 'block',
                fontSize: 28,
                fontWeight: 400,
                lineHeight: isAr ? 1.7 : 1.4,
                color: muted,
                maxHeight: 132,
                overflow: 'hidden',
              }}
            >
              {bio}
            </div>
          )}
        </div>
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
