import {
  Castle,
  Coffee,
  Flower2,
  Leaf,
  Mountain,
  Users,
  Venus,
  type LucideIcon,
} from 'lucide-react';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import type { Category } from '@/lib/colors';
import { HoverLift, Stagger, StaggerItem } from '@/components/ui/motion';
import type { CategoryMeta } from '@/features/experiences/types';

/**
 * Category tiles — the homepage's discovery row and its one moment of
 * colour play. Minimal white hairline cards (no large tinted fills,
 * premium redesign 2026-06): a small 100-tint icon disc in the
 * category's immutable brand colour (BRIEF §3) beside the label.
 * Deep-links to the filtered catalogue.
 */
export interface CategoryTilesProps {
  locale: Locale;
  categories: readonly CategoryMeta[];
}

// Literal classes so Tailwind v4 detects them (same pattern as CATEGORY_DOT).
const TILE_DISC: Record<Category, string> = {
  nature: 'bg-juniper-green-100 text-juniper-green-800',
  heritage: 'bg-al-qatt-red-100 text-al-qatt-red-800',
  food: 'bg-saffron-gold-100 text-saffron-gold-800',
  wellness: 'bg-wadi-mint-100 text-wadi-mint-800',
  adventure: 'bg-soudah-sunset-100 text-soudah-sunset-800',
  family: 'bg-sarawat-blue-100 text-sarawat-blue-800',
  women_only: 'bg-tihama-coral-100 text-tihama-coral-800',
};

// Castle for heritage: Aseer's fortress villages (Rijal Almaa, Habala) —
// not Landmark's Greek temple, which reads foreign here.
const TILE_ICON: Record<Category, LucideIcon> = {
  nature: Leaf,
  heritage: Castle,
  food: Coffee,
  wellness: Flower2,
  adventure: Mountain,
  family: Users,
  women_only: Venus,
};

export function CategoryTiles({ locale, categories }: CategoryTilesProps) {
  return (
    <Stagger className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {categories.map((c) => {
        const Icon = TILE_ICON[c.key];
        return (
          <StaggerItem key={c.key} className="h-full">
            <HoverLift className="h-full">
              <Link
                href={`/experiences?category=${c.key}`}
                className="rounded-card border-sarat-black/8 hover:border-sarat-black/20 flex h-full min-h-11 items-center gap-3 [border-width:0.5px] px-4 py-3 transition-colors duration-200"
              >
                <span
                  className={`flex size-8 shrink-0 items-center justify-center rounded-full ${TILE_DISC[c.key]}`}
                >
                  <Icon className="size-4" strokeWidth={1.5} aria-hidden />
                </span>
                <span className="text-sm font-medium">
                  {locale === 'ar' ? c.labelAr : c.labelEn}
                </span>
              </Link>
            </HoverLift>
          </StaggerItem>
        );
      })}
    </Stagger>
  );
}
