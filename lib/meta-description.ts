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

  // Match on the full text, not on a slice: against a slice the `$` in
  // the lookahead matches the end of the window, so a decimal point that
  // happens to land at the cut ("4.5" split as "4.") reads as a sentence
  // end (2026-10-14 PR #91 review). Abbreviations ("e.g.") still count as
  // sentence ends; an abbreviation list is not worth its code for 8
  // listings.
  let sentenceEnd = -1;
  for (const match of normalized.matchAll(SENTENCE_END)) {
    if (match.index >= META_DESCRIPTION_MAX) break;
    sentenceEnd = match.index;
  }
  if (sentenceEnd + 1 >= MIN_SENTENCE_SNIPPET) return normalized.slice(0, sentenceEnd + 1);

  const cut = normalized.slice(0, META_DESCRIPTION_MAX - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${lastSpace > 0 ? cut.slice(0, lastSpace) : cut}…`;
}
