import 'server-only';

import type Anthropic from '@anthropic-ai/sdk';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { conversations, experiences, hosts } from '@/db/schema';
import { reportError } from '@/lib/log';
import { whatsappLink } from '@/lib/whatsapp';
import {
  getBookingsForGuest,
  getHostContactPhoneForBooking,
  type GuestBookingSummary,
} from '@/features/bookings/queries';
import { bookingOptions } from '@/features/bookings/lib/policy';
import { bookingManageUrl } from '@/features/bookings/lib/link-token';
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
  locale: 'en' | 'ar';
  now: Date;
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
        summary: { type: 'string', description: 'Why a human is needed, in English. 1–3 sentences.' },
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
          result: JSON.stringify({ bookings: rows.slice(0, 10).map((b) => summarize(b, ctx.locale)) }),
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
            note: 'Cancellation and reschedule are done by the guest on their booking page (booking_page_url). Quote refund_amount_sar exactly; never promise more.',
          }),
        };
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
    return { result: JSON.stringify({ error: 'tool_failed', note: 'Tell the guest you could not check right now and open a ticket.' }) };
  }
}
