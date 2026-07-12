import { notFound } from 'next/navigation';

/**
 * Catch-all for unmatched routes inside the locale segment. Without it,
 * unknown URLs fall through to Next's unbranded default 404 — the
 * not-found.tsx boundary in app/[locale]/ only catches explicit
 * notFound() calls, so this route exists purely to trigger it.
 */
export default function CatchAllPage() {
  notFound();
}
