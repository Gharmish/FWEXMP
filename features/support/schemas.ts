import { z } from 'zod';

export const replySchema = z.object({
  conversationId: z.uuid(),
  body: z.string().trim().min(1).max(4096),
});

export const stateSchema = z.object({
  conversationId: z.uuid(),
  state: z.enum(['bot', 'human', 'closed']),
});

export const resolveTicketSchema = z.object({
  ticketId: z.uuid(),
  resolutionNote: z.string().trim().max(2000).optional(),
});

export const nudgeSchema = z.object({ conversationId: z.uuid() });
