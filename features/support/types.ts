import type { Locale } from '@/lib/i18n';

export type ConversationState = 'bot' | 'human' | 'closed';

export interface AdminConversationRow {
  id: string;
  address: string;
  locale: Locale;
  state: ConversationState;
  profileName: string | null;
  guestId: string | null;
  guestName: string | null;
  /** User-360 key when the guest is known. */
  guestPersonKey: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  /** The guest wrote after our last reply — needs a human. */
  awaitingReply: boolean;
  /** Free-form replies are allowed while inside Meta's 24h window. */
  windowOpen: boolean;
  lastMessagePreview: string;
  createdAt: string;
}

export interface ConversationMessageRow {
  id: string;
  direction: 'in' | 'out';
  author: 'guest' | 'agent' | 'admin' | 'system';
  body: string;
  mediaUrl: string | null;
  mediaContentType: string | null;
  deliveryStatus: string | null;
  createdAt: string;
}

export interface ConversationThread {
  conversation: AdminConversationRow;
  messages: readonly ConversationMessageRow[];
}
