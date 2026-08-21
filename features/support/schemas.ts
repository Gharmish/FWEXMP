import { z } from 'zod';

export const replySchema = z.object({
  conversationId: z.string().uuid(),
  body: z.string().trim().min(1).max(4096),
});

export const stateSchema = z.object({
  conversationId: z.string().uuid(),
  state: z.enum(['human', 'closed']),
});
