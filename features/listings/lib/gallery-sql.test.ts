import { describe, expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { galleryAppend, galleryRemove } from './gallery-sql';

const dialect = new PgDialect({ casing: 'snake_case' });

describe('gallery image SQL', () => {
  it('appends and removes against the row, not a copy read earlier', () => {
    const append = dialect.sqlToQuery(galleryAppend('https://x/a.jpg'));
    expect(append.sql).toBe('array_append("experiences"."images", $1)');
    expect(append.params).toEqual(['https://x/a.jpg']);
    const remove = dialect.sqlToQuery(galleryRemove('https://x/a.jpg'));
    expect(remove.sql).toBe('array_remove("experiences"."images", $1)');
    expect(remove.params).toEqual(['https://x/a.jpg']);
  });
});
