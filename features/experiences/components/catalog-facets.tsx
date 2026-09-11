'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { FilterableExperience } from '@/features/experiences/lib/search';

export interface CatalogFacets {
  /** Full-catalogue projection powering the filter sheet's live count. */
  facets: readonly FilterableExperience[];
  /** Distinct operating cities (display casing). */
  cities: readonly string[];
}

const CatalogFacetsContext = createContext<CatalogFacets | null>(null);

/**
 * Serialises the catalogue facet projection into the RSC payload ONCE
 * (2026-09 engineering audit PERF-07): the mobile search entry and the
 * desktop filter rail both consumed it as a prop, so every filter change
 * shipped the whole projection twice.
 */
export function CatalogFacetsProvider({
  value,
  children,
}: {
  value: CatalogFacets;
  children: ReactNode;
}) {
  return <CatalogFacetsContext.Provider value={value}>{children}</CatalogFacetsContext.Provider>;
}

export function useCatalogFacets(): CatalogFacets {
  const value = useContext(CatalogFacetsContext);
  if (!value) throw new Error('useCatalogFacets must be used inside CatalogFacetsProvider');
  return value;
}
