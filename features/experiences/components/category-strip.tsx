'use client';

import {
  Castle,
  Coffee,
  Flower2,
  Leaf,
  Mountain,
  Sparkles,
  Users,
  Venus,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Locale } from '@/lib/i18n';
import type { Category } from '@/lib/colors';
import { Pill } from '@/components/ui/pill';
import type { CategoryMeta } from '@/features/experiences/types';

/**
 * Category icons — mirrors the home page's TILE_ICON taxonomy (Castle for
 * Aseer's fortress villages, not a foreign temple). Kept local to the
 * catalogue's filter surface; the home tiles hold their own copy.
 */
const CATEGORY_ICON: Record<Category, LucideIcon> = {
  nature: Leaf,
  heritage: Castle,
  food: Coffee,
  wellness: Flower2,
  adventure: Mountain,
  family: Users,
  women_only: Venus,
};

interface CategoryStripProps {
  locale: Locale;
  categories: readonly CategoryMeta[];
  selectedCategories: readonly Category[];
  onToggleCategory: (key: Category) => void;
  originalsOnly: boolean;
  onToggleOriginals: () => void;
}

/**
 * The primary browse affordance: a horizontally-scrollable strip of
 * category chips (icon + label in the category's immutable brand colour)
 * led by the Originals tier. Replaces the wrapping category pill blob so
 * the row stays one clean line on every viewport (BRIEF §1 restraint).
 */
export function CategoryStrip({
  locale,
  categories,
  selectedCategories,
  onToggleCategory,
  originalsOnly,
  onToggleOriginals,
}: CategoryStripProps) {
  const t = useTranslations('experiencesIndex');

  return (
    <div
      role="group"
      aria-label={t('all')}
      className="-mx-1 flex snap-x [scrollbar-width:none] gap-2 overflow-x-auto px-1 py-1 [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
    >
      <Pill
        selected={originalsOnly}
        onClick={onToggleOriginals}
        aria-label={t('originalsToggleAria')}
        className="snap-start"
      >
        <Sparkles aria-hidden />
        {t('originalsToggle')}
      </Pill>
      {categories.map((c) => {
        const Icon = CATEGORY_ICON[c.key];
        return (
          <Pill
            key={c.key}
            category={c.key}
            selected={selectedCategories.includes(c.key)}
            onClick={() => onToggleCategory(c.key)}
            className="snap-start"
          >
            <Icon aria-hidden />
            {locale === 'ar' ? c.labelAr : c.labelEn}
          </Pill>
        );
      })}
    </div>
  );
}
