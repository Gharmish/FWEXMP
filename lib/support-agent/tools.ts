import 'server-only';

import type Anthropic from '@anthropic-ai/sdk';
import { db } from '@/lib/db';
import { and, eq, gte, inArray } from 'drizzle-orm';
import { bookings, conversations, experiences, guests, hosts } from '@/db/schema';
import { executeBookingTransition } from '@/features/bookings/lib/transition-executor';
import { reportError } from '@/lib/log';
import { whatsappLink } from '@/lib/whatsapp';
import {
  getBookingsForGuest,
  getHostContactPhoneForBooking,
  type GuestBookingSummary,
} from '@/features/bookings/queries';
import { bookingOptions } from '@/features/bookings/lib/policy';
import { bookingManageUrl } from '@/features/bookings/lib/link-token';
import { cancelBookingCore } from '@/features/bookings/lib/cancel-core';
import { saveRefundBankDetails } from '@/features/bookings/lib/refund-bank-core';
import { refundBankDetailsSchema, type RefundBankDetailsInput } from '@/features/bookings/schemas';
import { rescheduleBookingCore } from '@/features/bookings/lib/reschedule-core';
import { getScheduleDataBySlug } from '@/features/availability/queries';
import {
  addDays,
  bookableDates,
  nowMinutesInRiyadh,
  todayInRiyadh,
} from '@/features/bookings/lib/availability';
import { openTicket, type TicketCategory, type TicketPriority } from '@/features/support/tickets';

/**
 * Tools the support agent may call. Identity is never a parameter: every
 * tool is bound to the conversation's sender (`ctx.guestId`), resolved
 * by phone before the model runs, so the model cannot ask about anyone
 * else's booking no matter what the message says. Results are plain
 * JSON strings; the model reads them as data.
 */

export interface ToolContext {
  conversationId: string;
  address: string;
  guestId: string | null;
  /** Set when the sender's number is an active host's notification phone. */
  hostId: string | null;
  locale: 'en' | 'ar';
  now: Date;
  /** The guest message that triggered this turn — the only place a confirmation can come from. */
  lastInbound: string;
}

export interface ToolOutcome {
  result: string;
  /** Set when the tool changed the conversation's ownership. */
  handedToHuman?: boolean;
  ticketReference?: string;
}

const TICKET_CATEGORIES: TicketCategory[] = [
  'refund_exception',
  'payment_issue',
  'safety_incident',
  'host_no_show',
  'guest_complaint',
  'host_request',
  'account',
  'other',
];
const TICKET_PRIORITIES: TicketPriority[] = ['urgent', 'high', 'normal'];

const HOST_TOOL_NAMES = new Set(['list_host_bookings', 'decide_booking_request']);

/** The tool set for this sender: host tools only appear for hosts. */
export function toolsFor(ctx: Pick<ToolContext, 'hostId'>): Anthropic.Tool[] {
  return ctx.hostId ? TOOLS : TOOLS.filter((t) => !HOST_TOOL_NAMES.has(t.name));
}

export const TOOLS: Anthropic.Tool[] = [
  {
    name: 'list_my_bookings',
    description:
      "List the bookings that belong to the person you are talking to (matched by their WhatsApp number). Call this before answering anything about a booking. Returns newest first with reference code, experience, date, status, payment and the guest's private booking-page link.",
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'booking_detail',
    description:
      "Full detail for one of the guest's bookings: meeting place, map link, host contact (only once confirmed), what a cancellation would refund RIGHT NOW under the booking's policy, and whether a reschedule is still possible. Use the reference code from list_my_bookings (e.g. GH-7K3M9X).",
    input_schema: {
      type: 'object',
      properties: {
        reference_code: { type: 'string', description: 'Booking reference code, e.g. GH-7K3M9X' },
      },
      required: ['reference_code'],
      additionalProperties: false,
    },
  },
  {
    name: 'available_dates',
    description:
      "Open dates in the next 30 days the guest's booking could move to (already filtered for the host's schedule, blackouts, cutoff and remaining capacity for their party size). Use before offering a reschedule.",
    input_schema: {
      type: 'object',
      properties: {
        reference_code: { type: 'string', description: 'Booking reference code, e.g. GH-7K3M9X' },
      },
      required: ['reference_code'],
      additionalProperties: false,
    },
  },
  {
    name: 'cancel_booking',
    description:
      "Cancel one of the guest's bookings under its policy — exactly what booking_detail's `cancel` block says (refund_if_cancelled_now / refund_amount_sar). TWO-STEP RULE: first call booking_detail and tell the guest the exact consequence (which booking, date, and the refund amount or that nothing is refunded), then ask them to confirm. Only when their NEXT message clearly confirms, call this tool and pass their confirming words in confirmation_quote. The tool refuses if the quote is not in the guest's latest message. REFUNDS ARE BANK TRANSFERS: when refund_if_cancelled_now is full or partial, you must ALSO collect the guest's bank name, account holder name and Saudi IBAN (SA + 22 characters) BEFORE calling this tool, and pass them in bank_name / beneficiary_name / iban — the tool refuses with bank_details_required otherwise. Ask for all three in one message, then ask for the cancel confirmation.",
    input_schema: {
      type: 'object',
      properties: {
        reference_code: { type: 'string' },
        confirmation_quote: {
          type: 'string',
          description:
            "The guest's own confirming words, copied verbatim from their latest message (e.g. 'نعم ألغِ الحجز' or 'yes cancel it').",
        },
        bank_name: {
          type: 'string',
          description:
            'Bank the refund is wired to (e.g. Al Rajhi, SNB, Alinma). Required when a refund is owed.',
        },
        beneficiary_name: {
          type: 'string',
          description:
            'Account holder name exactly as on the bank account. Required when a refund is owed.',
        },
        iban: {
          type: 'string',
          description:
            'Saudi IBAN, SA + 22 characters; spaces allowed. Required when a refund is owed.',
        },
      },
      required: ['reference_code', 'confirmation_quote'],
      additionalProperties: false,
    },
  },
  {
    name: 'submit_refund_bank_details',
    description:
      'Save (or correct) the bank account for a refund Gharmish still owes this guest — use when booking_detail shows refund_due_sar > 0 and refund_bank_details_on_file is false (a host or the team cancelled, or the guest skipped the form), or when the guest says their IBAN was wrong. Collect bank name, account holder name and Saudi IBAN, read them back to the guest, and call this once they confirm. Refunds are wired manually by the team within a few business days.',
    input_schema: {
      type: 'object',
      properties: {
        reference_code: { type: 'string' },
        bank_name: { type: 'string' },
        beneficiary_name: {
          type: 'string',
          description: 'Account holder name exactly as on the bank account.',
        },
        iban: { type: 'string', description: 'Saudi IBAN, SA + 22 characters; spaces allowed.' },
      },
      required: ['reference_code', 'bank_name', 'beneficiary_name', 'iban'],
      additionalProperties: false,
    },
  },
  {
    name: 'reschedule_booking',
    description:
      "Move one of the guest's bookings to another open date (from available_dates). Same TWO-STEP RULE as cancel_booking: state the old date, the new date and that this uses their one free move, ask, and only call this when the guest's NEXT message confirms, passing their words in confirmation_quote.",
    input_schema: {
      type: 'object',
      properties: {
        reference_code: { type: 'string' },
        new_date: {
          type: 'string',
          description: 'YYYY-MM-DD, one of the dates from available_dates.',
        },
        confirmation_quote: {
          type: 'string',
          description: "The guest's own confirming words, verbatim from their latest message.",
        },
      },
      required: ['reference_code', 'new_date', 'confirmation_quote'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_host_bookings',
    description:
      'HOSTS ONLY (available when the sender is a Gharmish host): their pending booking requests and upcoming confirmed bookings for the next 14 days, with guest first name, party size, date/time, and for requests the decision deadline.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'decide_booking_request',
    description:
      "HOSTS ONLY: approve or decline one of the host's PENDING booking requests. Same TWO-STEP RULE as the guest actions: first show the request (list_host_bookings), state plainly 'approve GH-… for <date>, <n> guests' (or decline) and ask the host to confirm; only when their NEXT message confirms, call this with their words in confirmation_quote. Approving lets the guest pay; declining releases the spots and tells the guest.",
    input_schema: {
      type: 'object',
      properties: {
        reference_code: { type: 'string' },
        decision: { type: 'string', enum: ['approve', 'decline'] },
        confirmation_quote: {
          type: 'string',
          description: "The host's own confirming words, verbatim from their latest message.",
        },
      },
      required: ['reference_code', 'decision', 'confirmation_quote'],
      additionalProperties: false,
    },
  },
  {
    name: 'open_ticket',
    description:
      'Open a ticket for the Gharmish team while you keep helping the guest. Use for anything that needs a human decision or action you cannot perform: refund exceptions, payment problems, complaints about a host, host no-shows, account changes. Returns the ticket reference to give the guest.',
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: TICKET_CATEGORIES },
        priority: { type: 'string', enum: TICKET_PRIORITIES },
        summary: {
          type: 'string',
          description:
            'What happened and what the team should do, in English, with the booking reference when relevant. 1–3 sentences.',
        },
        reference_code: { type: 'string', description: 'Related booking reference code, if any.' },
      },
      required: ['category', 'priority', 'summary'],
      additionalProperties: false,
    },
  },
  {
    name: 'escalate_to_human',
    description:
      'Hand the whole conversation to a Gharmish person and stop answering. Use when: the guest asks for a human, there is a safety incident or emergency, the guest is upset and your answers are not helping, or you are not confident you can help. Opens a ticket. After calling this, your reply must only tell the guest a person will follow up (and give emergency numbers if relevant).',
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: TICKET_CATEGORIES },
        priority: { type: 'string', enum: TICKET_PRIORITIES },
        summary: {
          type: 'string',
          description: 'Why a human is needed, in English. 1–3 sentences.',
        },
        reference_code: { type: 'string', description: 'Related booking reference code, if any.' },
      },
      required: ['category', 'priority', 'summary'],
      additionalProperties: false,
    },
  },
];

function str(input: unknown, key: string): string | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}

/**
 * The guest's confirming words must appear in the message that triggered
 * this turn (whitespace/case-insensitive, Arabic diacritics stripped),
 * and that message must be short enough to be an answer rather than a
 * new request. The model cannot confirm on the guest's behalf.
 */
export function confirmationPresent(quote: string, lastInbound: string): boolean {
  const norm = (v: string) =>
    v
      .normalize('NFKC')
      .replace(/[\u064B-\u0652\u0640]/g, '')
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  const q = norm(quote);
  const m = norm(lastInbound);
  if (!q || q.length < 2 || !m) return false;
  return m.includes(q) && m.length <= 200;
}

function asCategory(value: string | undefined): TicketCategory {
  return TICKET_CATEGORIES.includes(value as TicketCategory) ? (value as TicketCategory) : 'other';
}
function asPriority(value: string | undefined): TicketPriority {
  return TICKET_PRIORITIES.includes(value as TicketPriority) ? (value as TicketPriority) : 'normal';
}

function summarize(b: GuestBookingSummary, locale: 'en' | 'ar') {
  return {
    reference_code: b.referenceCode,
    experience: locale === 'ar' ? b.experienceTitleAr : b.experienceTitleEn,
    date: b.date,
    start_time: b.startTime,
    party_size: b.partySize,
    status: b.status,
    payment_status: b.paymentStatus,
    total_paid_sar: b.totalAmountSar + b.walletAppliedSar,
    booking_page_url: bookingManageUrl(locale, b.reference),
  };
}

/** The optional bank block from a tool input; undefined when none of the three was given. */
function bankInput(
  input: unknown,
): Record<'bankName' | 'beneficiaryName' | 'iban', string> | undefined {
  const bankName = str(input, 'bank_name') ?? '';
  const beneficiaryName = str(input, 'beneficiary_name') ?? '';
  const iban = str(input, 'iban') ?? '';
  if (!bankName && !beneficiaryName && !iban) return undefined;
  return { bankName, beneficiaryName, iban };
}

/** Tool-result shape for a rejected bank block — names the field so the agent can ask precisely. */
function bankInvalid(parsed: {
  success: false;
  error: { issues: { path: PropertyKey[]; message: string }[] };
}) {
  const fields: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string') fields[key] = issue.message;
  }
  return {
    error: 'bank_details_invalid',
    fields,
    note: 'Ask the guest again for the flagged field. iban_invalid = not a valid Saudi IBAN (must start with SA and have 24 characters, checksum must pass) — ask them to copy it from their bank app.',
  };
}

async function findOwnBooking(
  ctx: ToolContext,
  referenceCode: string,
): Promise<GuestBookingSummary | null> {
  if (!ctx.guestId) return null;
  const code = referenceCode.trim().toUpperCase();
  const all = await getBookingsForGuest(ctx.guestId);
  return all.find((b) => b.referenceCode.toUpperCase() === code) ?? null;
}

export async function runTool(
  name: string,
  input: unknown,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  try {
    switch (name) {
      case 'list_my_bookings': {
        if (!ctx.guestId) {
          return {
            result: JSON.stringify({
              bookings: [],
              note: 'This WhatsApp number is not linked to any Gharmish booking. Ask the guest for the booking reference code and the phone number used at booking, then open a ticket so the team can look it up — you cannot look up other numbers.',
            }),
          };
        }
        const rows = await getBookingsForGuest(ctx.guestId);
        return {
          result: JSON.stringify({
            bookings: rows.slice(0, 10).map((b) => summarize(b, ctx.locale)),
          }),
        };
      }
      case 'booking_detail': {
        const code = str(input, 'reference_code') ?? '';
        const booking = await findOwnBooking(ctx, code);
        if (!booking) {
          return {
            result: JSON.stringify({
              error: 'not_found',
              note: 'No booking with that reference belongs to this guest. Do not guess; ask them to check the code on their confirmation.',
            }),
          };
        }
        const options = bookingOptions({
          status: booking.status,
          paymentStatus: booking.paymentStatus,
          dateStr: booking.date,
          startTime: booking.startTime,
          createdAt: new Date(booking.createdAt),
          totalAmountSar: booking.totalAmountSar + booking.walletAppliedSar,
          snapshot: booking.policy,
          rescheduleCount: booking.rescheduleCount,
          rescheduledFromDate: booking.rescheduledFromDate,
          now: ctx.now,
        });
        const [exp] = await db
          .select({
            placeName: experiences.placeName,
            city: experiences.city,
            lat: experiences.lat,
            lng: experiences.lng,
            durationMinutes: experiences.durationMinutes,
            hostName: hosts.name,
          })
          .from(experiences)
          .innerJoin(hosts, eq(hosts.id, experiences.hostId))
          .where(eq(experiences.slug, booking.experienceSlug))
          .limit(1);
        const hostPhone =
          booking.status === 'confirmed' || booking.status === 'completed'
            ? await getHostContactPhoneForBooking(booking.reference)
            : null;
        const cancel = options.cancel.allowed
          ? {
              allowed: true,
              refund_if_cancelled_now: options.cancel.refund,
              refund_amount_sar: options.cancel.amountSar,
              full_refund_until: options.cancel.fullRefundUntil.toISOString(),
              partial_refund_until: options.cancel.partialDeadline?.toISOString() ?? null,
            }
          : { allowed: false, reason: options.cancel.reason };
        const reschedule = options.reschedule.allowed
          ? {
              allowed: true,
              deadline: options.reschedule.deadline.toISOString(),
              remaining_moves: options.reschedule.remainingMoves,
            }
          : { allowed: false, reason: options.reschedule.reason };
        return {
          result: JSON.stringify({
            ...summarize(booking, ctx.locale),
            policy_tier: booking.policy.policyTier,
            meeting_place: exp ? `${exp.placeName}, ${exp.city}` : null,
            map_url: exp ? `https://maps.google.com/?q=${exp.lat},${exp.lng}` : null,
            duration_minutes: exp?.durationMinutes ?? null,
            host_name: exp?.hostName ?? null,
            host_whatsapp_url: hostPhone ? whatsappLink(hostPhone) : null,
            cancel,
            reschedule,
            // Manual bank-transfer refunds: what the team still owes and
            // whether the agent needs to collect a payee for it.
            refund_due_sar: booking.refundDueSar,
            refund_bank_details_on_file: booking.refundBank !== null,
            note: 'You may cancel or reschedule for the guest with cancel_booking / reschedule_booking after they confirm (two-step rule), or send booking_page_url so they do it themselves. Quote refund_amount_sar exactly; never promise more. Refunds are wired by bank transfer by the team: if a cancellation would refund money, collect bank name, account holder name and Saudi IBAN before cancel_booking; if refund_due_sar > 0 and refund_bank_details_on_file is false, collect them and call submit_refund_bank_details.',
          }),
        };
      }
      case 'available_dates': {
        const booking = await findOwnBooking(ctx, str(input, 'reference_code') ?? '');
        if (!booking) return { result: JSON.stringify({ error: 'not_found' }) };
        const from = todayInRiyadh();
        const schedule = await getScheduleDataBySlug(
          booking.experienceSlug,
          from,
          addDays(from, 30),
        );
        if (!schedule) return { result: JSON.stringify({ error: 'unavailable' }) };
        const dates = bookableDates({
          fromStr: from,
          days: 31,
          availabilityWeekdays: schedule.availabilityWeekdays,
          blackoutDates: schedule.blackoutDates,
          stopSellDates: schedule.stopSellDates,
          maxGroupSize: schedule.maxGroupSize,
          bookedByDate: schedule.bookedByDate,
          startTime: schedule.startTime,
          nowMinutes: nowMinutesInRiyadh(),
          cutoffMinutes: schedule.bookingCutoffHours * 60,
        })
          .filter((d) => d.date !== booking.date && d.remaining >= booking.partySize)
          .slice(0, 12)
          .map((d) => d.date);
        return {
          result: JSON.stringify({
            current_date: booking.date,
            party_size: booking.partySize,
            open_dates: dates,
          }),
        };
      }
      case 'cancel_booking':
      case 'reschedule_booking': {
        const booking = await findOwnBooking(ctx, str(input, 'reference_code') ?? '');
        if (!booking) return { result: JSON.stringify({ error: 'not_found' }) };
        const quote = (str(input, 'confirmation_quote') ?? '').trim();
        if (!confirmationPresent(quote, ctx.lastInbound)) {
          return {
            result: JSON.stringify({
              error: 'not_confirmed',
              note: "The confirmation must be in the guest's latest message. State the exact consequence and ask them to confirm; call again after they reply.",
            }),
          };
        }
        const authorize = async (guestId: string) => guestId === ctx.guestId;
        // Bank block: present only when the model collected it. Validated
        // here so the guest gets a precise "that IBAN isn't valid" instead
        // of a generic failure; the core still refuses a refundable cancel
        // that arrives without it (bank_details_required).
        let bankDetails: RefundBankDetailsInput | undefined;
        if (name === 'cancel_booking') {
          const raw = bankInput(input);
          if (raw) {
            const parsedBank = refundBankDetailsSchema.safeParse(raw);
            if (!parsedBank.success) return { result: JSON.stringify(bankInvalid(parsedBank)) };
            bankDetails = parsedBank.data;
          }
        }
        const outcome =
          name === 'cancel_booking'
            ? await cancelBookingCore({
                reference: booking.reference,
                actor: 'agent',
                authorize,
                bankDetails,
              })
            : await rescheduleBookingCore({
                reference: booking.reference,
                newDate: str(input, 'new_date') ?? '',
                actor: 'agent',
                authorize,
              });
        if (!outcome.success && outcome.message === 'bank_details_required') {
          return {
            result: JSON.stringify({
              ...outcome,
              note: 'This cancellation refunds money and refunds are wired by bank transfer. Ask the guest for their bank name, the account holder name and their Saudi IBAN (SA + 22 characters), read them back, then call cancel_booking again with bank_name / beneficiary_name / iban and a fresh confirmation_quote from their next message.',
            }),
          };
        }
        return { result: JSON.stringify(outcome) };
      }
      case 'submit_refund_bank_details': {
        const booking = await findOwnBooking(ctx, str(input, 'reference_code') ?? '');
        if (!booking) return { result: JSON.stringify({ error: 'not_found' }) };
        const parsedBank = refundBankDetailsSchema.safeParse(bankInput(input) ?? {});
        if (!parsedBank.success) return { result: JSON.stringify(bankInvalid(parsedBank)) };
        const saved = await saveRefundBankDetails(booking.id, parsedBank.data);
        return {
          result: JSON.stringify(
            saved
              ? {
                  success: true,
                  refund_due_sar: booking.refundDueSar,
                  note: 'Saved. Tell the guest the team will transfer the refund to this account within a few business days.',
                }
              : {
                  error: 'nothing_owed',
                  note: 'No refund is currently owed on this booking (or it was already transferred), so bank details cannot be saved. If the guest believes money is owed, open_ticket with category refund_exception.',
                },
          ),
        };
      }
      case 'list_host_bookings': {
        if (!ctx.hostId) return { result: JSON.stringify({ error: 'not_a_host' }) };
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(ctx.now);
        const rows = await db
          .select({
            referenceCode: bookings.referenceCode,
            status: bookings.status,
            paymentStatus: bookings.paymentStatus,
            date: bookings.date,
            startTime: bookings.startTime,
            partySize: bookings.partySize,
            approvalDeadline: bookings.approvalDeadline,
            titleEn: experiences.titleEn,
            titleAr: experiences.titleAr,
            guestName: guests.name,
          })
          .from(bookings)
          .innerJoin(experiences, eq(experiences.id, bookings.experienceId))
          .innerJoin(guests, eq(guests.id, bookings.guestId))
          .where(
            and(
              eq(experiences.hostId, ctx.hostId),
              inArray(bookings.status, ['pending', 'confirmed']),
              gte(bookings.date, today),
            ),
          )
          .orderBy(bookings.date, bookings.startTime)
          .limit(20);
        return {
          result: JSON.stringify({
            today,
            bookings: rows.map((r) => ({
              reference_code: r.referenceCode,
              kind: r.status === 'pending' ? 'request_awaiting_your_decision' : 'confirmed',
              experience: ctx.locale === 'ar' ? r.titleAr : r.titleEn,
              date: r.date,
              start_time: r.startTime,
              party_size: r.partySize,
              guest_first_name: r.guestName.split(' ')[0],
              payment_status: r.paymentStatus,
              decide_by: r.approvalDeadline?.toISOString() ?? null,
            })),
          }),
        };
      }
      case 'decide_booking_request': {
        if (!ctx.hostId) return { result: JSON.stringify({ error: 'not_a_host' }) };
        const code = (str(input, 'reference_code') ?? '').trim().toUpperCase();
        const decision = str(input, 'decision');
        if (decision !== 'approve' && decision !== 'decline') {
          return { result: JSON.stringify({ error: 'bad_decision' }) };
        }
        if (
          !confirmationPresent((str(input, 'confirmation_quote') ?? '').trim(), ctx.lastInbound)
        ) {
          return {
            result: JSON.stringify({
              error: 'not_confirmed',
              note: "The confirmation must be in the host's latest message. Ask and call again after they reply.",
            }),
          };
        }
        const [row] = await db
          .select({ id: bookings.id })
          .from(bookings)
          .innerJoin(experiences, eq(experiences.id, bookings.experienceId))
          .where(and(eq(bookings.referenceCode, code), eq(experiences.hostId, ctx.hostId)))
          .limit(1);
        if (!row) return { result: JSON.stringify({ error: 'not_found' }) };
        const outcome = await executeBookingTransition(
          row.id,
          decision === 'approve' ? 'confirmed' : 'declined',
          { kind: 'host', hostId: ctx.hostId },
        );
        return { result: JSON.stringify(outcome) };
      }
      case 'open_ticket':
      case 'escalate_to_human': {
        const code = str(input, 'reference_code');
        const booking = code ? await findOwnBooking(ctx, code) : null;
        const ticket = await openTicket({
          category: asCategory(str(input, 'category')),
          priority: asPriority(str(input, 'priority')),
          summary: str(input, 'summary') ?? '',
          conversationId: ctx.conversationId,
          bookingId: booking?.id ?? null,
          guestId: ctx.guestId,
          openedBy: 'agent',
          detail: { from: ctx.address, booking: booking?.referenceCode },
        });
        if (name === 'escalate_to_human') {
          await db
            .update(conversations)
            .set({ state: 'human', updatedAt: new Date() })
            .where(eq(conversations.id, ctx.conversationId));
        }
        return {
          result: JSON.stringify({
            ticket_reference: ticket.reference,
            priority: ticket.priority,
            team_will_respond_by: ticket.slaDueAt.toISOString(),
            handed_to_human: name === 'escalate_to_human',
          }),
          handedToHuman: name === 'escalate_to_human',
          ticketReference: ticket.reference,
        };
      }
      default:
        return { result: JSON.stringify({ error: `unknown tool ${name}` }) };
    }
  } catch (error) {
    reportError(error, { surface: 'support-agent:tool', tool: name });
    return {
      result: JSON.stringify({
        error: 'tool_failed',
        note: 'Tell the guest you could not check right now and open a ticket.',
      }),
    };
  }
}
