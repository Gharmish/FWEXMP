/**
 * The ONE set of launch-content gates a listing must pass to be `live`
 * (2026-10-17 scan, ADMIN-HOST-01). The moderation approve action always
 * enforced these; the admin experience editor wrote `status` straight
 * from the form and so could publish a listing with no hero photo,
 * placeholder Arabic, an English-only timeline or a suspended host.
 * Both paths now ask this function, against the state the listing will
 * have AFTER the save (the editor passes its form values for the copy
 * fields and the stored row for everything else).
 *
 * Order matters for the admin's message: the host block first, then the
 * content blockers in the order the moderation page lists them, and the
 * verification status last — `host_unverified` is the only blocker the
 * approve action does not surface by name (its conditional UPDATE already
 * refuses it as `wrong_state`).
 */
export type LiveGateBlocker =
  | 'host_suspended'
  | 'needs_hero'
  | 'needs_arabic'
  | 'needs_english'
  | 'needs_arabic_moments'
  | 'needs_arabic_lists'
  | 'host_unverified';

export interface LiveGateCandidate {
  hostVerificationStatus: string;
  heroImage: string | null;
  titleEn: string;
  descriptionEn: string;
  titleAr: string;
  descriptionAr: string;
  inclusions: readonly string[];
  inclusionsAr: readonly string[];
  whatToBring: readonly string[];
  whatToBringAr: readonly string[];
  moments: ReadonlyArray<{ titleAr: string; descriptionAr: string }>;
}

const isPlaceholder = (value: string): boolean => value.startsWith('TODO(ar');

export type ListLanguageBlocker = Extract<LiveGateBlocker, 'needs_english' | 'needs_arabic_lists'>;

/**
 * The two-language rule for "What's included" and "What to bring" on its
 * own: an Arabic-only list leaves the English page without one, an
 * English-only list renders in English to the Arabic-first audience. Part
 * of {@link liveGateBlocker}; also run by the host's in-place save on a
 * live or paused listing, which bypasses review and so bypassed this
 * check (#121, 2026-10-31).
 */
export function listLanguageBlocker(
  c: Pick<LiveGateCandidate, 'inclusions' | 'inclusionsAr' | 'whatToBring' | 'whatToBringAr'>,
): ListLanguageBlocker | null {
  if (
    (c.inclusionsAr.length > 0 && c.inclusions.length === 0) ||
    (c.whatToBringAr.length > 0 && c.whatToBring.length === 0)
  ) {
    return 'needs_english';
  }
  if (
    (c.inclusions.length > 0 && c.inclusionsAr.length === 0) ||
    (c.whatToBring.length > 0 && c.whatToBringAr.length === 0)
  ) {
    return 'needs_arabic_lists';
  }
  return null;
}

export function liveGateBlocker(c: LiveGateCandidate): LiveGateBlocker | null {
  // Suspending a host pauses their LIVE listings; one going live now
  // would land in a catalog where nobody can book it (the booking action
  // refuses suspended hosts). Reinstate the host first.
  if (c.hostVerificationStatus === 'suspended') return 'host_suspended';
  if (!c.heroImage) return 'needs_hero';
  // Nothing goes live with AI/translation placeholders in the Arabic the
  // year-1 (Arabic-first) audience will actually read.
  if (isPlaceholder(c.titleAr) || isPlaceholder(c.descriptionAr)) return 'needs_arabic';
  // Hosts may draft in Arabic only (2026-08-22) — the English side is the
  // team's to fill before the listing reaches the catalog, lists included:
  // an Arabic-only "What's included" leaves the English page without one.
  const lists = listLanguageBlocker(c);
  if (c.titleEn.trim() === '' || c.descriptionEn.trim() === '' || lists === 'needs_english') {
    return 'needs_english';
  }
  // Host-added moments carry the same placeholder — without this the
  // Arabic detail page ships an English-only timeline.
  if (c.moments.some((m) => isPlaceholder(m.titleAr) || isPlaceholder(m.descriptionAr))) {
    return 'needs_arabic_moments';
  }
  // Empty Arabic lists fall back to the seed dictionary, which only covers
  // seeded strings — host-typed items would render in English.
  if (lists === 'needs_arabic_lists') return 'needs_arabic_lists';
  if (c.hostVerificationStatus !== 'verified') return 'host_unverified';
  return null;
}
