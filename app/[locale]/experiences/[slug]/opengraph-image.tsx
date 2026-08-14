import { ImageResponse } from 'next/og';
import { getTranslations } from 'next-intl/server';
import { COLORS, CATEGORY_COLOR } from '@/lib/colors';
import { CATEGORIES } from '@/features/experiences/lib/sample-data';
import { getExperienceBySlug } from '@/features/experiences/queries';
import { toArabicText } from '@/features/experiences/lib/arabic-content';
import { loadOgFonts } from '@/lib/og/og-fonts';
import { mirrorTokens, nbspJoin, splitBalanced } from '@/lib/og/satori-arabic';
import { SITE_NAME } from '@/lib/site';

// Queries the DB (Drizzle/postgres), so this must run on Node, not Edge.
export const runtime = 'nodejs';
export const alt = `${SITE_NAME} — experience`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * Per-experience social card. Every shared listing renders its own branded
 * 1200×630 image — wordmark, category accent in the immutable category colour,
 * title in the brand face, and host · location · price. Originals (featured)
 * flip to the Sarat Black surface with a Saffron Gold accent, matching the
 * Originals tier in the product.
 */
export default async function Image({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const isAr = locale === 'ar';
  const exp = await getExperienceBySlug(slug);
  const fonts = await loadOgFonts();
  const t = await getTranslations({ locale, namespace: 'ogImage' });

  const fontFamily = isAr ? 'PlexArabic' : 'Bricolage';
  const dir = isAr ? 'rtl' : 'ltr';

  // Brand surfaces — Originals tier inverts to Sarat Black + Saffron Gold.
  const featured = exp?.featured ?? false;
  const bg = featured ? '#0A0A0A' : '#FFFFFF';
  const fg = featured ? '#FFFFFF' : '#0A0A0A';
  const muted = featured ? 'rgba(255,255,255,0.72)' : '#686868';
  const accent = featured ? '#F5B800' : exp ? COLORS[CATEGORY_COLOR[exp.category]].base : '#F5B800';

  const wordmark = t('wordmark');

  // Graceful fallback if the slug no longer resolves.
  if (!exp) {
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
          // Never pass letterSpacing (even 0) on Arabic runs — any value
          // pushes Satori into per-cluster layout, which destroys spacing.
          ...(isAr ? {} : { letterSpacing: '-0.03em' }),
        }}
      >
        {wordmark}
      </div>,
      { ...size, fonts },
    );
  }

  const title = isAr ? exp.titleAr : exp.titleEn;
  const hostName = isAr ? toArabicText(exp.hostName) : exp.hostName;
  const city = isAr ? toArabicText(exp.city) : exp.city;
  const region = isAr ? toArabicText(exp.region) : exp.region;
  const location = t('experience.location', { city, region });

  const category = CATEGORIES.find((c) => c.key === exp.category);
  const categoryLabel = featured
    ? t('experience.originals')
    : category
      ? isAr
        ? category.labelAr
        : category.labelEn
      : exp.category;

  const priceNumber = new Intl.NumberFormat(isAr ? 'ar' : 'en', {
    numberingSystem: 'latn',
    maximumFractionDigits: 0,
  }).format(exp.priceSar);
  const price = t('experience.price', { price: priceNumber });

  // Satori-safe Arabic runs: NBSP-joined so each renders as one unbreakable
  // run — Satori splits normal spaces into per-word flex boxes and destroys
  // RTL order ("رجال الزهور" fused). See lib/og/satori-arabic.
  const categoryDisplay = isAr ? nbspJoin(categoryLabel) : categoryLabel;
  const hostNameDisplay = isAr ? nbspJoin(hostName) : hostName;
  const locationDisplay = isAr ? nbspJoin(location) : location;
  // The price mixes digits and Arabic ("480 ر.س"): a digit-leading run makes
  // Satori lay the whole run out LTR (NBSP and RLM don't help — RLM even
  // tofus), so the tokens are mirrored as flex boxes instead. English keeps
  // the plain string; Arabic goes through mirrorTokens, which also explodes
  // "ر.س" so its period can't flip the letters.
  const priceTokens = isAr
    ? mirrorTokens(price)
    : price.split(' ').map((text, i) => ({ text, spaceBefore: i > 0 }));

  // Arabic titles are pre-split into unbreakable lines (Satori's own Arabic
  // wrapping fuses words); English keeps Satori's native block wrapping.
  const titleSize = title.length > 60 ? 60 : title.length > 36 ? 68 : 80;
  const titleLines = isAr
    ? splitBalanced(title, Math.floor(1010 / (titleSize * 0.5))).map(nbspJoin)
    : [];

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
      {/* Top: wordmark + category accent. Satori ignores `dir` for box
          alignment, so RTL mirroring is done manually with row-reverse. */}
      <div
        style={{
          display: 'flex',
          flexDirection: isAr ? 'row-reverse' : 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
        }}
      >
        <div style={{ display: 'flex', fontSize: 32, fontWeight: 600 }}>{wordmark}</div>
        <div
          style={{
            display: 'flex',
            flexDirection: isAr ? 'row-reverse' : 'row',
            alignItems: 'center',
            gap: 14,
          }}
        >
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
              ...(isAr ? {} : { letterSpacing: '0.02em' }),
            }}
          >
            {categoryDisplay}
          </div>
        </div>
      </div>

      {/* Middle: title */}
      {isAr ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            alignSelf: 'flex-end',
            gap: 6,
            fontSize: titleSize,
            fontWeight: 600,
            lineHeight: 1.1,
            maxWidth: 1010,
            // Room below the last baseline for yeh dots — overflow clips at
            // the padding edge (see lib/og/satori-arabic rule 4).
            paddingBottom: Math.round(titleSize * 0.45),
            maxHeight: 320,
            overflow: 'hidden',
          }}
        >
          {titleLines.map((line, i) => (
            <div key={i} style={{ display: 'flex' }}>
              {line}
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            // A plain block wraps predictably in Satori for Latin text.
            display: 'block',
            textAlign: 'left',
            fontSize: titleSize,
            fontWeight: 600,
            lineHeight: 1.1,
            letterSpacing: '-0.035em',
            maxWidth: 1010,
            maxHeight: 320,
            overflow: 'hidden',
          }}
        >
          {title}
        </div>
      )}

      {/* Bottom: host · location · price — rows mirrored manually for RTL. */}
      <div
        style={{
          display: 'flex',
          flexDirection: isAr ? 'row-reverse' : 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: isAr ? 'row-reverse' : 'row',
            fontSize: 28,
            color: muted,
          }}
        >
          {hostNameDisplay}
          <span style={{ display: 'flex', padding: '0 12px' }}>·</span>
          {locationDisplay}
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: isAr ? 'row-reverse' : 'row',
            fontSize: 32,
            fontWeight: 600,
            color: fg,
          }}
        >
          {priceTokens.map((token, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                // In row-reverse, marginRight separates a box from the one
                // before it (physically to its right) — a mirrored space.
                ...(token.spaceBefore ? (isAr ? { marginRight: 10 } : { marginLeft: 10 }) : {}),
              }}
            >
              {token.text}
            </div>
          ))}
        </div>
      </div>
    </div>,
    { ...size, fonts },
  );
}
