/**
 * Host-authored descriptions and bios are DB free text with no length
 * guarantee. Clamp to ~160 characters so the SERP snippet never gets
 * machine-truncated mid-word, preferring the last complete sentence that
 * still leaves a useful snippet (2026-10-14 SEO run: 11 of 16 experience
 * pages ended mid-sentence with an ellipsis).
 */
export const META_DESCRIPTION_MAX = 160;

/** Shortest sentence-ended snippet worth keeping over a word-boundary cut. */
const MIN_SENTENCE_SNIPPET = 70;

/** Sentence ends in Latin and Arabic script (`؟` Arabic question mark). */
const SENTENCE_END = /[.!?؟](?=\s|$)/g;

export function clampDescription(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= META_DESCRIPTION_MAX) return normalized;

  // A sentence end may sit right at the limit, so search one character
  // past the cut point.
  const window = normalized.slice(0, META_DESCRIPTION_MAX);
  let sentenceEnd = -1;
  for (const match of window.matchAll(SENTENCE_END)) sentenceEnd = match.index;
  if (sentenceEnd + 1 >= MIN_SENTENCE_SNIPPET) return window.slice(0, sentenceEnd + 1);

  const cut = normalized.slice(0, META_DESCRIPTION_MAX - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${lastSpace > 0 ? cut.slice(0, lastSpace) : cut}…`;
}
