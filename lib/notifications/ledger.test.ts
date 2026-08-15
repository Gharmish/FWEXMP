import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Delivery-ledger tests. The ledger is the dispatcher's dedupe point
 * and its observability trail, so these pin the two postures that make
 * it safe: claims fail OPEN (no DB / a DB error must never block a
 * receipt) while duplicates fail CLOSED (a second claim on the same
 * (dedupeKey, channel) sends nothing), and provider status callbacks
 * only ever move a row forward — an out-of-order `delivered` after
 * `read` must not regress it.
 */

const env = vi.hoisted(() => ({ DATABASE_URL: 'postgres://test' }));
vi.mock('@/lib/env', () => ({ serverEnv: env }));

const reportError = vi.fn();
vi.mock('@/lib/log', () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));

const insertedValues: Array<Record<string, unknown>> = [];
const updateSets: Array<Record<string, unknown>> = [];
/** Which ON CONFLICT arm each insert used: `nothing` or `update`. */
const conflictModes: string[] = [];
let deleteCount = 0;
let insertConflict = false;
let dbFails = false;
let deliveryRow: { id: string; status: string } | undefined;
let suppressionRow: { id: string } | undefined;
let retryableRows: Array<{ bookingId: string | null; type: string; locale: string | null }> = [];

function insertResult(): Array<{ id: string }> {
  if (dbFails) throw new Error('db down');
  return insertConflict ? [] : [{ id: 'del-1' }];
}

vi.mock('@/lib/db', () => ({
  db: {
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        insertedValues.push(values);
        return {
          // `claimDelivery` awaits `.returning()`, `addSuppression`
          // awaits the builder itself — support both shapes lazily so
          // the unused path never creates a rejected promise.
          onConflictDoNothing: () => {
            conflictModes.push('nothing');
            return {
              returning: async () => insertResult(),
              then: (
                resolve: (rows: Array<{ id: string }>) => void,
                reject: (error: unknown) => void,
              ) => {
                try {
                  resolve(insertResult());
                } catch (error) {
                  reject(error);
                }
              },
            };
          },
          onConflictDoUpdate: () => {
            conflictModes.push('update');
            return {
              returning: async () => insertResult(),
              // `addSuppression`'s widen-to-all arm awaits the builder
              // itself (no `.returning()`), same as the do-nothing arm.
              then: (
                resolve: (rows: Array<{ id: string }>) => void,
                reject: (error: unknown) => void,
              ) => {
                try {
                  resolve(insertResult());
                } catch (error) {
                  reject(error);
                }
              },
            };
          },
        };
      },
    }),
    selectDistinct: () => ({
      from: () => ({
        // The query now orders before limiting (oldest backlog first).
        where: () => ({
          orderBy: () => ({
            limit: async () => {
              if (dbFails) throw new Error('db down');
              return retryableRows;
            },
          }),
        }),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        updateSets.push(values);
        return {
          where: async () => {
            if (dbFails) throw new Error('db down');
          },
        };
      },
    }),
    delete: () => ({
      where: async () => {
        if (dbFails) throw new Error('db down');
        deleteCount += 1;
      },
    }),
    query: {
      notificationDeliveries: {
        findFirst: async () => {
          if (dbFails) throw new Error('db down');
          return deliveryRow;
        },
      },
      notificationSuppressions: {
        findFirst: async () => {
          if (dbFails) throw new Error('db down');
          return suppressionRow;
        },
      },
    },
  },
}));

import {
  addSuppression,
  applyProviderStatus,
  claimDelivery,
  isSuppressed,
  listRetryableDeliveries,
  markDeliveryFailed,
  markDeliverySent,
  removeSuppression,
} from './ledger';

const claim = {
  dedupeKey: 'booking_confirmed:GH-7K3M9X',
  channel: 'email' as const,
  type: 'booking_confirmed',
  recipientType: 'guest',
  recipient: 'guest@example.com',
};

beforeEach(() => {
  vi.clearAllMocks();
  insertedValues.length = 0;
  updateSets.length = 0;
  conflictModes.length = 0;
  deleteCount = 0;
  insertConflict = false;
  dbFails = false;
  deliveryRow = undefined;
  suppressionRow = undefined;
  retryableRows = [];
  env.DATABASE_URL = 'postgres://test';
});

describe('claimDelivery', () => {
  it('inserts a queued row and returns its id', async () => {
    const result = await claimDelivery(claim);

    expect(result).toEqual({ claimed: true, id: 'del-1' });
    expect(insertedValues[0]).toMatchObject({
      dedupeKey: 'booking_confirmed:GH-7K3M9X',
      channel: 'email',
      status: 'queued',
      bookingId: null,
    });
  });

  it('ledgers a suppressed claim with status suppressed', async () => {
    await claimDelivery({ ...claim, suppressed: true });

    expect(insertedValues[0]).toMatchObject({ status: 'suppressed' });
  });

  it('returns duplicate when the (dedupeKey, channel) slot is taken', async () => {
    insertConflict = true;

    expect(await claimDelivery(claim)).toEqual({ claimed: false, reason: 'duplicate' });
  });

  it('fails open when there is no database', async () => {
    env.DATABASE_URL = '';

    expect(await claimDelivery(claim)).toEqual({ claimed: true, id: null });
    expect(insertedValues).toHaveLength(0);
  });

  it('fails open on a ledger error so the send still goes out', async () => {
    dbFails = true;

    expect(await claimDelivery(claim)).toEqual({ claimed: true, id: null });
    expect(reportError).toHaveBeenCalledTimes(1);
  });

  it('claims via the re-claim arm (failed rows with attempts left are retryable)', async () => {
    await claimDelivery(claim);

    // A normal claim goes through ON CONFLICT DO UPDATE — the arm whose
    // guard (`status = failed AND attempts < max`) re-opens failed rows.
    expect(conflictModes).toEqual(['update']);
  });

  it('a suppressed claim only records — it never re-claims a failed row', async () => {
    await claimDelivery({ ...claim, suppressed: true });

    expect(conflictModes).toEqual(['nothing']);
  });
});

describe('listRetryableDeliveries', () => {
  it('returns retryable rows and drops any without a booking', async () => {
    retryableRows = [
      { bookingId: 'b-1', type: 'booking_confirmed', locale: 'en' },
      { bookingId: null, type: 'application_decision', locale: null },
    ];

    const rows = await listRetryableDeliveries(50, ['booking_confirmed']);

    expect(rows).toEqual([{ bookingId: 'b-1', type: 'booking_confirmed', locale: 'en' }]);
  });

  it('is empty without a database', async () => {
    env.DATABASE_URL = '';
    retryableRows = [{ bookingId: 'b-1', type: 'booking_confirmed', locale: 'en' }];

    expect(await listRetryableDeliveries(50, ['booking_confirmed'])).toEqual([]);
  });

  it('is empty when the caller has no senders — never returns unsendable rows', async () => {
    // Rows whose type has no registered sender used to match this query
    // forever (failed, under the attempt cap, inside the window) and
    // squat on the bounded retry budget, starving a real backlog.
    retryableRows = [{ bookingId: 'b-1', type: 'booking_rescheduled', locale: 'en' }];

    expect(await listRetryableDeliveries(50, [])).toEqual([]);
  });

  it('is empty (and reports) on a DB error — the sweep just skips a run', async () => {
    dbFails = true;

    expect(await listRetryableDeliveries(50, ['booking_confirmed'])).toEqual([]);
    expect(reportError).toHaveBeenCalledTimes(1);
  });
});

describe('markDeliverySent / markDeliveryFailed', () => {
  it('stamps the sent status and provider message id', async () => {
    await markDeliverySent('del-1', 'SM-1');

    expect(updateSets[0]).toMatchObject({ status: 'sent', providerMessageId: 'SM-1' });
  });

  it('stamps a failure and truncates the detail to 500 chars', async () => {
    await markDeliveryFailed('del-1', 'x'.repeat(600));

    expect(updateSets[0].status).toBe('failed');
    expect(updateSets[0].error).toHaveLength(500);
  });

  it('is a no-op for an unledgered (null-id) claim', async () => {
    await markDeliverySent(null, 'SM-1');
    await markDeliveryFailed(null, 'boom');

    expect(updateSets).toHaveLength(0);
  });

  it('swallows and reports DB errors instead of throwing', async () => {
    dbFails = true;

    await expect(markDeliverySent('del-1', 'SM-1')).resolves.toBeUndefined();
    expect(reportError).toHaveBeenCalledTimes(1);
  });
});

describe('applyProviderStatus', () => {
  it('upgrades a row forward (sent → delivered)', async () => {
    deliveryRow = { id: 'del-1', status: 'sent' };

    await applyProviderStatus('SM-1', 'delivered');

    expect(updateSets[0]).toMatchObject({ status: 'delivered' });
  });

  it('never regresses a row (read stays read on a late delivered)', async () => {
    deliveryRow = { id: 'del-1', status: 'read' };

    await applyProviderStatus('SM-1', 'delivered');

    expect(updateSets).toHaveLength(0);
  });

  it('lets a definitive failure override delivered, with the error detail', async () => {
    deliveryRow = { id: 'del-1', status: 'delivered' };

    await applyProviderStatus('SM-1', 'failed', 'Twilio failed (63016)');

    expect(updateSets[0]).toMatchObject({ status: 'failed', error: 'Twilio failed (63016)' });
  });

  it('treats read and failed as equal rank — no flip either way', async () => {
    deliveryRow = { id: 'del-1', status: 'failed' };
    await applyProviderStatus('SM-1', 'read');

    deliveryRow = { id: 'del-1', status: 'read' };
    await applyProviderStatus('SM-1', 'failed');

    expect(updateSets).toHaveLength(0);
  });

  it('upgrades from a pre-webhook status (queued ranks as 0)', async () => {
    deliveryRow = { id: 'del-1', status: 'queued' };

    await applyProviderStatus('SM-1', 'sent');

    expect(updateSets[0]).toMatchObject({ status: 'sent' });
  });

  it('ignores an unknown provider message id', async () => {
    deliveryRow = undefined;

    await applyProviderStatus('SM-unknown', 'delivered');

    expect(updateSets).toHaveLength(0);
  });
});

describe('suppression list', () => {
  it('reports a listed address as suppressed', async () => {
    suppressionRow = { id: 'sup-1' };

    expect(await isSuppressed('email', 'guest@example.com')).toBe(true);
  });

  it('reports an unlisted address as not suppressed', async () => {
    expect(await isSuppressed('email', 'guest@example.com')).toBe(false);
  });

  it('fails OPEN on a DB error — an outage must not black-hole receipts', async () => {
    dbFails = true;

    expect(await isSuppressed('email', 'guest@example.com')).toBe(false);
    expect(reportError).toHaveBeenCalledTimes(1);
  });

  it('stores emails lowercased and phones as-is', async () => {
    await addSuppression('email', '  Guest@Example.COM ', 'stop');
    await addSuppression('whatsapp', ' +966541104000 ', 'stop');

    expect(insertedValues[0]).toMatchObject({ channel: 'email', address: 'guest@example.com' });
    expect(insertedValues[1]).toMatchObject({ channel: 'whatsapp', address: '+966541104000' });
  });

  it('removes an address on START', async () => {
    await removeSuppression('whatsapp', '+966541104000');

    expect(deleteCount).toBe(1);
  });

  it('add/remove swallow and report DB errors', async () => {
    dbFails = true;

    await expect(addSuppression('email', 'guest@example.com', 'stop')).resolves.toBeUndefined();
    await expect(removeSuppression('email', 'guest@example.com')).resolves.toBeUndefined();
    expect(reportError).toHaveBeenCalledTimes(2);
  });
});
