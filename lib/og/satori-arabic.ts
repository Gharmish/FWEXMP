/**
 * Workarounds for Satori's broken Arabic text layout, shared by the social
 * cards (proven on `app/[locale]/opengraph-image.tsx`, 2026-08 brand audit).
 *
 * Satori fails Arabic in three independent ways:
 *
 * 1. It splits normal spaces into per-word flex boxes and destroys RTL
 *    inter-word order and spacing — so Arabic words are joined with NBSP
 *    ({@link nbspJoin}) to form one unbreakable run that goes through text
 *    shaping whole.
 * 2. Its own Arabic line wrapping fuses and mis-spaces words the moment a
 *    run has to wrap — so lines are pre-split manually
 *    ({@link splitBalanced}, {@link wrapToLines}) and sized to never wrap.
 * 3. It ignores `dir` for box alignment — rows must be mirrored manually
 *    with `flexDirection: 'row-reverse'` / `alignItems: 'flex-end'`.
 * 4. `overflow: hidden` clips at the line-box edge, and the two dots under a
 *    final/isolated yeh sit ~0.8em below the baseline — far deeper than the
 *    line box at heading line-heights. A clipped ي reads as ى ("الأسمري" became
 *    "الأسمرى" on the live cards), so every Arabic block that clips must carry
 *    `paddingBottom` of ~0.45× the font size (overflow clips at the padding
 *    edge, so the padding is what gives the dots room).
 *
 * Related rule enforced at the call sites: never pass `letterSpacing` (even
 * 0) on Arabic runs — any value pushes Satori into its per-cluster layout
 * path, which destroys Arabic word spacing.
 */

const NBSP = '\u00A0';

/**
 * Neutral punctuation Satori cannot place inside an RTL run:
 *
 * - MID-run, it splits the run at the mark and lays the fragments out LTR
 *   ("مدرجات العرعر. يستضيف" comes out scrambled) — so every wrapper here
 *   guarantees these marks only ever END a line, never sit inside one.
 * - TRAILING, the words stay in correct RTL order but the mark itself lands
 *   on the RIGHT end of the line (".بدايتنا" instead of "عسير.") — so call
 *   sites render lines through {@link toArabicLine}, which peels the mark
 *   into its own flex box mirrored to the left with row-reverse.
 *
 * The Arabic comma (،) is NOT in this set: between two Arabic words it
 * resolves RTL and renders correctly mid-run.
 */
const MID_RUN_BREAKERS = /[.!?\u061f\u2026:;\u061b]/;

export interface ArabicLine {
  /** NBSP-joined words — renders as one correctly-shaped RTL run. */
  run: string;
  /** Trailing mark to render as its own box on the line's left, or null. */
  mark: string | null;
}

/**
 * Prepare one pre-wrapped line for rendering: NBSP-join the words and peel
 * any trailing neutral mark into `mark`. Render as
 * `flexDirection: 'row-reverse'` → [run][mark] so the mark sits on the left,
 * where RTL sentence punctuation belongs (leaving it inside the run puts it
 * on the right — see MID_RUN_BREAKERS).
 */
export function toArabicLine(line: string): ArabicLine {
  const m = line.match(/[.:;؛؟?!…]+$/u);
  if (!m || m[0].length === line.length) return { run: nbspJoin(line), mark: null };
  return { run: nbspJoin(line.slice(0, -m[0].length).trimEnd()), mark: m[0] };
}

/** Join a run's words with NBSP so Satori shapes it whole (Arabic only). */
export function nbspJoin(text: string): string {
  return text.replaceAll(' ', NBSP);
}

/** Greedy word-wrap at `maxCharsPerLine` (single segment, no clamping). */
function greedyWrap(text: string, maxCharsPerLine: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(' ')) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Split body copy into sentences, keeping each sentence-final mark attached
 * to the word before it. Wrapping per sentence is what keeps punctuation off
 * the middle of every line.
 */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?\u061f\u2026:;\u061b])\s+/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Pre-split a heading into visually balanced lines, splitting only when the
 * text exceeds `maxCharsPerLine`. Each returned line renders as its own
 * unbreakable run, so no line may ever exceed the budget (the previous
 * even-word-count split could emit an over-budget line, which overflowed the
 * canvas on long headings).
 */
export function splitBalanced(text: string, maxCharsPerLine: number): string[] {
  // Sentence-split first so a mark inside a longer heading can only ever end
  // a line (same guarantee as wrapToLines).
  return splitSentences(text).flatMap((sentence) => balanceOne(sentence, maxCharsPerLine));
}

function balanceOne(text: string, maxCharsPerLine: number): string[] {
  if (text.length <= maxCharsPerLine) return [text];
  const minimal = greedyWrap(text, maxCharsPerLine);
  if (minimal.length === 1) return minimal;
  // Balance: the smallest per-line budget that still fits in the same number
  // of lines greedy needed — evens the lines out without adding any.
  const soft = Math.ceil(text.length / minimal.length);
  for (let budget = soft; budget < maxCharsPerLine; budget++) {
    const lines = greedyWrap(text, budget);
    if (lines.length <= minimal.length) return lines;
  }
  return minimal;
}

/**
 * Sentence-aware word-wrap for body copy, clamped to `maxLines` with an
 * ellipsis on the last line when content is dropped. Lines never span a
 * sentence boundary, so sentence punctuation only ever ENDS a line — the
 * one position Satori renders it correctly in an RTL run.
 */
export function wrapToLines(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  // Balanced (not greedy) wrapping matters beyond looks here: Satori
  // over-measures shaped Arabic runs by an amount that grows with run
  // length, so right-aligned lines of similar length keep a visibly
  // straighter right edge.
  const lines = splitSentences(text).flatMap((sentence) => balanceOne(sentence, maxCharsPerLine));
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    const last = kept[maxLines - 1]?.trimEnd() ?? '';
    // Drop a trailing sentence mark before the ellipsis so the clipped line
    // ends "العرعر…", not "العرعر.…".
    kept[maxLines - 1] =
      `${last.replace(new RegExp(`${MID_RUN_BREAKERS.source}+$`, 'u'), '')}\u2026`;
    return kept;
  }
  return lines;
}

/**
 * Tokens for digit-mixed labels ("480 ر.س"): a digit-leading run makes Satori
 * lay the whole run out LTR, so callers render these as row-reverse flex
 * boxes (spaceBefore → marginRight at the call site). An Arabic token with an
 * embedded neutral mark ("ر.س") is exploded into single-char boxes — inside
 * one box Satori orders the fragments around the mark LTR, which had the
 * riyal abbreviation rendering backwards ("س.ر").
 */
export function mirrorTokens(text: string): { text: string; spaceBefore: boolean }[] {
  const out: { text: string; spaceBefore: boolean }[] = [];
  for (const [wi, word] of text.split(' ').entries()) {
    if (word.length > 1 && MID_RUN_BREAKERS.test(word)) {
      for (const [ci, ch] of [...word].entries()) {
        out.push({ text: ch, spaceBefore: ci === 0 && wi > 0 });
      }
    } else {
      out.push({ text: word, spaceBefore: wi > 0 });
    }
  }
  return out;
}

/**
 * Split marketing copy on em-dash asides (" — ") before wrapping: the dash
 * is a neutral Satori scrambles mid-run, and a line break at the aside reads
 * naturally where the dash did.
 */
export function splitDashAsides(text: string): string[] {
  return text
    .split(/\s+[\u2014\u2013]\s+/u)
    .map((s) => s.trim())
    .filter(Boolean);
}
