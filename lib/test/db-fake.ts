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
  limit: (n?: number) => Promise<unknown[]>;
  for: (mode?: unknown) => Promise<unknown[]>;
}

export interface WriteResult extends Promise<unknown> {
  returning: () => Promise<unknown[]>;
}

export interface InsertResult extends WriteResult {
  onConflictDoNothing: (options?: unknown) => WriteResult;
  onConflictDoUpdate: (options?: unknown) => Promise<unknown>;
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
  /** Every `.set()` payload, in order. */
  updates: Row[];
  /** Every `.values()` payload, in order. */
  inserts: Array<Row | Row[]>;
  /** How many `delete().where()` calls ran. */
  deletes: number;
}

function thenable<T>(value: () => T | Promise<T>): Promise<T> {
  return Promise.resolve().then(value);
}

export function createDbFake(options: DbFakeOptions = {}): DbFake {
  const updates: Row[] = [];
  const inserts: Array<Row | Row[]> = [];
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
    chain.limit = async () => rows();
    chain.for = async () => rows();
    chain.then = (onfulfilled, onrejected) => thenable(rows).then(onfulfilled, onrejected);
    return chain;
  };

  const updateChain = (values: Row) => {
    updates.push(values);
    const rows = () => options.update?.(values) ?? [];
    const where = () => {
      const p = thenable(() => ({ count: rows().length })) as Promise<unknown> & {
        returning: () => Promise<unknown[]>;
      };
      p.returning = async () => rows();
      return p;
    };
    return { where, returning: async () => rows() };
  };

  const insertChain = (values: Row | Row[]) => {
    inserts.push(values);
    const rows = () => options.insert?.(values) ?? [];
    const p = thenable(() => undefined) as Promise<unknown> & {
      returning: () => Promise<unknown[]>;
      onConflictDoNothing: () => Promise<unknown> & { returning: () => Promise<unknown[]> };
      onConflictDoUpdate: () => Promise<unknown>;
    };
    p.returning = async () => rows();
    p.onConflictDoNothing = () => {
      const q = thenable(() => undefined) as Promise<unknown> & {
        returning: () => Promise<unknown[]>;
      };
      q.returning = async () => rows();
      return q;
    };
    p.onConflictDoUpdate = async () => undefined;
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
    transaction: async (cb) => cb(fake),
    updates,
    inserts,
    get deletes() {
      return deletes;
    },
  };
  return fake;
}
