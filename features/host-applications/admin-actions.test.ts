import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbFake, referencedColumns } from '@/lib/test/db-fake';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
vi.mock('@/lib/i18n', () => ({
  redirect: (args: { href: string }) => {
    throw new Error(`REDIRECT:${args.href}`);
  },
}));
let actor: Record<string, unknown> = { adminUserId: 'admin-1' };
vi.mock('@/features/admin/guard', () => ({
  requireAdminActor: async () => actor,
  adminGateRefused: (a: Record<string, unknown>) => 'refused' in a,
  adminFailureMessage: () => 'forbidden',
}));
vi.mock('@/lib/pii-crypto', () => ({ decryptPii: (v: string | null) => v }));
vi.mock('@/features/hosts/lib/slug', () => ({
  hostBaseSlug: (name: string) => name.toLowerCase().replace(/\s+/g, '-'),
  hostSlugSuffix: () => 'x1y2',
}));
vi.mock('@/features/host-applications/lib/documents', () => ({
  requiredDocumentTypes: () => ['national_id'],
}));
const approvedEmail = vi.fn(async () => undefined);
const rejectedEmail = vi.fn(async () => undefined);
vi.mock('@/features/host-applications/lib/application-email', () => ({
  sendApplicationApprovedEmail: (...a: unknown[]) => approvedEmail(...(a as [])),
  sendApplicationRejectedEmail: (...a: unknown[]) => rejectedEmail(...(a as [])),
}));

type Row = Record<string, unknown>;
let application: Row | undefined;
let documents: Row[] = [];
let claimed: Row[] = [];
let slugTaken = false;
const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof createDbFake> | null }));
vi.mock('@/lib/db', () => ({
  get db() {
    return fake.current;
  },
}));

import { approveApplication, rejectApplication, reviewDocument } from './admin-actions';

const ID = '55555555-5555-4555-8555-555555555555';
const form = (over: Record<string, string> = {}) => {
  const fd = new FormData();
  fd.set('applicationId', ID);
  fd.set('locale', 'en');
  for (const [k, v] of Object.entries(over)) fd.set(k, v);
  return fd;
};
const initial = { success: false as const };
const run = async (fn: () => Promise<unknown>) => {
  try {
    return await fn();
  } catch (error) {
    return (error as Error).message;
  }
};
function claimedApp(): Row {
  return {
    id: ID,
    userId: 'u1',
    displayName: 'Sara Coffee',
    bioEn: 'bio',
    bioAr: null,
    identityType: 'national_id',
    identityNumber: '1234567890',
    iban: 'SA0380000000608010167519',
    languages: ['ar'],
    city: 'Abha',
    region: 'Aseer',
    contactEmail: 'sara@example.com',
    contactPhone: '+966512345678',
  };
}

beforeEach(() => {
  actor = { adminUserId: 'admin-1' };
  application = { id: ID, identityType: 'national_id' };
  documents = [{ type: 'national_id', status: 'approved' }];
  claimed = [claimedApp()];
  slugTaken = false;
  approvedEmail.mockClear();
  rejectedEmail.mockClear();
  fake.current = createDbFake({
    query: {
      hostApplications: { findFirst: () => application, findMany: () => [] },
      hostApplicationDocuments: { findMany: () => documents },
      hosts: { findFirst: () => (slugTaken ? { id: 'h-old' } : undefined) },
    },
    update: (values) => ('status' in values ? claimed : []),
    insert: (values) => (!Array.isArray(values) && 'slug' in values ? [{ id: 'h1' }] : []),
  });
});

describe('approveApplication', () => {
  it('needs an admin and a well-formed id', async () => {
    actor = { refused: true };
    expect(await approveApplication(initial, form())).toEqual({
      success: false,
      message: 'forbidden',
    });
    actor = { adminUserId: 'admin-1' };
    expect(await approveApplication(initial, form({ applicationId: 'x' }))).toMatchObject({
      message: 'validation',
    });
  });

  it('refuses until every required document is approved', async () => {
    documents = [{ type: 'national_id', status: 'pending' }];
    expect(await approveApplication(initial, form())).toMatchObject({
      message: 'documents_incomplete',
    });
    expect(fake.current?.updates).toEqual([]);
  });

  it('is not_found for a missing application and wrong_state when the claim loses', async () => {
    application = undefined;
    expect(await approveApplication(initial, form())).toMatchObject({ message: 'not_found' });
    application = { id: ID, identityType: 'national_id' };
    claimed = [];
    expect(await approveApplication(initial, form())).toMatchObject({ message: 'wrong_state' });
  });

  it('mints the host, records the IBAN event and the approval, emails, then redirects', async () => {
    slugTaken = true;
    expect(await run(() => approveApplication(initial, form({ reviewerNotes: 'ok' })))).toBe(
      `REDIRECT:/admin/host-applications/${ID}`,
    );
    const inserts = fake.current?.inserts as Row[];
    expect(inserts[0]).toMatchObject({
      userId: 'u1',
      name: 'Sara Coffee',
      slug: 'sara-coffee-x1y2',
      verificationStatus: 'verified',
      payoutIban: 'SA0380000000608010167519',
    });
    expect(inserts[1]).toMatchObject({
      hostId: 'h1',
      actorUserId: 'admin-1',
      previousIbanMasked: null,
    });
    expect(inserts[2]).toMatchObject({ applicationId: ID, event: 'approved', reviewerNotes: 'ok' });
    expect(fake.current?.updates[1]).toEqual({ hostId: 'h1' });
    // The claim is conditional on the application still being pending —
    // re-approving an approved application would mint a second host row.
    expect(referencedColumns(fake.current?.updateConditions[0])).toEqual(
      expect.arrayContaining(['id', 'status']),
    );
    expect(approvedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ contactEmail: 'sara@example.com', displayName: 'Sara Coffee' }),
    );
  });
});

describe('rejectApplication / reviewDocument', () => {
  it('a rejection needs a real note', async () => {
    expect(await rejectApplication(initial, form({ reviewerNotes: 'no' }))).toMatchObject({
      message: 'validation',
      fieldError: 'rejection_note_short',
      values: { reviewerNotes: 'no' },
    });
  });

  it('rejects once, records the event, emails and redirects', async () => {
    claimed = [
      { id: ID, displayName: 'Sara Coffee', languages: ['ar'], contactEmail: 'sara@example.com' },
    ];
    const note = 'Documents do not match the CR number.';
    expect(await run(() => rejectApplication(initial, form({ reviewerNotes: note })))).toBe(
      `REDIRECT:/admin/host-applications/${ID}`,
    );
    expect(fake.current?.inserts[0]).toMatchObject({ event: 'rejected', reviewerNotes: note });
    expect(referencedColumns(fake.current?.updateConditions[0])).toEqual(
      expect.arrayContaining(['id', 'status']),
    );
    expect(rejectedEmail).toHaveBeenCalledTimes(1);
    claimed = [];
    expect(await rejectApplication(initial, form({ reviewerNotes: note }))).toMatchObject({
      message: 'wrong_state',
    });
  });

  it('a document rejection needs a note; an approval does not', async () => {
    const fd = new FormData();
    fd.set('documentId', ID);
    fd.set('decision', 'rejected');
    expect(await reviewDocument({ success: false }, fd)).toMatchObject({
      message: 'validation',
      fieldError: 'rejection_note_short',
    });
    fd.set('decision', 'approved');
    claimed = [{ id: ID }];
    expect(await reviewDocument({ success: false }, fd)).toEqual({ success: true });
    expect(fake.current?.updates.at(-1)).toMatchObject({
      status: 'approved',
      reviewedByUserId: 'admin-1',
    });
  });
});
