'use client';

import { useEffect } from 'react';
import { trackViewContent } from '@/lib/funnel-tracking';

interface ExperienceViewTrackingProps {
  slug: string;
  priceSar: number;
}

/**
 * Fires the funnel "view content" event when an experience detail page
 * is viewed (once per slug mount). Renders nothing; silent without
 * "Accept all" consent — see `lib/funnel-tracking.ts`.
 */
export function ExperienceViewTracking({ slug, priceSar }: ExperienceViewTrackingProps) {
  useEffect(() => {
    trackViewContent({ id: slug, priceSar });
  }, [slug, priceSar]);

  return null;
}
