/**
 * A small chainable stand-in for the drizzle `db` handle (2026-09
 * engineering audit TEST-11). Suites used to hand-roll this shape 30+
 * times; this one covers the idioms the app uses — select chains that
 * end in `.limit()`/`.for()` or are awaited directly, `update().set()
 * .where()[.returning()]`, `insert().values()[.returning()|.onConflict…]`,
 * `delete().where()`, `query.<table>.findFirst/findMany`, `execute`, and
 * `transaction(cb)` that hands the same fake to the callback.
 *
 * Route results by the projected shape (`select`), the values written
 * (`update`/`insert`) or the table (`query`). Everything is recorded so a
 * test can assert what was written.
 */

import * as operators from 'drizzle-orm';

type Row = Record<string, unknown>;

export interface DbFakeOptions {
  /** Rows a select chain resolves to, chosen by the projection's keys. */
  select?: (shape: Row) => unknown[];
  /** Rows `.returning()` yields (and the row count an awaited update resolves to). */
  update?: (values: Row) => unknown[];
  /** Rows `.returning()` yields for an insert. */
  insert?: (values: Row | Row[]) => unknown[];
  /** `db.query.<table>.findFirst(args)` / `.findMany(args)`. */
  query?: Record<
    string,
    { findFirst?: (args: unknown) => unknown; findMany?: (args: unknown) => unknown[] }
  >;
  execute?: (query: unknown) => unknown;
}

export interface SelectChain extends PromiseLike<unknown[]> {
  from: (table: unknown) => SelectChain;
  where: (condition?: unknown) => SelectChain;
  innerJoin: (...args: unknown[]) => SelectChain;
  leftJoin: (...args: unknown[]) => SelectChain;
  orderBy: (...args: unknown[]) => SelectChain;
  groupBy: (...args: unknown[]) => SelectChain;
  offset: (n?: number) => SelectChain;
  limit: (n?: number) => SelectChain;
  for: (mode?: unknown) => Promise<unknown[]>;
}

export interface WriteResult extends Promise<unknown> {
  returning: () => Promise<unknown[]>;
}

export interface InsertResult extends WriteResult {
  onConflictDoNothing: (options?: unknown) => WriteResult;
  onConflictDoUpdate: (options?: unknown) => Promise<unknown>;
}

/** One `insert().values().onConflict…()` call — the upsert clause made observable. */
export interface UpsertRecord {
  values: Row | Row[];
  /** The `set` payload of onConflictDoUpdate; absent for onConflictDoNothing. */
  set?: Row;
  doNothing?: boolean;
}

export interface DbFake {
  select: (shape?: Row) => SelectChain;
  update: (table: unknown) => {
    set: (values: Row) => {
      where: (condition?: unknown) => WriteResult;
      returning: () => Promise<unknown[]>;
    };
  };
  insert: (table: unknown) => { values: (values: Row | Row[]) => InsertResult };
  delete: (table: unknown) => { where: (cond?: unknown) => Promise<unknown> };
  query: Record<
    string,
    {
      findFirst: (args?: unknown) => Promise<unknown>;
      findMany: (args?: unknown) => Promise<unknown[]>;
    }
  >;
  execute: (query: unknown) => Promise<unknown>;
  transaction: <T>(cb: (tx: DbFake) => Promise<T>) => Promise<T>;
  /** Every executed `.set()` payload, in order. */
  updates: Row[];
  /** The `.where()` condition of each executed update, index-aligned with `updates`. */
  updateConditions: unknown[];
  /** Every `.values()` payload, in order. */
  inserts: Array<Row | Row[]>;
  /**
   * Every on-conflict clause, in order. A suite that covers an upsert
   * asserts the `set` payload here — without it, deleting the clause from
   * a singleton-row write (platform_settings, cancellation_policies) kept
   * every test green while production hit a guaranteed PK conflict
   * (third-round verification R1).
   */
  upserts: UpsertRecord[];
  /** How many `delete().where()` calls ran. */
  deletes: number;
}

function thenable<T>(value: () => T | Promise<T>): Promise<T> {
  return Promise.resolve().then(value);
}

export function createDbFake(options: DbFakeOptions = {}): DbFake {
  const updates: Row[] = [];
  const updateConditions: unknown[] = [];
  const inserts: Array<Row | Row[]> = [];
  const upserts: UpsertRecord[] = [];
  let deletes = 0;

  const selectChain = (shape: Row): SelectChain => {
    const rows = () => options.select?.(shape) ?? [];
    const chain = {} as SelectChain;
    const link = () => chain;
    chain.from = link;
    chain.where = link;
    chain.innerJoin = link;
    chain.leftJoin = link;
    chain.orderBy = link;
    chain.groupBy = link;
    chain.offset = link;
    // Both `.limit(n).offset(n)` and `.offset(n).limit(n)` are idioms the
    // app uses (third-round R5), so limit stays chainable; the chain is
    // thenable, so awaiting it after either still resolves the rows.
    chain.limit = link;
    chain.for = async () => rows();
    chain.then = (onfulfilled, onrejected) => thenable(rows).then(onfulfilled, onrejected);
    return chain;
  };

  /**
   * A write is recorded when it is EXECUTED (awaited / `.returning()`),
   * not when its builder is called (third-round R12): `updates` and
   * `inserts` mean "writes that ran", and a transaction that throws rolls
   * its recorded writes back. `run` is memoised so `.returning()` after
   * `await` does not double-record.
   */
  const lazy = <T>(run: () => T): Promise<T> & { returning: () => Promise<unknown[]> } => {
    let started: Promise<T> | null = null;
    const start = () => (started ??= Promise.resolve().then(run));
    const p = {
      then: <R1, R2>(
        onfulfilled?: ((value: T) => R1 | PromiseLike<R1>) | null,
        onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
      ) => start().then(onfulfilled, onrejected),
      catch: <R>(onrejected?: ((reason: unknown) => R | PromiseLike<R>) | null) =>
        start().catch(onrejected),
      finally: (onfinally?: (() => void) | null) => start().finally(onfinally),
      [Symbol.toStringTag]: 'Promise',
      returning: async () => {
        await start();
        return [] as unknown[];
      },
    };
    return p as Promise<T> & { returning: () => Promise<unknown[]> };
  };

  const updateChain = (values: Row) => {
    const rows = () => options.update?.(values) ?? [];
    const commit = (condition: unknown) => {
      updates.push(values);
      updateConditions.push(condition);
    };
    const where = (condition?: unknown) => {
      const p = lazy(() => {
        commit(condition);
        return { count: rows().length };
      }) as WriteResult;
      p.returning = async () => {
        await p;
        return rows();
      };
      return p;
    };
    return {
      where,
      returning: async () => {
        commit(undefined);
        return rows();
      },
    };
  };

  const insertChain = (values: Row | Row[]) => {
    const rows = () => options.insert?.(values) ?? [];
    let recorded = false;
    const commit = () => {
      if (!recorded) inserts.push(values);
      recorded = true;
    };
    const p = lazy(() => {
      commit();
      return undefined;
    }) as InsertResult;
    p.returning = async () => {
      await p;
      return rows();
    };
    p.onConflictDoNothing = () => {
      const q = lazy(() => {
        commit();
        upserts.push({ values, doNothing: true });
        return undefined;
      }) as WriteResult;
      q.returning = async () => {
        await q;
        return rows();
      };
      return q;
    };
    p.onConflictDoUpdate = (conflict?: unknown) => {
      const set =
        conflict && typeof conflict === 'object' && 'set' in conflict
          ? ((conflict as { set?: Row }).set ?? undefined)
          : undefined;
      return lazy(() => {
        commit();
        upserts.push({ values, set });
        return undefined;
      });
    };
    return p;
  };

  const query = new Proxy({} as DbFake['query'], {
    get: (_target, table: string) => ({
      findFirst: async (args?: unknown) => options.query?.[table]?.findFirst?.(args),
      findMany: async (args?: unknown) => options.query?.[table]?.findMany?.(args) ?? [],
    }),
  });

  const fake: DbFake = {
    select: (shape: Row = {}) => selectChain(shape),
    update: () => ({ set: updateChain }),
    insert: () => ({ values: insertChain }),
    delete: () => ({
      where: async () => {
        deletes += 1;
        return undefined;
      },
    }),
    query,
    execute: async (q: unknown) => options.execute?.(q),
    // The fake hands itself back so chains keep working inside a
    // transaction; a callback that throws rolls back what it recorded.
    transaction: async <T>(cb: (tx: DbFake) => Promise<T>): Promise<T> => {
      const mark = { u: updates.length, i: inserts.length, up: upserts.length, d: deletes };
      try {
        return await cb(fake);
      } catch (error) {
        updates.length = mark.u;
        updateConditions.length = mark.u;
        inserts.length = mark.i;
        upserts.length = mark.up;
        deletes = mark.d;
        throw error;
      }
    },
    updates,
    updateConditions,
    inserts,
    upserts,
    get deletes() {
      return deletes;
    },
  };
  return fake;
}

/**
 * Every column a drizzle SQL/Column tree references, by its TypeScript
 * key (`hostId`, `status`). Lets a suite assert the predicate of a
 * conditional write — the claim guards that make a decision idempotent
 * (third-round R4) — instead of only its payload.
 */
export function referencedColumns(
  node: unknown,
  found: string[] = [],
  seen = new WeakSet<object>(),
): string[] {
  if (!node || typeof node !== 'object') return found;
  if (seen.has(node)) return found;
  seen.add(node);
  const candidate = node as { name?: unknown; columnType?: unknown };
  if (typeof candidate.name === 'string' && typeof candidate.columnType === 'string') {
    found.push(candidate.name);
    return found; // never descend into the column's table back-reference
  }
  for (const value of Object.values(node as Record<string, unknown>)) {
    if (Array.isArray(value)) value.forEach((v) => referencedColumns(v, found, seen));
    else if (value && typeof value === 'object') referencedColumns(value, found, seen);
  }
  return found;
}

/**
 * The columns a relational `findFirst`/`findMany` `where` references. The
 * callback form is invoked with the real table so the predicate is built
 * exactly as production builds it; a suite can then refuse a row whose
 * owner column is not in the predicate (third-round R6).
 */
export function relationalWhereColumns(args: unknown, table: unknown): string[] {
  const where = (args as { where?: unknown } | undefined)?.where;
  if (typeof where === 'function') return referencedColumns(where(table, operators));
  return referencedColumns(where);
}
