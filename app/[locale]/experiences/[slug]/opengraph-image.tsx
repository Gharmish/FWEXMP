import { ImageResponse } from 'next/og';
import { getTranslations } from 'next-intl/server';
import { COLORS, CATEGORY_COLOR } from '@/lib/colors';
import { CATEGORIES } from '@/features/experiences/lib/sample-data';
import { getExperienceBySlug } from '@/features/experiences/queries';
import { toArabicText } from '@/features/experiences/lib/arabic-content';
import { loadOgFonts } from '@/lib/og/og-fonts';
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
          letterSpacing: isAr ? 0 : '-0.03em',
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
      {/* Top: wordmark + category accent */}
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
            {categoryLabel}
          </div>
        </div>
      </div>

      {/* Middle: title */}
      <div
        style={{
          // A plain block wraps predictably in Satori; `-webkit-box` clamping
          // mis-justifies Arabic. Titles wrap naturally within the frame.
          display: 'block',
          textAlign: isAr ? 'right' : 'left',
          fontSize: title.length > 60 ? 60 : title.length > 36 ? 68 : 80,
          fontWeight: 600,
          lineHeight: 1.1,
          letterSpacing: isAr ? 0 : '-0.035em',
          maxWidth: 1010,
          maxHeight: 320,
          overflow: 'hidden',
        }}
      >
        {title}
      </div>

      {/* Bottom: host · location · price */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
        }}
      >
        <div style={{ display: 'flex', fontSize: 28, color: muted }}>
          {hostName}
          <span style={{ display: 'flex', padding: '0 12px' }}>·</span>
          {location}
        </div>
        <div style={{ display: 'flex', fontSize: 32, fontWeight: 600, color: fg }}>{price}</div>
      </div>
    </div>,
    { ...size, fonts },
  );
}
