import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { serverEnv } from '@/lib/env';
import { reportWarning } from '@/lib/log';
import * as schema from '@/db/schema';

/**
 * Drizzle client over postgres.js (BRIEF §5: Postgres via Supabase,
 * Drizzle ORM).
 *
 * Lazily instantiated: importing this module never connects or throws,
 * so builds stay green while DATABASE_URL is absent (no page touches the
 * DB yet in Sprint 1). The connection is created on first use and a
 * clear error is thrown if DATABASE_URL is unset.
 *
 * Connection options, all required to stay healthy behind Supabase's
 * transaction-mode pgbouncer pooler (port 6543):
 *   - `prepare: false` — pgbouncer transaction mode can't keep named
 *     prepared statements across pooled backends.
 *   - `idle_timeout` — postgres.js defaults to keeping idle connections
 *     forever, but the pooler silently recycles idle server backends.
 *     Reusing one the pooler already dropped surfaces as
 *     `CONNECTION_CLOSED` / `invalid frontend message type 101`. Closing
 *     our side first avoids stale-connection reuse. Dev uses 20s; on
 *     Vercel it is 5s because sockets that survive an instance freeze
 *     come back dead (2026-08-21 prod incident — see `createClient`).
 *   - `max_lifetime` — recycle connections well before any upstream cap.
 *   - `connect_timeout` — fail fast instead of hanging a render.
 *
 * The client is cached on `globalThis` so Next.js dev HMR reuses one
 * pool instead of leaking a fresh pool (and its connections) on every
 * module re-evaluation.
 *
 * The pool can be swapped at runtime via {@link resetDb} when a query
 * hangs past its deadline (lib/deadline.ts); the `db` proxy below always
 * resolves to the current instance, so callers never hold a stale pool.
 */
type Database = PostgresJsDatabase<typeof schema>;

// Sanctioned exception to the "no `as unknown as`" rule (audit
// 2026-07-28): `globalThis` has no index signature, so the canonical
// Next.js dev-HMR cache-slot pattern needs the double assertion; the
// `declare global`/`var` alternative trips the no-var lint rule. Scope
// is one private, optional property — nothing else reads it.
const globalForDb = globalThis as unknown as {
  __gharmishPgClient?: ReturnType<typeof postgres>;
};

let instance: Database | undefined;

/**
 * Monotonic pool generation. Bumped by {@link resetDb}; callers snapshot
 * it before a query so a reset triggered by a stale failure (one that
 * ran on an already-replaced pool) is a no-op instead of a cascade of
 * resets when several in-flight queries hit the same dead socket.
 */
let generation = 0;

export function getDbGeneration(): number {
  return generation;
}

function createClient(): ReturnType<typeof postgres> {
  if (!serverEnv.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env and add your Supabase connection string before using the database.',
    );
  }
  const onVercel = Boolean(process.env.VERCEL);
  return postgres(serverEnv.DATABASE_URL, {
    prepare: false,
    // On Vercel, idle sockets that survive an instance freeze come back
    // half-dead (seen in prod as `write ETIMEDOUT`, Supavisor "Timeout
    // while waiting for message in state SCRAM final", and 8s deadlines
    // on sub-millisecond queries). A short idle window means a thawed
    // instance almost always reconnects instead of reusing a corpse —
    // a same-region reconnect costs tens of ms; a dead socket costs the
    // whole deadline. Dev keeps 20s (HMR comfort, no freezes).
    idle_timeout: onVercel ? 5 : 20,
    max_lifetime: 60 * 30,
    // Must sit BELOW the per-query deadline in lib/deadline.ts so a
    // stalled handshake surfaces as a retryable CONNECT_TIMEOUT rather
    // than a silent hang that burns the deadline first.
    connect_timeout: onVercel ? 5 : 15,
    // postgres.js defaults to 10 connections per client — per lambda
    // instance on Vercel, so a traffic spike's fan-out (hundreds of
    // warm instances) could exhaust Supavisor's client-connection cap.
    // 5 still covers the widest in-request Promise.all (the admin
    // dashboard's 8 aggregates mostly pipeline) and Fluid's modest
    // in-function concurrency; dev keeps the default for HMR comfort.
    max: onVercel ? 5 : 10,
  });
}

let currentClient: ReturnType<typeof postgres> | undefined;

/**
 * Suspension watch (Vercel only — nothing else freezes the process).
 *
 * A socket with a statement in flight when the instance is frozen comes
 * back poisoned: the statement never settles, so postgres.js keeps the
 * connection in its `busy` list forever. That costs nothing while other
 * slots are free, but once a fan-out needs more connections than remain
 * the driver pipelines the overflow onto the longest-busy connection —
 * the corpse — and that statement hangs with no error. `boundedQuery`
 * callers recover by deadline; every other path (admin pages, server
 * actions, crons) waited out the function timeout.
 *
 * A one-second heartbeat timestamps the event loop. A beat more than
 * `THAW_GAP_MS` overdue means the loop was not running — the instance
 * slept — so the pool is replaced BEFORE the next statement is
 * dispatched. `getDb()` checks as well as the beat itself, because on a
 * thaw the waking request's I/O can run before the overdue timer does.
 * Healthy idle sockets were due to close anyway (`idle_timeout` 5s), so
 * the swap discards nothing of value, and statements still in flight on
 * the old pool get `resetDb`'s usual drain.
 */
const THAW_BEAT_MS = 1_000;
const THAW_GAP_MS = 5_000;
let lastBeat = 0;
let beat: ReturnType<typeof setInterval> | undefined;

function replacePoolAfterThaw(): void {
  if (!beat) return;
  const now = Date.now();
  if (now - lastBeat - THAW_BEAT_MS <= THAW_GAP_MS) return;
  lastBeat = now;
  resetDb(generation);
}

function watchForThaw(): void {
  if (beat || !process.env.VERCEL) return;
  lastBeat = Date.now();
  beat = setInterval(() => {
    replacePoolAfterThaw();
    lastBeat = Date.now();
  }, THAW_BEAT_MS);
  // Never the reason the process stays alive.
  beat.unref();
}

/**
 * Statement long-stop: no statement on the shared pool may stay pending
 * forever, whoever issued it.
 *
 * `boundedQuery` protects the public render paths, but admin pages,
 * server actions and crons call `db` directly, and a statement stuck on
 * a poisoned connection never rejects — the caller waits out the
 * function timeout. Every top-level statement therefore arms a timer;
 * one still pending after `STATEMENT_STOP_MS` retires its pool, and the
 * driver rejects whatever is still stuck on it with
 * `CONNECTION_DESTROYED` a moment later, so the caller fails into its
 * own error handling instead of hanging. The stop sits far above both
 * `boundedQuery` budgets (so those paths still recover by retry first)
 * and above any statement this app runs (tens of milliseconds).
 *
 * Only `unsafe` is wrapped — the one entry point drizzle uses for
 * top-level statements. Transactions go through `begin`, whose inner
 * client is untouched: row and advisory lock waits there are legitimate.
 * Attaching the settle handler starts the (lazy) driver query one
 * microtask later, after drizzle's synchronous `.values()` — drizzle
 * awaits every statement immediately, so nothing observes the change.
 */
const STATEMENT_STOP_MS = 20_000;
const STATEMENT_STOP_DRAIN_SECONDS = 2;

function withStatementStop(client: ReturnType<typeof postgres>): ReturnType<typeof postgres> {
  return new Proxy(client, {
    get(target, prop) {
      if (prop !== 'unsafe') return Reflect.get(target, prop);
      return (...args: Parameters<typeof target.unsafe>) => {
        const statement = target.unsafe(...args);
        const seenGeneration = generation;
        const stop = setTimeout(() => {
          const poolReset = resetDb(seenGeneration, STATEMENT_STOP_DRAIN_SECONDS);
          reportWarning(new Error(`statement pending past ${STATEMENT_STOP_MS}ms`), {
            surface: 'db:statementStop',
            poolReset,
          });
        }, STATEMENT_STOP_MS);
        stop.unref();
        const settled = () => clearTimeout(stop);
        statement.then(settled, settled);
        return statement;
      };
    },
  });
}

function install(client: ReturnType<typeof postgres>): Database {
  if (process.env.NODE_ENV !== 'production') {
    globalForDb.__gharmishPgClient = client;
  }
  currentClient = client;
  instance = drizzle(withStatementStop(client), { schema, casing: 'snake_case' });
  watchForThaw();
  return instance;
}

export function getDb(): Database {
  if (!instance) {
    return install(globalForDb.__gharmishPgClient ?? createClient());
  }
  replacePoolAfterThaw();
  return instance;
}

/**
 * Replace the shared pool after a query hung past its deadline.
 *
 * A hung statement never settles, so its pool slot is never released:
 * with `max: 5`, five silent hangs leave an instance with a pool that
 * can only hang (seen in prod as bursts of every detail-page query
 * timing out for one user). Swapping in a fresh client gives the retry
 * — and every later query on this instance — healthy sockets. The old
 * client is drained in the background: in-flight statements get
 * `drainSeconds` to finish normally, then whatever is still stuck (the
 * hung ones) is destroyed.
 *
 * No-op unless `seenGeneration` is still current, so N concurrent
 * deadline failures on the same dead pool cause one reset, not N.
 */
export function resetDb(seenGeneration: number, drainSeconds = 10): boolean {
  if (seenGeneration !== generation || !instance) return false;
  generation += 1;
  const retiring = currentClient;
  install(createClient());
  retiring?.end({ timeout: drainSeconds }).catch(() => undefined);
  return true;
}

/** Ergonomic accessor — proxies to the lazily-created client. */
/** A drizzle transaction handle, as passed to `db.transaction(async (tx) => …)`. */
export type DbTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];
/** Anything a query can run on — the pool or a transaction (DATA-03). */
export type DbExecutor = Database | DbTransaction;

export const db = new Proxy({} as Database, {
  get(_target, prop) {
    return getDb()[prop as keyof Database];
  },
});

// Same sanctioned `as unknown as` exception as `globalForDb` above.
const globalForAnalyticsDb = globalThis as unknown as {
  __gharmishAnalyticsPgClient?: ReturnType<typeof postgres>;
};

let analyticsInstance: Database | undefined;

/**
 * Separate tiny pool for fire-and-forget analytics writes (`after()`
 * callbacks). Isolation is the point, not throughput: post-response work
 * is where the serverless runtime can freeze the instance mid-socket-write,
 * leaving a pooled connection with a half-sent statement. On the SHARED
 * pool that poisoned slot then hangs whichever page query gets queued onto
 * it next (seen in production as the admin dashboard never finishing —
 * backends `active` waiting on `ClientRead` for minutes). Here a poisoned
 * slot can only ever delay other analytics writes, and the short
 * `max_lifetime` recycles it within minutes.
 */
export function getAnalyticsDb(): Database {
  if (!analyticsInstance) {
    if (!serverEnv.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set.');
    }
    const client =
      globalForAnalyticsDb.__gharmishAnalyticsPgClient ??
      postgres(serverEnv.DATABASE_URL, {
        prepare: false,
        idle_timeout: 10,
        max_lifetime: 300,
        connect_timeout: 15,
        max: 1,
      });
    if (process.env.NODE_ENV !== 'production') {
      globalForAnalyticsDb.__gharmishAnalyticsPgClient = client;
    }
    analyticsInstance = drizzle(client, { schema, casing: 'snake_case' });
  }
  return analyticsInstance;
}
