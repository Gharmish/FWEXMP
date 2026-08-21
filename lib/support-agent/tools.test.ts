import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/log', () => ({ reportError: vi.fn() }));
vi.mock('@/lib/whatsapp', () => ({ whatsappLink: () => null }));
vi.mock('@/features/bookings/queries', () => ({
  getBookingsForGuest: vi.fn(async () => []),
  getHostContactPhoneForBooking: vi.fn(async () => null),
}));
vi.mock('@/features/bookings/lib/link-token', () => ({ bookingManageUrl: () => 'https://x' }));
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

import { confirmationPresent, runTool, TOOLS, type ToolContext } from './tools';
import { getBookingsForGuest } from '@/features/bookings/queries';

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
