import { describe, expect, it } from 'vitest';
import { createDbFake } from './db-fake';

describe('createDbFake', () => {
  it('routes select results by projection and records writes', async () => {
    const db = createDbFake({
      select: (shape) => ('n' in shape ? [{ n: 3 }] : [{ id: 'a' }]),
      update: () => [{ id: 'a' }],
      insert: () => [{ id: 'new' }],
      query: { hosts: { findFirst: () => ({ id: 'h1' }) } },
    });
    expect(await db.select({ n: 1 }).from('t').where('w')).toEqual([{ n: 3 }]);
    expect(await db.select({ id: 1 }).from('t').where('w').orderBy('o').limit(5)).toEqual([
      { id: 'a' },
    ]);
    const updated = await db.update('t').set({ status: 'x' }).where('w').returning();
    expect(updated).toEqual([{ id: 'a' }]);
    expect(await db.insert('t').values({ a: 1 }).returning()).toEqual([{ id: 'new' }]);
    await db.delete('t').where('w');
    expect(await db.query.hosts.findFirst()).toEqual({ id: 'h1' });
    expect(await db.query.guests.findFirst()).toBeUndefined();
    expect(db.updates).toEqual([{ status: 'x' }]);
    expect(db.inserts).toEqual([{ a: 1 }]);
    expect(db.deletes).toBe(1);
  });

  it('hands the same fake to a transaction callback', async () => {
    const db = createDbFake();
    const out = await db.transaction(async (tx) => {
      await tx.update('t').set({ a: 1 }).where('w');
      return 'done';
    });
    expect(out).toBe('done');
    expect(db.updates).toEqual([{ a: 1 }]);
  });
});
