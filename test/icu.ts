import type { ReactNode } from 'react';

/**
 * Tiny ICU MessageFormat helpers for tests: which arguments and tags a
 * message needs, without pulling in the parser (a transitive dependency of
 * next-intl that the strict pnpm layout does not expose to the repo).
 * Depth-0 scanning is enough for our catalogs — nested plurals reuse the
 * outer arguments.
 */

export type IcuArgKind = 'plural' | 'select' | 'selectordinal' | 'number' | 'date' | 'time' | 'plain';

export interface IcuArg {
  name: string;
  kind: IcuArgKind;
  /** First option of a select, so a caller can pick a matching value. */
  firstOption?: string;
}

/** Top-level ICU arguments of `message` with their formatter kind. */
export function icuArgSpecs(message: string): IcuArg[] {
  const out = new Map<string, IcuArg>();
  let depth = 0;
  for (let i = 0; i < message.length; i += 1) {
    const ch = message[i];
    if (ch === '{') {
      if (depth === 0) {
        const m = /^\{\s*([A-Za-z_][\w-]*)\s*(?:,\s*(plural|select|selectordinal|number|date|time)\b(?:\s*,\s*([A-Za-z_][\w-]*))?)?/.exec(
          message.slice(i),
        );
        if (m && !out.has(m[1])) {
          const kind = (m[2] as IcuArgKind | undefined) ?? 'plain';
          out.set(m[1], {
            name: m[1],
            kind,
            firstOption: kind === 'select' ? m[3] : undefined,
          });
        }
      }
      depth += 1;
    } else if (ch === '}') {
      depth = Math.max(0, depth - 1);
    }
  }
  return [...out.values()];
}

/** Top-level ICU argument names of `message`. */
export function icuArgs(message: string): Set<string> {
  return new Set(icuArgSpecs(message).map((a) => a.name));
}

/** Rich-text tag names (`<b>…</b>`) a message expects the caller to render. */
export function icuTags(message: string): Set<string> {
  const tags = new Set<string>();
  for (const m of message.matchAll(/<([A-Za-z][\w-]*)>/g)) tags.add(m[1]);
  return tags;
}

/**
 * Values that satisfy every argument of `message`, so a test can format it
 * and surface INVALID_MESSAGE / FORMATTING_ERROR without knowing the real
 * call site.
 */
export function icuDummyArgValues(message: string): Record<string, string | number | Date> {
  const values: Record<string, string | number | Date> = {};
  // Arguments nested inside plural/select bodies (`other {{formatted} …}`)
  // sit below depth 0; a regex over the whole string picks them up. The
  // `[,}]` after the name keeps option bodies (`other {some text}`) out.
  const deep = new Map<string, IcuArgKind>();
  for (const m of message.matchAll(
    /\{\s*([A-Za-z_][\w-]*)\s*(?:,\s*(plural|select|selectordinal|number|date|time)\b)?\s*[,}]/g,
  )) {
    if (!deep.has(m[1])) deep.set(m[1], (m[2] as IcuArgKind | undefined) ?? 'plain');
  }
  const specs: IcuArg[] = icuArgSpecs(message);
  for (const [name, kind] of deep) if (!specs.some((a) => a.name === name)) specs.push({ name, kind });
  for (const arg of specs) {
    switch (arg.kind) {
      case 'plural':
      case 'selectordinal':
      case 'number':
        values[arg.name] = 3;
        break;
      case 'date':
      case 'time':
        values[arg.name] = new Date(0);
        break;
      case 'select':
        values[arg.name] = arg.firstOption ?? 'other';
        break;
      default:
        values[arg.name] = arg.name;
    }
  }
  return values;
}

/** Render functions for every rich-text tag of `message` (for `t.rich`). */
export function icuDummyTagValues(
  message: string,
): Record<string, (chunks: ReactNode) => ReactNode> {
  const values: Record<string, (chunks: ReactNode) => ReactNode> = {};
  for (const tag of icuTags(message)) values[tag] = (chunks) => chunks;
  return values;
}
