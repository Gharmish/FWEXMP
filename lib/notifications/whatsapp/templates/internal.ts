import type { WhatsAppTemplate } from '../types';

/**
 * Support-line and internal templates. Support messages go to guests
 * (warm, no promised response times beyond the real SLA); admin alerts
 * go to Gharmish staff and may carry operational detail — but never
 * card data, OTPs, bank details, or secrets (the caller's `detail` is
 * filtered to a single safe summary line).
 */

export const INTERNAL_TEMPLATES: readonly WhatsAppTemplate[] = [
  {
    id: 'support_ticket_update',
    audience: 'support',
    event: 'SUPPORT_FOLLOW_UP',
    category: 'UTILITY',
    description:
      'Team follow-up after the 24h window closed; the guest replies to reopen the conversation. (Approved 2026-08-21 — plain-text legacy body kept as fallback.)',
    variables: [
      {
        name: 'ticketReference',
        kind: 'text',
        required: true,
        sample: { ar: 'TK-7K3M9X', en: 'TK-7K3M9X' },
      },
    ],
    locales: {
      ar: {
        body: `🤍 لديك تحديث من غارميش

بخصوص طلبك رقم {ticketReference}

رُدّ على هذه الرسالة لمتابعة المحادثة مع فريقنا.`,
      },
      en: {
        body: `🤍 An update from Gharmish

About your request {ticketReference}

Reply to this message to continue the conversation with our team.`,
      },
    },
    legacy: {
      key: 'support_ticket_update',
      map: (vars) => ({ '1': vars.ticketReference ?? '' }),
    },
  },
  {
    id: 'support_ticket_resolved',
    audience: 'support',
    event: 'SUPPORT_RESOLVED',
    category: 'UTILITY',
    description: 'Ticket closed by the team when the reply window has already closed.',
    variables: [
      {
        name: 'ticketReference',
        kind: 'text',
        required: true,
        sample: { ar: 'TK-7K3M9X', en: 'TK-7K3M9X' },
      },
    ],
    locales: {
      ar: {
        body: `✅ تم إغلاق طلبك

طلب المساعدة رقم {ticketReference} أصبح محلولًا.

إذا بقي أي شيء، رُدّ هنا ونكمل معك 🤍`,
      },
      en: {
        body: `✅ Your request is resolved

Support request {ticketReference} has been closed.

If anything is still open, reply here and we'll pick it up 🤍`,
      },
    },
  },
  {
    id: 'admin_alert',
    audience: 'admin',
    event: 'ADMIN_ALERT',
    category: 'UTILITY',
    description: 'Operational page to Gharmish staff (ADMIN_ALERT_WHATSAPP). English only.',
    variables: [
      {
        name: 'subject',
        kind: 'text',
        required: true,
        sample: { ar: 'Support ticket opened', en: 'Support ticket opened' },
      },
      {
        name: 'summary',
        kind: 'text',
        required: true,
        sample: {
          ar: 'TK-7K3M9X · urgent · safety_incident',
          en: 'TK-7K3M9X · urgent · safety_incident',
        },
        description: 'One safe line: references, priority, category. No PII, no secrets.',
      },
      {
        name: 'adminPath',
        kind: 'url-suffix',
        required: true,
        sample: { ar: 'en/admin/support', en: 'en/admin/support' },
      },
    ],
    locales: {
      ar: {
        body: `🔔 Gharmish admin

{subject}
Ref: {summary}

Open the admin panel to act on it.`,
        buttons: [{ type: 'URL', title: 'Open admin', urlVariable: 'adminPath' }],
      },
      en: {
        body: `🔔 Gharmish admin

{subject}
Ref: {summary}

Open the admin panel to act on it.`,
        buttons: [{ type: 'URL', title: 'Open admin', urlVariable: 'adminPath' }],
      },
    },
  },
];

/**
 * In-session (free-form) copy the support line sends inside the 24h
 * window — acknowledgement and ticket confirmations. Kept here so ALL
 * WhatsApp wording lives in one place; these are not Meta templates.
 */
export const SUPPORT_SESSION_COPY = {
  ack: {
    ar: `🤍 وصلتنا رسالتك

أحد فريق غارميش بيرد عليك بأقرب وقت.

إذا كان الأمر طارئًا أثناء التجربة، تواصل مع المضيف مباشرة من صفحة حجزك.`,
    en: `🤍 We've received your message

Someone from the Gharmish team will reply shortly.

If it's urgent during an experience, contact your host directly from your booking page.`,
  },
  ticketResolved: {
    ar: (ref: string) => `✅ تم إغلاق طلبك رقم ${ref}

إذا بقي أي شيء، رُدّ هنا ونكمل معك 🤍`,
    en: (ref: string) => `✅ Your request ${ref} is resolved

If anything is still open, reply here and we'll pick it up 🤍`,
  },
  ticketOpened: {
    ar: (ref: string) => `🤍 وصلنا طلبك

فريق غارميش استلم طلب المساعدة رقم ${ref}.
بنرجع لك بأقرب وقت.`,
    en: (ref: string) => `🤍 We've got your request

The Gharmish team has received support request ${ref}.
We'll get back to you soon.`,
  },
} as const;
