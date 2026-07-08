import { Search, Heart, Plus } from 'lucide-react';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import {
  COLORS,
  type ColorToken,
  type RampStop,
  type Category,
  CATEGORY_COLOR,
} from '@/lib/colors';
import type { Locale } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { Pill } from '@/components/ui/pill';
import { RiyalSymbol } from '@/components/ui/riyal-symbol';
import { IconButton } from '@/components/ui/icon-button';
import { ExperienceCard } from '@/features/experiences/components/experience-card';
import type { ExperienceSummary } from '@/features/experiences/types';
import { HostCard } from '@/features/hosts/components/host-card';
import type { HostInfo } from '@/features/experiences/types';
import { RatingSummary } from '@/features/reviews/components/rating-summary';
import { ReviewCard } from '@/features/reviews/components/review-card';
import type { ReviewAggregate, ReviewSummary } from '@/features/reviews/types';
import { WishlistButton } from '@/features/wishlist/components/wishlist-button';
import { MotionDemos, OverlayDemos } from './motion-demos';

/**
 * Internal living style guide. Renders every design token and primitive
 * so the system can be sanity-checked in the browser, in both /en and
 * /ar (RTL + Arabic face). Not linked from the product.
 *
 * The Arabic strings below are type *specimens* (to show the IBM Plex
 * Sans Arabic face), not product copy — product strings go through
 * next-intl message catalogs.
 */

const RAMP_STOPS: RampStop[] = [50, 100, 200, 400, 600, 800, 900];

const TYPE_SCALE = [
  // Display/H1 carry weight 600 (premium redesign 2026-06); everything
  // below H1 stays at 400/500 — the restraint still holds for body copy.
  {
    role: 'Display',
    cls: 'font-semibold text-7xl tracking-[-0.04em]',
    en: 'Discover Aseer',
    ar: 'اكتشف عسير',
  },
  {
    role: 'H1',
    cls: 'font-semibold text-5xl tracking-[-0.035em]',
    en: 'The flower men',
    ar: 'رجال الزهور',
  },
  {
    role: 'H2',
    cls: 'font-medium text-3xl tracking-[-0.03em]',
    en: 'Mountain trails',
    ar: 'مسارات الجبال',
  },
  {
    role: 'H3',
    cls: 'font-medium text-2xl tracking-[-0.025em]',
    en: 'Coffee & qahwa',
    ar: 'القهوة العربية',
  },
  {
    role: 'Body large',
    cls: 'font-normal text-lg',
    en: 'Hosted by locals.',
    ar: 'يستضيفها الأهالي.',
  },
  { role: 'Body', cls: 'font-normal text-base', en: 'Booked in minutes.', ar: 'احجز في دقائق.' },
  {
    role: 'Caption',
    cls: 'font-medium text-[13px] tracking-[0.02em] uppercase',
    en: (
      <>
        From <RiyalSymbol className="h-[0.9em] align-[-0.1em]" /> 480
      </>
    ),
    ar: (
      <>
        من 480 <RiyalSymbol className="h-[0.9em] align-[-0.1em]" />
      </>
    ),
  },
  {
    role: 'Eyebrow',
    cls: 'font-medium text-[11px] tracking-[0.2em] uppercase',
    en: 'Originals',
    ar: 'أصول',
  },
] as const;

/* --------------------- Composite-component fixtures --------------------- *
 * Hand-built sample objects used only by /dev to render the higher-level
 * composites (ExperienceCard / RatingSummary / ReviewCard / HostCard) in
 * isolation. Not connected to the real sample-data — having an inline
 * fixture means tweaking the showcase here doesn't risk drift in the
 * sample datasets that feed the real catalog. */

function makeExperience(
  overrides: Partial<ExperienceSummary> & { slug: string },
): ExperienceSummary {
  return {
    slug: overrides.slug,
    titleEn: overrides.titleEn ?? 'Sample experience',
    titleAr: overrides.titleAr ?? 'تجربة عينة',
    startTime: overrides.startTime ?? '09:00',
    descriptionEn:
      overrides.descriptionEn ??
      'A short description that explains what makes this experience worth booking, in one breath.',
    descriptionAr: overrides.descriptionAr ?? 'وصف قصير يشرح ما يميز هذه التجربة.',
    category: overrides.category ?? 'nature',
    priceSar: overrides.priceSar ?? 320,
    durationMinutes: overrides.durationMinutes ?? 180,
    placeName: overrides.placeName ?? 'Jabal Sawda',
    city: overrides.city ?? 'Abha',
    maxGroupSize: overrides.maxGroupSize ?? 10,
    availabilityWeekdays: overrides.availabilityWeekdays ?? [4, 5, 6],
    hostName: overrides.hostName ?? 'Faisal Al Qahtani',
    hostSlug: overrides.hostSlug ?? 'faisal-al-qahtani',
    featured: overrides.featured ?? false,
    bookingMode: overrides.bookingMode ?? 'request',
    ratingAverage: overrides.ratingAverage ?? null,
    ratingCount: overrides.ratingCount ?? 0,
    heroImage: overrides.heroImage ?? null,
  };
}

const SAMPLE_REVIEW: ReviewSummary = {
  id: 'rv_dev_001',
  experienceSlug: 'dev-fixture',
  guestName: 'Reem A.',
  rating: 5,
  textEn:
    'We met before sunrise and walked into the clouds. Our host knew every tree by name and slowed us down enough to actually notice the place.',
  textAr: null,
  hostReply: null,
  createdAt: '2026-04-12T05:30:00Z',
};

const SAMPLE_REVIEW_WITH_REPLY: ReviewSummary = {
  id: 'rv_dev_002',
  experienceSlug: 'dev-fixture',
  guestName: 'James T.',
  rating: 4,
  textEn:
    'Small group, unhurried pace, and the early-morning mist on the juniper trees was unreal. Bring layers — it is genuinely cold up there at dawn.',
  textAr: null,
  hostReply:
    'Thank you for joining us, James. You picked the perfect week — the mist had not yet lifted off the terraces.',
  createdAt: '2026-03-28T07:15:00Z',
};

const SAMPLE_AGGREGATE: ReviewAggregate = {
  count: 27,
  average: 4.7,
  distribution: { 1: 0, 2: 1, 3: 2, 4: 6, 5: 18 },
};

const EMPTY_AGGREGATE: ReviewAggregate = {
  count: 0,
  average: null,
  distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
};

const SAMPLE_HOST: HostInfo = {
  name: 'Faisal Al Qahtani',
  slug: 'faisal-al-qahtani',
  bioEn:
    'A third-generation farmer from Habala who grew up among the juniper terraces. Faisal hosts small groups to share Aseeri food, music, and the slow rhythm of mountain life.',
  bioAr:
    'مزارع من الجيل الثالث من الحبلة، نشأ بين مدرجات العرعر. يستضيف فيصل مجموعات صغيرة ليشاركهم طعام عسير وموسيقاها وإيقاع الحياة الجبلية الهادئ.',
  verified: true,
  photoUrl: null,
  languages: ['ar'],
};

const SPACING = [
  { name: '1', px: 4 },
  { name: '2', px: 8 },
  { name: '3', px: 12 },
  { name: '4', px: 16 },
  { name: '6', px: 24 },
  { name: '8', px: 32 },
  { name: '12', px: 48 },
  { name: '16', px: 64 },
  { name: '20', px: 80 },
  { name: '30', px: 120 },
] as const;

/** Stable id for in-page anchors. Slug-style ASCII; matches the TOC. */
function sectionId(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Ordered list of section titles — drives both the TOC at the top of
 * the page and the in-page anchors via the same sectionId() helper.
 * Keep in sync with the <Section> calls below; an anchor that doesn't
 * find a matching id just jumps to the top, which is the smallest
 * possible consequence on an internal page.
 */
const TOC_SECTIONS = [
  'Color',
  'Category → color',
  'Typography',
  'Buttons',
  'Card',
  'Input',
  'Badge',
  'Avatar',
  'Pill (filter / category chips)',
  'IconButton',
  'Spacing (8-pt grid)',
  'Experience card',
  'Host card',
  'Wishlist button — state matrix',
  'Reviews — rating summary',
  'Reviews — single card',
] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      id={sectionId(title)}
      className="border-sarat-black/8 flex scroll-mt-12 flex-col gap-6 [border-top-width:0.5px] py-12"
    >
      <h2 className="font-display text-3xl font-medium tracking-[-0.03em]">
        <a
          href={`#${sectionId(title)}`}
          className="transition-opacity duration-200 hover:opacity-60"
        >
          {title}
        </a>
      </h2>
      {children}
    </section>
  );
}

export default async function StyleGuidePage({ params }: { params: Promise<{ locale: string }> }) {
  // Internal style guide — local dev and preview deployments only. On the
  // production domain it 404s (VERCEL_ENV is 'preview' on previews, so
  // those keep it for design review).
  if (process.env.VERCEL_ENV === 'production') notFound();

  const { locale } = await params;
  setRequestLocale(locale);

  const tokens = Object.keys(COLORS) as ColorToken[];

  return (
    <div className="mx-auto flex max-w-5xl flex-col px-6 py-12">
      <header className="flex flex-col gap-2">
        <p className="text-sarat-black-600 text-[11px] tracking-[0.2em] uppercase">
          Gharmish · internal
        </p>
        <h1 className="font-display text-5xl font-semibold tracking-[-0.035em]">Design system</h1>
        <p className="text-sarat-black-600 text-base">
          Living reference for tokens and primitives. Locale: {locale}.
        </p>
        <nav
          aria-label="Sections"
          className="border-sarat-black/8 rounded-card mt-6 [border-width:0.5px] p-5"
        >
          <p className="text-sarat-black-600 mb-3 text-[11px] tracking-[0.2em] uppercase">
            Jump to
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
            {TOC_SECTIONS.map((title) => (
              <li key={title}>
                <a
                  href={`#${sectionId(title)}`}
                  className="text-sarat-black transition-opacity duration-200 hover:opacity-60"
                >
                  {title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <Section title="Color">
        <div className="flex flex-col gap-8">
          {tokens.map((token) => {
            const entry = COLORS[token];
            return (
              <div key={token} className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between">
                  <span className="font-medium">{token}</span>
                  <span className="text-sarat-black-600 text-sm">
                    {entry.base} · {entry.role}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                  <div className="flex flex-col gap-1">
                    <div
                      className="rounded-image border-sarat-black/8 h-16 [border-width:0.5px]"
                      style={{ backgroundColor: entry.base }}
                    />
                    <span className="text-sarat-black-600 text-[11px]">base</span>
                  </div>
                  {RAMP_STOPS.map((stop) => (
                    <div key={stop} className="flex flex-col gap-1">
                      <div
                        className="rounded-image border-sarat-black/8 h-16 [border-width:0.5px]"
                        style={{ backgroundColor: entry.ramp[stop] }}
                      />
                      <span className="text-sarat-black-600 text-[11px]">{stop}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Category → color">
        <div className="flex flex-wrap gap-3">
          {Object.entries(CATEGORY_COLOR).map(([category, color]) => (
            <span
              key={category}
              className="rounded-button px-4 py-2 text-sm font-medium text-white"
              style={{ backgroundColor: COLORS[color].base }}
            >
              {category}
            </span>
          ))}
        </div>
      </Section>

      <Section title="Typography">
        <div className="flex flex-col gap-6">
          {TYPE_SCALE.map((t) => (
            <div
              key={t.role}
              className="border-sarat-black/8 grid grid-cols-1 gap-2 [border-bottom-width:0.5px] pb-6 sm:grid-cols-[120px_1fr_1fr]"
            >
              <span className="text-sarat-black-600 text-[11px] tracking-[0.2em] uppercase">
                {t.role}
              </span>
              <span className={`font-display ${t.cls}`}>{t.en}</span>
              <span className={`font-arabic ${t.cls}`} dir="rtl" lang="ar">
                {t.ar}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-col gap-4">
          {(['primary', 'secondary', 'premium'] as const).map((variant) => (
            <div key={variant} className="flex flex-wrap items-center gap-4">
              <Button variant={variant} size="sm">
                {variant} sm
              </Button>
              <Button variant={variant} size="md">
                {variant} md
              </Button>
              <Button variant={variant} size="lg">
                {variant} lg
              </Button>
              <Button variant={variant} size="md" disabled>
                disabled
              </Button>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Card">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="p-6">
            <h3 className="font-display text-2xl font-medium tracking-[-0.025em]">Default card</h3>
            <p className="text-sarat-black-600 mt-2 text-base">
              Fog White surface, 0.5px hairline, no shadow.
            </p>
          </Card>
          <Card variant="dark" className="p-6">
            <h3 className="font-display text-2xl font-medium tracking-[-0.025em]">
              Originals card
            </h3>
            <p className="mt-2 text-base text-white/70">
              Sarat Black surface for the premium tier.
            </p>
          </Card>
        </div>
      </Section>

      <Section title="Input">
        <div className="flex max-w-sm flex-col gap-3">
          <Input placeholder="Search experiences in Abha" />
          <Input placeholder="Disabled" disabled />
        </div>
      </Section>

      <Section title="Badge">
        <div className="flex flex-wrap gap-3">
          <Badge variant="verified">Verified host</Badge>
          <Badge variant="licensed">MoT licensed</Badge>
          <Badge variant="neutral">Neutral</Badge>
          <Badge variant="soldOut">Sold out</Badge>
        </div>
      </Section>

      <Section title="Avatar">
        <div className="flex items-center gap-4">
          <Avatar name="Faisal Al Qahtani" size="sm" />
          <Avatar name="Faisal Al Qahtani" size="md" />
          <Avatar name="Faisal Al Qahtani" size="lg" />
        </div>
      </Section>

      <Section title="Pill (filter / category chips)">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Pill selected>All</Pill>
            <Pill>Abha</Pill>
            <Pill>This weekend</Pill>
            <Pill>
              Under <RiyalSymbol className="h-[0.9em] align-[-0.1em]" />
              300
            </Pill>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {(Object.keys(CATEGORY_COLOR) as Category[]).map((category) => (
              <Pill key={category} category={category} selected>
                {category}
              </Pill>
            ))}
          </div>
        </div>
      </Section>

      <Section title="IconButton">
        <div className="flex flex-col gap-4">
          {(['primary', 'secondary', 'premium'] as const).map((variant) => (
            <div key={variant} className="flex flex-wrap items-center gap-4">
              <IconButton variant={variant} size="md" aria-label="Search experiences">
                <Search />
              </IconButton>
              <IconButton variant={variant} size="lg" aria-label="Save to wishlist">
                <Heart />
              </IconButton>
              <IconButton variant={variant} size="md" aria-label="Add" disabled>
                <Plus />
              </IconButton>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Spacing (8-pt grid)">
        <div className="flex flex-col gap-2">
          {SPACING.map((s) => (
            <div key={s.name} className="flex items-center gap-4">
              <span className="text-sarat-black-600 w-20 text-sm">
                {s.name} · {s.px}px
              </span>
              <div className="bg-saffron-gold h-4 rounded-full" style={{ width: `${s.px}px` }} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Experience card">
        <div className="grid gap-4 sm:grid-cols-2">
          <ExperienceCard
            locale={locale as Locale}
            experience={makeExperience({
              slug: 'dev-default-no-ratings',
              titleEn: 'Default — no reviews yet',
              titleAr: 'افتراضي — لا توجد مراجعات',
              category: 'food',
              priceSar: 220,
            })}
          />
          <ExperienceCard
            locale={locale as Locale}
            experience={makeExperience({
              slug: 'dev-default-rated',
              titleEn: 'Default — with reviews + actions slot',
              titleAr: 'افتراضي — مع مراجعات وزر إجراء',
              category: 'nature',
              ratingAverage: 4.6,
              ratingCount: 14,
            })}
            actions={<WishlistButton slug="dev-default-rated" isSaved={false} surface="light" />}
          />
          <ExperienceCard
            locale={locale as Locale}
            experience={makeExperience({
              slug: 'dev-originals',
              titleEn: 'Originals tier — saved state',
              titleAr: 'فئة الأصول — محفوظ',
              featured: true,
              category: 'heritage',
              priceSar: 980,
              ratingAverage: 4.9,
              ratingCount: 32,
            })}
            actions={<WishlistButton slug="dev-originals" isSaved surface="dark" />}
          />
          <ExperienceCard
            locale={locale as Locale}
            experience={makeExperience({
              slug: 'dev-cheap',
              titleEn: 'Adventure · short',
              titleAr: 'مغامرة قصيرة',
              category: 'adventure',
              priceSar: 95,
              durationMinutes: 60,
              ratingAverage: 4.3,
              ratingCount: 5,
            })}
          />
        </div>
      </Section>

      <Section title="Host card">
        <Card className="p-6">
          <HostCard host={SAMPLE_HOST} locale={locale as Locale} />
        </Card>
      </Section>

      <Section title="Wishlist button — state matrix">
        <p className="text-sarat-black-600 max-w-2xl text-sm">
          Two surfaces × two saved states. Tapping any of these triggers the real toggleWishlist
          action and mutates the cookie — so /wishlist updates in real time.
        </p>
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="flex flex-col gap-3">
            <span className="text-sarat-black-600 text-[11px] tracking-[0.2em] uppercase">
              Light surface
            </span>
            <div className="border-sarat-black/8 rounded-card flex items-center gap-4 [border-width:0.5px] bg-white p-6">
              <WishlistButton slug="dev-light-unsaved" isSaved={false} surface="light" />
              <WishlistButton slug="dev-light-saved" isSaved surface="light" />
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <span className="text-sarat-black-600 text-[11px] tracking-[0.2em] uppercase">
              Dark surface
            </span>
            <div className="rounded-card bg-sarat-black flex items-center gap-4 p-6">
              <WishlistButton slug="dev-dark-unsaved" isSaved={false} surface="dark" />
              <WishlistButton slug="dev-dark-saved" isSaved surface="dark" />
            </div>
          </div>
        </div>
      </Section>

      <Section title="Reviews — rating summary">
        <div className="flex flex-col gap-10">
          <div className="flex flex-col gap-2">
            <p className="text-sarat-black-600 text-[11px] tracking-[0.2em] uppercase">
              With reviews
            </p>
            <RatingSummary aggregate={SAMPLE_AGGREGATE} locale={locale as Locale} />
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sarat-black-600 text-[11px] tracking-[0.2em] uppercase">
              Zero state
            </p>
            <RatingSummary aggregate={EMPTY_AGGREGATE} locale={locale as Locale} />
          </div>
        </div>
      </Section>

      <Section title="Reviews — single card">
        <div className="grid gap-4 sm:grid-cols-2">
          <ReviewCard review={SAMPLE_REVIEW} locale={locale as Locale} />
          <ReviewCard review={SAMPLE_REVIEW_WITH_REPLY} locale={locale as Locale} />
        </div>
      </Section>

      <Section title="Motion">
        <MotionDemos />
      </Section>

      <Section title="Overlays">
        <OverlayDemos />
      </Section>
    </div>
  );
}
