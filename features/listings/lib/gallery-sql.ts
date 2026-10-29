import { sql, type SQL } from 'drizzle-orm';
import { experiences } from '@/db/schema';

/**
 * In-place edits of `experiences.images` for the gallery upload/remove
 * actions (host and admin). Both used to write back a copy of the array
 * read before a multi-second storage upload, so a remove that landed in
 * between was undone by the upload's stale copy — the removed URL came
 * back pointing at a deleted object. Postgres applies these to the row's
 * current value, so concurrent uploads and removes compose.
 */
export function galleryAppend(url: string): SQL<string[]> {
  return sql<string[]>`array_append(${experiences.images}, ${url})`;
}

export function galleryRemove(url: string): SQL<string[]> {
  return sql<string[]>`array_remove(${experiences.images}, ${url})`;
}
