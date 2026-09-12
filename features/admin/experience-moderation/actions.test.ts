import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbFake, referencedColumns } from '@/lib/test/db-fake';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/cache-tags', () => ({ revalidateExperienceCaches: vi.fn() }));
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
const email = vi.fn<(id: string, decision: string) => Promise<void>>(async () => undefined);
vi.mock('@/features/admin/experience-moderation/moderation-email', () => ({
  sendExperienceModerationEmail: (id: string, decision: string) => email(id, decision),
}));

type Row = Record<string, unknown>;
let experience: Row | undefined;
let updated: Row[] = [];
const fake = vi.hoisted(() => ({ current: null as ReturnType<typeof createDbFake> | null }));
vi.mock('@/lib/db', () => ({
  get db() {
    return fake.current;
  },
}));

import {
  approveExperience,
  rejectExperience,
  requestExperienceChanges,
  updateExperienceArabicCopy,
} from './actions';

const ID = '99999999-9999-4999-8999-999999999999';
const form = (over: Record<string, string> = {}) => {
  const fd = new FormData();
  fd.set('experienceId', ID);
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
function ready(over: Row = {}): Row {
  return {
    heroImage: 'https://x/hero.jpg',
    titleEn: 'Sunrise coffee walk',
    descriptionEn: 'A walk.',
    titleAr: 'جولة قهوة',
    descriptionAr: 'وصف',
    inclusions: ['Coffee'],
    inclusionsAr: ['قهوة'],
    whatToBring: [],
    whatToBringAr: [],
    moments: [{ titleAr: 'لحظة', descriptionAr: 'وصف' }],
    ...over,
  };
}

beforeEach(() => {
  actor = { adminUserId: 'admin-1' };
  experience = ready();
  updated = [{ id: ID }];
  email.mockClear();
  fake.current = createDbFake({
    query: { experiences: { findFirst: () => experience } },
    update: () => updated,
  });
});

describe('approveExperience', () => {
  it('refuses a listing that is not ready, naming the first gap', async () => {
    const cases: Array<[Row, string]> = [
      [ready({ heroImage: null }), 'needs_hero'],
      [ready({ titleAr: 'TODO(ar): title' }), 'needs_arabic'],
      [ready({ descriptionEn: '   ' }), 'needs_english'],
      [ready({ moments: [{ titleAr: 'TODO(ar)', descriptionAr: 'x' }] }), 'needs_arabic_moments'],
      [ready({ whatToBring: ['Hat'], whatToBringAr: [] }), 'needs_arabic_lists'],
    ];
    for (const [row, message] of cases) {
      experience = row;
      expect(await approveExperience(initial, form())).toMatchObject({ message });
    }
    expect(fake.current?.updates).toEqual([]);
  });

  it('is not_found / wrong_state when the row is missing or not pending review', async () => {
    experience = undefined;
    expect(await approveExperience(initial, form())).toMatchObject({ message: 'not_found' });
    experience = ready();
    updated = [];
    expect(await approveExperience(initial, form())).toMatchObject({ message: 'wrong_state' });
  });

  it('goes live, journals the event, emails the host and redirects', async () => {
    expect(await run(() => approveExperience(initial, form({ reviewerNotes: 'Great' })))).toBe(
      `REDIRECT:/admin/experience-moderation/${ID}`,
    );
    expect(fake.current?.updates[0]).toMatchObject({ status: 'live' });
    // The claim re-asserts pending_review so a decided listing cannot be re-decided.
    expect(referencedColumns(fake.current?.updateConditions[0])).toEqual(
      expect.arrayContaining(['id', 'status']),
    );
    expect(fake.current?.inserts[0]).toMatchObject({
      experienceId: ID,
      event: 'approved',
      toStatus: 'live',
      reviewerNotes: 'Great',
    });
    expect(email).toHaveBeenCalledWith(ID, 'approved');
  });
});

describe('rejectExperience / requestExperienceChanges / updateExperienceArabicCopy', () => {
  it('both decisions need a ten-character note and echo it', async () => {
    expect(await rejectExperience(initial, form({ reviewerNotes: 'short' }))).toMatchObject({
      message: 'validation',
      fieldError: 'reviewer_note_short',
      values: { reviewerNotes: 'short' },
    });
    expect(await requestExperienceChanges(initial, form({ reviewerNotes: 'short' }))).toMatchObject(
      { fieldError: 'reviewer_note_short' },
    );
  });

  it('a rejection returns the listing to draft; a change request to changes_requested', async () => {
    const note = 'Please add the meeting point.';
    expect(await run(() => rejectExperience(initial, form({ reviewerNotes: note })))).toBe(
      `REDIRECT:/admin/experience-moderation/${ID}`,
    );
    expect(fake.current?.updates[0]).toMatchObject({ status: 'draft' });
    expect(referencedColumns(fake.current?.updateConditions[0])).toEqual(
      expect.arrayContaining(['id', 'status']),
    );
    expect(email).toHaveBeenCalledWith(ID, 'rejected');
    expect(await run(() => requestExperienceChanges(initial, form({ reviewerNotes: note })))).toBe(
      `REDIRECT:/admin/experience-moderation/${ID}`,
    );
    expect(fake.current?.updates[1]).toMatchObject({ status: 'changes_requested' });
    expect(referencedColumns(fake.current?.updateConditions[1])).toEqual(
      expect.arrayContaining(['id', 'status']),
    );
    expect(fake.current?.inserts[1]).toMatchObject({
      event: 'changes_requested',
      reviewerNotes: note,
    });
    updated = [];
    expect(await rejectExperience(initial, form({ reviewerNotes: note }))).toMatchObject({
      message: 'wrong_state',
    });
  });

  it('the Arabic copy editor validates, splits the lists, and journals an edit', async () => {
    expect(
      await updateExperienceArabicCopy(initial, form({ titleAr: 'x', descriptionAr: 'y' })),
    ).toMatchObject({
      message: 'validation',
      fieldError: 'title_ar_invalid',
    });
    updated = [{ status: 'pending_review' }];
    expect(
      await run(() =>
        updateExperienceArabicCopy(
          initial,
          form({
            titleAr: 'جولة قهوة الفجر',
            descriptionAr: 'وصف طويل بما يكفي',
            inclusionsArRaw: 'قهوة\nتمر\n',
            whatToBringArRaw: '',
          }),
        ),
      ),
    ).toBe(`REDIRECT:/admin/experience-moderation/${ID}`);
    expect(fake.current?.updates[0]).toMatchObject({
      titleAr: 'جولة قهوة الفجر',
      inclusionsAr: ['قهوة', 'تمر'],
      whatToBringAr: [],
    });
    expect(fake.current?.inserts[0]).toMatchObject({
      event: 'edited',
      fromStatus: 'pending_review',
      toStatus: 'pending_review',
    });
    updated = [];
    expect(
      await updateExperienceArabicCopy(
        initial,
        form({
          titleAr: 'جولة قهوة الفجر',
          descriptionAr: 'وصف طويل بما يكفي',
          inclusionsArRaw: '',
          whatToBringArRaw: '',
        }),
      ),
    ).toMatchObject({ message: 'not_found' });
  });
});
