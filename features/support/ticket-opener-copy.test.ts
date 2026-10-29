import { describe, expect, it } from 'vitest';
import en from '@/messages/en.json';
import ar from '@/messages/ar.json';
import { TICKET_OPENERS } from '@/features/support/types';

// The ticket card reads "Opened by {who}"; every opener value needs a
// label in both locales or the raw enum (agent, system…) reaches the page.
describe('support ticket opener labels', () => {
  it.each(TICKET_OPENERS)('labels the %s opener in en and ar', (opener) => {
    expect(en.admin.support.ticket.opener[opener]).toBeTruthy();
    expect(ar.admin.support.ticket.opener[opener]).toBeTruthy();
    expect(ar.admin.support.ticket.opener[opener]).not.toBe(opener);
  });
});
