import { notFound } from 'next/navigation';

/**
 * Catch-all for any URL under a valid locale that no route matched.
 * Without it, unmatched paths fall through to Next's global (unbranded,
 * unlocalised) not-found. Routing this through the locale segment renders
 * the branded app/[locale]/not-found.tsx in the visitor's language.
 *
 * The throw is synchronous on purpose: nothing suspends before it, so the
 * response status is a real 404 — no ancestor loading.tsx may wrap this
 * segment or the 200 shell flushes first (see the note in layout.tsx).
 */
export default function CatchAllPage(): never {
  notFound();
}
