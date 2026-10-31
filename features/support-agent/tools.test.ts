import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Freeze the clock so fixtures built from `new Date()` never drift across
// midnight or DST (2026-09 engineering audit TEST-13). Only Date is faked;
// timers stay real for the deadline helpers.
const FIXED_NOW = new Date('2026-09-11T09:00:00.000Z');
beforeAll(() => vi.useFakeTimers({ now: FIXED_NOW, toFake: ['Date'] }));
afterAll(() => vi.useRealTimers());

vi.mock('server-only', () => ({}));
/** Select chain for the tests that reach the db (only decide_booking_request does). */
let dbSelect: (shape: Record<string, unknown>) => unknown = () => {
  throw new Error('unexpected select');
};
/** The thread's ownership as the write tools re-read it (#69). */
let conversationState: 'bot' | 'human' | 'closed' = 'bot';
vi.mock('@/lib/db', () => ({
  db: {
    select: (shape: Record<string, unknown>) => dbSelect(shape),
    query: { conversations: { findFirst: async () => ({ state: conversationState }) } },
  },
}));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
vi.mock('@/lib/whatsapp', () => ({ whatsappLink: () => null }));
vi.mock('@/features/bookings/queries', () => ({
  getBookingsForGuest: vi.fn(async () => []),
  getHostContactPhoneForBooking: vi.fn(async () => null),
}));
vi.mock('@/lib/booking-link-token', () => ({ bookingManageUrl: () => 'https://x' }));
const cancelBookingCore = vi.fn();
vi.mock('@/features/bookings/lib/cancel-core', () => ({
  cancelBookingCore: (...args: unknown[]) => cancelBookingCore(...args),
}));
const saveRefundBankDetails = vi.fn();
vi.mock('@/features/bookings/lib/refund-bank-core', () => ({
  saveRefundBankDetails: (...args: unknown[]) => saveRefundBankDetails(...args),
}));
vi.mock('@/features/bookings/lib/reschedule-core', () => ({ rescheduleBookingCore: vi.fn() }));
vi.mock('@/features/availability/queries', () => ({ getScheduleDataBySlug: vi.fn() }));
vi.mock('@/features/support/tickets', () => ({ openTicket: vi.fn() }));
const executeBookingTransition = vi.fn();
vi.mock('@/features/bookings/lib/transition-executor', () => ({
  executeBookingTransition: (...args: unknown[]) => executeBookingTransition(...args),
}));
const attemptIdentityChallenge = vi.fn();
vi.mock('./identity', async (importOriginal) => ({
  // `sameNumber` is pure and is what the booking-scope filter runs on;
  // only the challenge itself is faked.
  ...(await importOriginal<typeof import('./identity')>()),
  attemptIdentityChallenge: (...args: unknown[]) => attemptIdentityChallenge(...args),
}));

import { confirmationPresent, runTool, toolsFor, TOOLS, type ToolContext } from './tools';
import { getBookingsForGuest } from '@/features/bookings/queries';
import { getScheduleDataBySlug } from '@/features/availability/queries';

describe('confirmationPresent', () => {
  it("accepts the guest's words when they are in the latest message", () => {
    expect(confirmationPresent('yes cancel it', 'Yes, cancel it please')).toBe(true);
  });
  it('is tolerant of Arabic diacritics and spacing', () => {
    expect(confirmationPresent('نعم ألغ الحجز', 'نعم   ألغِ الحجز')).toBe(true);
  });
  it('rejects a quote the guest never wrote', () => {
    expect(confirmationPresent('yes', 'what time do we meet?')).toBe(false);
  });
  it('rejects a long new request that merely contains a yes', () => {
    const long = 'yes ' + 'I also want to ask about something else entirely '.repeat(6);
    expect(confirmationPresent('yes', long)).toBe(false);
  });
  it('rejects empty or one-character quotes', () => {
    expect(confirmationPresent('', 'yes')).toBe(false);
    expect(confirmationPresent('y', 'y')).toBe(false);
  });
});

describe('TOOLS', () => {
  it('never exposes a phone or guest identifier as a parameter', () => {
    const params = TOOLS.flatMap((t) =>
      Object.keys((t.input_schema as { properties: object }).properties),
    );
    expect(params.some((p) => /phone|guest_id|address/.test(p))).toBe(false);
  });
  it('requires a confirmation quote for the two action tools', () => {
    for (const name of ['cancel_booking', 'reschedule_booking']) {
      const tool = TOOLS.find((t) => t.name === name)!;
      expect((tool.input_schema as { required: string[] }).required).toContain(
        'confirmation_quote',
      );
    }
  });
});

describe('refund bank details via the agent', () => {
  const ctx: ToolContext = {
    conversationId: 'c-1',
    address: 'whatsapp:+966500000000',
    guestId: 'g-1',
    hostId: null,
    identityVerified: true,
    identityVerifiedAt: new Date(),
    guestHasEmail: true,
    bookingScope: 'account',
    locale: 'en',
    now: new Date('2026-08-21T09:00:00Z'),
    lastInbound: 'yes cancel it',
  };
  const booking = {
    id: 'b-1',
    reference: 'ref-1',
    referenceCode: 'GH-AAAAAA',
    refundDueSar: 5,
    refundBank: null,
  };
  const VALID_IBAN = 'SA03 8000 0000 6080 1016 7519';

  beforeEach(() => {
    vi.mocked(getBookingsForGuest).mockResolvedValue([booking as never]);
    cancelBookingCore.mockReset();
    saveRefundBankDetails.mockReset();
  });

  it('passes a valid bank block through to the cancel core', async () => {
    cancelBookingCore.mockResolvedValue({
      success: true,
      refund: 'refund_pending',
      partial: false,
      refundAmountSar: 5,
    });
    const out = await runTool(
      'cancel_booking',
      {
        reference_code: 'GH-AAAAAA',
        confirmation_quote: 'yes cancel it',
        bank_name: 'Al Rajhi',
        beneficiary_name: 'Aziz',
        iban: VALID_IBAN,
      },
      ctx,
    );
    expect(JSON.parse(out.result)).toMatchObject({ success: true, refund: 'refund_pending' });
    expect(cancelBookingCore).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: 'agent',
        bankDetails: {
          bankName: 'Al Rajhi',
          beneficiaryName: 'Aziz',
          iban: 'SA0380000000608010167519',
        },
      }),
    );
  });

  it('rejects an invalid IBAN before touching the booking', async () => {
    const out = await runTool(
      'cancel_booking',
      {
        reference_code: 'GH-AAAAAA',
        confirmation_quote: 'yes cancel it',
        bank_name: 'Al Rajhi',
        beneficiary_name: 'Aziz',
        iban: 'SA00 1234',
      },
      ctx,
    );
    expect(JSON.parse(out.result)).toMatchObject({
      error: 'bank_details_invalid',
      fields: { iban: 'iban_invalid' },
    });
    expect(cancelBookingCore).not.toHaveBeenCalled();
  });

  it('tells the agent to collect bank details when the core refuses without them', async () => {
    cancelBookingCore.mockResolvedValue({ success: false, message: 'bank_details_required' });
    const out = await runTool(
      'cancel_booking',
      { reference_code: 'GH-AAAAAA', confirmation_quote: 'yes cancel it' },
      ctx,
    );
    const parsed = JSON.parse(out.result);
    expect(parsed.message).toBe('bank_details_required');
    expect(parsed.note).toMatch(/IBAN/);
  });

  it('saves details for an already-queued refund and reports nothing_owed otherwise', async () => {
    saveRefundBankDetails.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const input = {
      reference_code: 'GH-AAAAAA',
      bank_name: 'SNB',
      beneficiary_name: 'Aziz',
      iban: VALID_IBAN,
    };
    expect(
      JSON.parse((await runTool('submit_refund_bank_details', input, ctx)).result),
    ).toMatchObject({ success: true, refund_due_sar: 5 });
    expect(saveRefundBankDetails).toHaveBeenCalledWith('b-1', {
      bankName: 'SNB',
      beneficiaryName: 'Aziz',
      iban: 'SA0380000000608010167519',
    });
    expect(
      JSON.parse((await runTool('submit_refund_bank_details', input, ctx)).result),
    ).toMatchObject({ error: 'nothing_owed' });
  });

  it('surfaces the refund queue state in booking_detail tool schema docs', () => {
    const tool = TOOLS.find((t) => t.name === 'submit_refund_bank_details')!;
    expect((tool.input_schema as { required: string[] }).required).toEqual([
      'reference_code',
      'bank_name',
      'beneficiary_name',
      'iban',
    ]);
  });
});

/**
 * The gate that matters, tested where it actually holds.
 *
 * `toolsFor` withholds these tools from an unverified sender, but a tool
 * list only shapes what the model reaches for — it enforces nothing. A
 * model that ignores its instructions, or one steered by a guest who
 * insists, will still emit the tool call. This is the check that stops
 * it, so it is the one worth pinning.
 */
describe('write tools refuse an unverified sender', () => {
  const unverified: ToolContext = {
    conversationId: 'c-1',
    address: '+966500000000',
    guestId: 'g-1',
    hostId: null,
    identityVerified: false,
    guestHasEmail: true,
    bookingScope: 'account',
    locale: 'en',
    now: new Date('2026-08-21T10:00:00Z'),
    lastInbound: 'yes cancel it',
  };

  beforeEach(() => {
    cancelBookingCore.mockReset();
    saveRefundBankDetails.mockReset();
    vi.mocked(getBookingsForGuest).mockReset();
  });

  for (const [name, input] of [
    ['cancel_booking', { reference_code: 'GH-7K3M9X', confirmation_quote: 'yes cancel it' }],
    [
      'reschedule_booking',
      { reference_code: 'GH-7K3M9X', new_date: '2026-09-01', confirmation_quote: 'yes cancel it' },
    ],
    [
      'submit_refund_bank_details',
      {
        reference_code: 'GH-7K3M9X',
        bank_name: 'Al Rajhi',
        beneficiary_name: 'Sara',
        iban: 'SA0380000000608010167519',
      },
    ],
  ] as const) {
    it(`${name} refuses, and never reaches the booking lookup`, async () => {
      const outcome = await runTool(name, input, unverified);
      expect(JSON.parse(outcome.result).error).toBe('identity_not_verified');
      // Refused BEFORE any work: no lookup, no core call, nothing to leak.
      expect(getBookingsForGuest).not.toHaveBeenCalled();
      expect(cancelBookingCore).not.toHaveBeenCalled();
      expect(saveRefundBankDetails).not.toHaveBeenCalled();
    });
  }

  it('tells the agent to fetch a person when there is no address to check', async () => {
    const outcome = await runTool(
      'cancel_booking',
      { reference_code: 'GH-7K3M9X', confirmation_quote: 'yes cancel it' },
      { ...unverified, guestHasEmail: false },
    );
    expect(JSON.parse(outcome.result).error).toBe('identity_not_verifiable');
    expect(cancelBookingCore).not.toHaveBeenCalled();
  });
});

describe('verify_identity results', () => {
  const ctx: ToolContext = {
    conversationId: 'c-1',
    address: '+966500000000',
    guestId: 'g-1',
    hostId: null,
    identityVerified: false,
    guestHasEmail: true,
    bookingScope: 'account',
    locale: 'en',
    now: new Date('2026-08-21T10:00:00Z'),
    lastInbound: 'sara@example.com',
  };

  beforeEach(() => attemptIdentityChallenge.mockReset());

  it('reports a pass', async () => {
    attemptIdentityChallenge.mockResolvedValue('verified');
    const result = JSON.parse(
      (await runTool('verify_identity', { email: 'sara@example.com' }, ctx)).result,
    );
    expect(result.verified).toBe(true);
  });

  it('never echoes the submitted address back, on any outcome', async () => {
    // The model sees these strings. If a result carried the address —
    // the guess or the stored one — an attacker could narrow it by
    // trying, or simply ask the agent to read it back.
    for (const outcome of ['mismatch', 'no_email_on_file', 'throttled', 'unavailable']) {
      attemptIdentityChallenge.mockResolvedValue(outcome);
      const raw = (await runTool('verify_identity', { email: 'guess@attacker.com' }, ctx)).result;
      expect(raw).not.toContain('guess@attacker.com');
      expect(raw).not.toContain('attacker');
      expect(JSON.parse(raw).verified).toBe(false);
    }
  });

  it('passes the conversation-bound identity, never anything from the model', async () => {
    attemptIdentityChallenge.mockResolvedValue('mismatch');
    await runTool('verify_identity', { email: 'x@y.com' }, ctx);
    expect(attemptIdentityChallenge).toHaveBeenCalledWith({
      conversationId: 'c-1',
      guestId: 'g-1',
      address: '+966500000000',
      submittedEmail: 'x@y.com',
    });
  });

  // The same `ctx` object serves every tool call of a turn (agent.ts).
  // A pass must be visible to the calls that follow it in that turn, or
  // the agent asks for the email it was just given (#134).
  it('unlocks the write tools for the rest of the same turn once verified (#134)', async () => {
    attemptIdentityChallenge.mockResolvedValue('verified');
    const turn: ToolContext = { ...ctx, identityVerified: false, identityVerifiedAt: null };
    expect(toolsFor(turn).map((t) => t.name)).not.toContain('cancel_booking');

    await runTool('verify_identity', { email: 'sara@example.com' }, turn);

    expect(turn.identityVerified).toBe(true);
    expect(turn.identityVerifiedAt).toEqual(turn.now);
    const names = toolsFor(turn).map((t) => t.name);
    expect(names).toContain('cancel_booking');
    expect(names).not.toContain('verify_identity');
    // Past the identity gate: the next refusal is the missing booking, not the identity.
    vi.mocked(getBookingsForGuest).mockResolvedValueOnce([]);
    const out = JSON.parse(
      (await runTool('cancel_booking', { reference_code: 'GH-NONE00' }, turn)).result,
    );
    expect(out.error).toBe('not_found');
  });

  it('leaves the turn locked on every other outcome', async () => {
    for (const outcome of ['mismatch', 'no_email_on_file', 'throttled', 'unavailable']) {
      attemptIdentityChallenge.mockResolvedValue(outcome);
      const turn: ToolContext = { ...ctx, identityVerified: false, identityVerifiedAt: null };
      await runTool('verify_identity', { email: 'guess@attacker.com' }, turn);
      expect(turn.identityVerified).toBe(false);
      expect(turn.identityVerifiedAt).toBeNull();
    }
  });
});

describe('decide_booking_request (issue #41)', () => {
  const hostCtx: ToolContext = {
    conversationId: 'c-1',
    address: 'whatsapp:+966500000000',
    guestId: null,
    hostId: 'h-1',
    identityVerified: false,
    identityVerifiedAt: null,
    guestHasEmail: false,
    bookingScope: 'account',
    locale: 'en',
    now: new Date('2026-08-21T09:00:00Z'),
    lastInbound: 'yes approve it',
  };
  const input = {
    reference_code: 'GH-AAAAAA',
    decision: 'approve',
    confirmation_quote: 'yes approve it',
  };

  /** Routes the two selects the tool makes: host status, then the booking. */
  function routeSelects(status: 'verified' | 'suspended') {
    dbSelect = (shape) => {
      const rows =
        'verificationStatus' in shape ? [{ verificationStatus: status }] : [{ id: 'b-1' }];
      const chain = {
        from: () => chain,
        innerJoin: () => chain,
        where: () => chain,
        limit: async () => rows,
      };
      return chain;
    };
  }

  beforeEach(() => {
    executeBookingTransition.mockReset();
    executeBookingTransition.mockResolvedValue({ ok: true });
  });

  it('refuses a suspended host without touching the booking', async () => {
    routeSelects('suspended');
    const out = await runTool('decide_booking_request', input, hostCtx);
    expect(JSON.parse(out.result)).toEqual({ error: 'suspended' });
    expect(executeBookingTransition).not.toHaveBeenCalled();
  });

  it('still lets a verified host approve', async () => {
    routeSelects('verified');
    await runTool('decide_booking_request', input, hostCtx);
    expect(executeBookingTransition).toHaveBeenCalledWith('b-1', 'confirmed', {
      kind: 'host',
      hostId: 'h-1',
    });
  });
});

describe('write tools after an admin takes the thread (#69)', () => {
  const ctx: ToolContext = {
    conversationId: 'c-1',
    address: 'whatsapp:+966500000000',
    guestId: 'g-1',
    hostId: 'h-1',
    identityVerified: true,
    identityVerifiedAt: new Date(),
    guestHasEmail: true,
    bookingScope: 'account',
    locale: 'en',
    now: new Date('2026-08-21T09:00:00Z'),
    lastInbound: 'yes cancel it',
  };

  beforeEach(() => {
    conversationState = 'bot';
    vi.mocked(getBookingsForGuest).mockResolvedValue([
      { id: 'b-1', reference: 'ref-1', referenceCode: 'GH-AAAAAA' } as never,
    ]);
    cancelBookingCore.mockReset();
    saveRefundBankDetails.mockReset();
    executeBookingTransition.mockReset();
    dbSelect = () => {
      throw new Error('unexpected select');
    };
  });

  const cancelInput = { reference_code: 'GH-AAAAAA', confirmation_quote: 'yes cancel it' };

  it('does not cancel once the thread is human-owned', async () => {
    conversationState = 'human';
    const out = await runTool('cancel_booking', cancelInput, ctx);
    expect(JSON.parse(out.result)).toMatchObject({ error: 'handed_to_human' });
    expect(cancelBookingCore).not.toHaveBeenCalled();
  });

  it('refuses every write on a closed thread: reschedule, bank details, host decision', async () => {
    conversationState = 'closed';
    for (const name of [
      'reschedule_booking',
      'submit_refund_bank_details',
      'decide_booking_request',
    ]) {
      const out = await runTool(name, { ...cancelInput, decision: 'approve' }, ctx);
      expect(JSON.parse(out.result)).toMatchObject({ error: 'handed_to_human' });
    }
    expect(saveRefundBankDetails).not.toHaveBeenCalled();
    expect(executeBookingTransition).not.toHaveBeenCalled();
  });

  it('still cancels while the bot owns the thread', async () => {
    cancelBookingCore.mockResolvedValue({ success: true, refund: 'none' });
    const out = await runTool('cancel_booking', cancelInput, ctx);
    expect(JSON.parse(out.result)).toMatchObject({ success: true });
    expect(cancelBookingCore).toHaveBeenCalledTimes(1);
  });

  it('keeps read-only tools running after a take-over', async () => {
    conversationState = 'human';
    const out = await runTool('list_my_bookings', {}, ctx);
    expect(JSON.parse(out.result)).toHaveProperty('bookings');
  });
});

/**
 * A conversation bound through `bookings.contact_phone` is not the
 * account (#234, 2026-10-30): the number was typed on ONE booking, by
 * someone else or by mistake, so the read tools must show that booking
 * and nothing else on the account until the sender passes the email
 * challenge.
 */
describe('booking reads are scoped to the number that received them (#234)', () => {
  const SENDER = '+966500000002';
  const base: ToolContext = {
    conversationId: 'c-1',
    address: SENDER,
    guestId: 'g-1',
    hostId: null,
    identityVerified: false,
    identityVerifiedAt: null,
    guestHasEmail: true,
    bookingScope: 'contact',
    locale: 'en',
    now: new Date('2026-08-21T09:00:00Z'),
    lastInbound: 'what are my bookings?',
  };
  /** The booking whose contact phone is the sender. */
  const addressed = {
    id: 'b-addressed',
    reference: 'ref-addressed',
    referenceCode: 'GH-ADDRES',
    guestPhone: SENDER,
    status: 'confirmed',
    paymentStatus: 'paid',
    totalAmountSar: 200,
    walletAppliedSar: 0,
    createdAt: '2026-08-01T09:00:00.000Z',
  };
  /** Another trip on the same account, addressed to the account's own phone. */
  const unrelated = {
    id: 'b-other',
    reference: 'ref-other',
    referenceCode: 'GH-OTHER0',
    guestPhone: '+966500000001',
    status: 'confirmed',
    paymentStatus: 'paid',
    totalAmountSar: 300,
    walletAppliedSar: 0,
    createdAt: '2026-08-02T09:00:00.000Z',
  };
  const codes = (out: { result: string }) =>
    (JSON.parse(out.result).bookings as Array<{ reference_code: string }>).map(
      (b) => b.reference_code,
    );

  beforeEach(() => {
    conversationState = 'bot';
    vi.mocked(getBookingsForGuest).mockResolvedValue([unrelated, addressed] as never);
  });

  it('lists only the booking addressed to a contact-phone sender', async () => {
    const out = await runTool('list_my_bookings', {}, base);
    expect(codes(out)).toEqual(['GH-ADDRES']);
  });

  it('matches the number on its digits, whatever the punctuation', async () => {
    const out = await runTool(
      'list_my_bookings',
      {},
      { ...base, address: 'whatsapp:+966 50 000 0002' },
    );
    expect(codes(out)).toEqual(['GH-ADDRES']);
  });

  it("refuses booking_detail on the account's other booking and points at the email check", async () => {
    const out = await runTool('booking_detail', { reference_code: 'GH-OTHER0' }, base);
    const parsed = JSON.parse(out.result) as { error: string; note: string };
    expect(parsed.error).toBe('not_found');
    expect(parsed.note).toContain('verify_identity');
  });

  it('still finds the booking addressed to the sender (same lookup every per-booking tool uses)', async () => {
    // `available_dates` goes through the same `findOwnBooking` as
    // booking_detail, cancel and reschedule, with the smallest fixture.
    vi.mocked(getScheduleDataBySlug).mockResolvedValueOnce(null as never);
    const out = await runTool('available_dates', { reference_code: 'GH-ADDRES' }, base);
    expect(JSON.parse(out.result)).toMatchObject({ error: 'unavailable' });
    expect(getScheduleDataBySlug).toHaveBeenCalledTimes(1);
  });

  it("shows the whole account when the number is the guest row's own phone", async () => {
    const out = await runTool('list_my_bookings', {}, { ...base, bookingScope: 'account' });
    expect(codes(out)).toEqual(['GH-OTHER0', 'GH-ADDRES']);
  });

  it('shows the whole account once the sender has proven the email on it', async () => {
    const out = await runTool(
      'list_my_bookings',
      {},
      { ...base, identityVerified: true, identityVerifiedAt: new Date() },
    );
    expect(codes(out)).toEqual(['GH-OTHER0', 'GH-ADDRES']);
  });

  it('widens the view within the same turn as the passed email check (#234 review)', async () => {
    // The `not_found` note tells the model to verify_identity "then try
    // again"; the retry happens in the same turn, on the same ctx.
    attemptIdentityChallenge.mockResolvedValue('verified');
    vi.mocked(getScheduleDataBySlug).mockReset();
    vi.mocked(getScheduleDataBySlug).mockResolvedValue(null as never);
    const turn: ToolContext = { ...base };
    // `available_dates` shares `findOwnBooking` with booking_detail and the
    // write tools; the schedule read runs only once the booking is found.
    const before = await runTool('available_dates', { reference_code: 'GH-OTHER0' }, turn);
    expect(JSON.parse(before.result)).toMatchObject({ error: 'not_found' });
    expect(getScheduleDataBySlug).not.toHaveBeenCalled();

    await runTool('verify_identity', { email: 'sara@example.com' }, turn);

    const after = await runTool('available_dates', { reference_code: 'GH-OTHER0' }, turn);
    expect(JSON.parse(after.result)).toMatchObject({ error: 'unavailable' });
    expect(getScheduleDataBySlug).toHaveBeenCalledTimes(1);
    expect(codes(await runTool('list_my_bookings', {}, turn))).toEqual(['GH-OTHER0', 'GH-ADDRES']);
  });
});
