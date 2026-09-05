import type { WhatsAppTemplate, WhatsAppVariableSpec } from '../types';

/** Google Maps search prefix; the button variable is `lat,lng`. */
export const MAPS_BASE = 'https://www.google.com/maps/search/?api=1&query=';

/**
 * Guest templates. Tone: warm, Saudi, hospitality-first; what happened →
 * which experience → when → what to do → one button. Bodies never start
 * or end with a variable and keep ≥ (2x+1) plain words per x variables
 * (Meta's approval rule), which is why each carries a short closing
 * line. Buttons replace raw URLs inside Arabic prose.
 */

const experienceName: WhatsAppVariableSpec = {
  name: 'experienceName',
  kind: 'text',
  required: true,
  sample: { ar: 'طقوس القهوة العسيرية وغداء السليق', en: 'Aseeri coffee ritual and saleeg lunch' },
};
const date: WhatsAppVariableSpec = {
  name: 'date',
  kind: 'text',
  required: true,
  sample: { ar: 'الخميس، 27 أغسطس', en: 'Thursday, 27 August' },
};
const time: WhatsAppVariableSpec = {
  name: 'time',
  kind: 'text',
  required: true,
  sample: { ar: '9:00 صباحًا', en: '9:00 AM' },
};
const guests: WhatsAppVariableSpec = {
  name: 'guests',
  kind: 'text',
  required: true,
  sample: { ar: 'ضيفان', en: '2 guests' },
};
const bookingPath: WhatsAppVariableSpec = {
  name: 'bookingPath',
  kind: 'url-suffix',
  required: true,
  sample: { ar: 'ar/book/confirmed/GH-7K3M9X', en: 'en/book/confirmed/GH-7K3M9X' },
  description: 'Guest booking page path (with access token).',
};
const meetingPoint: WhatsAppVariableSpec = {
  name: 'meetingPoint',
  kind: 'text',
  required: true,
  sample: { ar: 'أبها القديمة', en: 'Old Abha' },
  description: 'Short place name; falls back to the city, never blank.',
};

const legacyGuest = (vars: Record<string, string>) => ({
  '1': vars.guestName ?? vars.firstName ?? '',
  '2': vars.experienceName ?? '',
  '3': vars.date ?? '',
  '4': vars.time ?? '',
  '5': vars.reference ?? '',
});

export const GUEST_TEMPLATES: readonly WhatsAppTemplate[] = [
  {
    id: 'guest_booking_confirmed',
    audience: 'guest',
    event: 'BOOKING_CONFIRMED',
    category: 'UTILITY',
    description: 'Payment settled — the booking is confirmed (instant and approved-then-paid).',
    variables: [experienceName, date, time, guests, bookingPath],
    locales: {
      ar: {
        body: `🎉 تم حجز تجربتك

{experienceName}

📅 {date}
🕘 {time}
👥 {guests}

كل شيء جاهز ✨
الإيصال وتفاصيل نقطة اللقاء في صفحة الحجز.`,
        buttons: [{ type: 'URL', title: 'عرض الحجز', urlVariable: 'bookingPath' }],
      },
      en: {
        body: `🎉 Your experience is booked

{experienceName}

📅 {date}
🕘 {time}
👥 {guests}

Everything is set ✨
Your receipt and meeting point are on the booking page.`,
        buttons: [{ type: 'URL', title: 'View booking', urlVariable: 'bookingPath' }],
      },
    },
    legacy: {
      key: 'booking_confirmed',
      map: (vars) => ({
        ...legacyGuest(vars),
        '6': vars.invoiceUrl ?? '',
        '7': vars.amount ?? '',
      }),
    },
  },
  {
    id: 'guest_request_received',
    audience: 'guest',
    event: 'BOOKING_REQUESTED',
    category: 'UTILITY',
    description: 'Request-to-book sent to the host; nothing charged yet.',
    variables: [experienceName, date, time, bookingPath],
    locales: {
      ar: {
        body: `⏳ طلبك وصل للمضيف

{experienceName}

📅 {date}
🕘 {time}

بانتظار تأكيد المضيف، وبنخبرك أول ما يرد.
ما ينخصم منك أي مبلغ قبل التأكيد.`,
        buttons: [{ type: 'URL', title: 'عرض الطلب', urlVariable: 'bookingPath' }],
      },
      en: {
        body: `⏳ Your request is with the host

{experienceName}

📅 {date}
🕘 {time}

We'll let you know the moment they reply.
Nothing is charged until they confirm.`,
        buttons: [{ type: 'URL', title: 'View request', urlVariable: 'bookingPath' }],
      },
    },
    legacy: { key: 'booking_request_received', map: legacyGuest },
  },
  {
    id: 'guest_booking_approved',
    audience: 'guest',
    event: 'BOOKING_APPROVED',
    category: 'UTILITY',
    description: 'Host accepted the request; the guest completes payment from the button.',
    variables: [
      experienceName,
      date,
      time,
      {
        name: 'payDeadline',
        kind: 'text',
        required: true,
        sample: { ar: 'السبت، 22 أغسطس، 2:00 مساءً', en: 'Saturday, 22 August, 2:00 PM' },
      },
      {
        name: 'payPath',
        kind: 'url-suffix',
        required: true,
        sample: { ar: 'ar/book/GH-7K3M9X/pay', en: 'en/book/GH-7K3M9X/pay' },
      },
    ],
    locales: {
      ar: {
        body: `🎉 وافق المضيف على طلبك

{experienceName}

📅 {date}
🕘 {time}

أكمل الدفع قبل {payDeadline} لتثبيت مقعدك.
نشوفك هناك 🤍`,
        buttons: [{ type: 'URL', title: 'إكمال الدفع', urlVariable: 'payPath' }],
      },
      en: {
        body: `🎉 The host said yes

{experienceName}

📅 {date}
🕘 {time}

Complete payment before {payDeadline} to hold your spot.
See you there 🤍`,
        buttons: [{ type: 'URL', title: 'Complete payment', urlVariable: 'payPath' }],
      },
    },
    legacy: {
      key: 'booking_approved',
      map: (vars) => ({ ...legacyGuest(vars), '5': vars.payUrl ?? '' }),
    },
  },
  {
    id: 'guest_booking_declined',
    audience: 'guest',
    event: 'BOOKING_DECLINED',
    category: 'UTILITY',
    description: 'Host could not take the request; nothing charged. Never blames the host.',
    variables: [
      experienceName,
      date,
      {
        name: 'discoverPath',
        kind: 'url-suffix',
        required: true,
        sample: { ar: 'ar/experiences', en: 'en/experiences' },
      },
    ],
    locales: {
      ar: {
        body: `ما قدر المضيف يؤكد هذا الموعد

{experienceName}
📅 {date}

لم يُخصم منك أي مبلغ.
فيه تجارب جميلة ثانية بانتظارك، ونسعد نشوفك فيها 🤍`,
        buttons: [{ type: 'URL', title: 'اكتشف تجارب أخرى', urlVariable: 'discoverPath' }],
      },
      en: {
        body: `The host couldn't make this date work

{experienceName}
📅 {date}

Nothing was charged.
There are other lovely experiences waiting — we'd love to see you at one 🤍`,
        buttons: [{ type: 'URL', title: 'Explore experiences', urlVariable: 'discoverPath' }],
      },
    },
    legacy: { key: 'booking_declined', map: legacyGuest },
  },
  {
    id: 'guest_booking_cancelled',
    audience: 'guest',
    event: 'BOOKING_CANCELLED',
    category: 'UTILITY',
    description: 'Booking cancelled (by guest, host, or Gharmish); refund status as one calm line.',
    variables: [
      experienceName,
      date,
      {
        name: 'refundStatus',
        kind: 'text',
        required: true,
        sample: {
          ar: 'بدأنا استرجاع 260 ر.س. إلى بطاقتك، وقد يظهر خلال بضعة أيام عمل',
          en: "We've started refunding SAR 260 to your card; allow a few business days",
        },
        description: 'One sentence from REFUND_LINES — never free text.',
      },
      bookingPath,
    ],
    locales: {
      ar: {
        body: `تم إلغاء الحجز

{experienceName}
📅 {date}

💳 {refundStatus}.

التفاصيل كاملة في صفحة الحجز. ونسعد نشوفك في تجربة قادمة 🤍`,
        buttons: [{ type: 'URL', title: 'عرض التفاصيل', urlVariable: 'bookingPath' }],
      },
      en: {
        body: `Your booking is cancelled

{experienceName}
📅 {date}

💳 {refundStatus}.

Full details are on your booking page. We hope to see you on another experience 🤍`,
        buttons: [{ type: 'URL', title: 'View details', urlVariable: 'bookingPath' }],
      },
    },
    legacy: {
      key: 'booking_cancelled',
      map: (vars) => ({
        ...legacyGuest(vars),
        '6': vars.refundStatus ?? '',
        '7': vars.ctaUrl ?? '',
      }),
    },
  },
  {
    id: 'guest_booking_rescheduled',
    audience: 'guest',
    event: 'BOOKING_RESCHEDULED',
    category: 'UTILITY',
    description: 'Booking moved to a new date; payment and reference unchanged.',
    variables: [experienceName, date, time, bookingPath],
    locales: {
      ar: {
        body: `🔄 تم تحديث موعد حجزك

{experienceName}

الموعد الجديد:
📅 {date}
🕘 {time}

مبلغك ورقم حجزك كما هما. نشوفك في الموعد الجديد 🤍`,
        buttons: [{ type: 'URL', title: 'عرض الحجز', urlVariable: 'bookingPath' }],
      },
      en: {
        body: `🔄 Your booking has a new date

{experienceName}

New time:
📅 {date}
🕘 {time}

Your payment and reference stay the same. See you on the new date 🤍`,
        buttons: [{ type: 'URL', title: 'View booking', urlVariable: 'bookingPath' }],
      },
    },
    legacy: {
      key: 'booking_rescheduled',
      map: (vars) => ({ ...legacyGuest(vars), '6': vars.bookingUrl ?? '' }),
    },
  },
  {
    id: 'guest_reminder_tomorrow',
    audience: 'guest',
    event: 'REMINDER_24H',
    category: 'UTILITY',
    description: '~24h before start: date, time, meeting point, booking page.',
    variables: [
      {
        name: 'firstName',
        kind: 'text',
        required: true,
        sample: { ar: 'سارة', en: 'Sara' },
      },
      experienceName,
      date,
      time,
      meetingPoint,
      bookingPath,
    ],
    locales: {
      ar: {
        body: `🤍 يا {firstName}، بكرا موعد تجربتك

{experienceName}

📅 {date}
🕘 {time}
📍 {meetingPoint}

الاتجاهات وتفاصيل اللقاء في صفحة الحجز. جاهز تعيشها؟`,
        buttons: [{ type: 'URL', title: 'عرض التفاصيل', urlVariable: 'bookingPath' }],
      },
      en: {
        body: `🤍 {firstName}, your experience is tomorrow

{experienceName}

📅 {date}
🕘 {time}
📍 {meetingPoint}

Directions and meeting details are on your booking page. Ready?`,
        buttons: [{ type: 'URL', title: 'View details', urlVariable: 'bookingPath' }],
      },
    },
    legacy: {
      key: 'booking_reminder_24h',
      map: (vars) => ({
        '1': vars.guestName ?? vars.firstName ?? '',
        '2': vars.experienceName ?? '',
        '3': vars.date ?? '',
        '4': vars.time ?? '',
        '5': vars.meetingPoint ?? '',
        '6': vars.mapUrl ?? vars.bookingUrl ?? '',
      }),
    },
  },
  {
    id: 'guest_reminder_soon',
    audience: 'guest',
    event: 'REMINDER_3H',
    category: 'UTILITY',
    description: '~3h before start: time remaining, meeting point, directions button.',
    variables: [
      {
        name: 'timeRemaining',
        kind: 'text',
        required: true,
        sample: { ar: '3 ساعات', en: '3 hours' },
      },
      experienceName,
      time,
      meetingPoint,
      {
        name: 'mapsQuery',
        kind: 'url-suffix',
        required: true,
        sample: { ar: '18.2164,42.5053', en: '18.2164,42.5053' },
        description: 'lat,lng for the Google Maps button.',
      },
    ],
    locales: {
      ar: {
        body: `✨ موعد تجربتك قرب

باقي {timeRemaining} على
{experienceName}

🕘 {time}
📍 {meetingPoint}

نتمنى لك وقتًا جميلًا وتجربة تستحق الذكر.`,
        buttons: [
          { type: 'URL', title: 'فتح الاتجاهات', urlVariable: 'mapsQuery', urlBase: MAPS_BASE },
        ],
      },
      en: {
        body: `✨ Almost time

{timeRemaining} to go until
{experienceName}

🕘 {time}
📍 {meetingPoint}

Have a wonderful time — we hope it's one to remember.`,
        buttons: [
          { type: 'URL', title: 'Get directions', urlVariable: 'mapsQuery', urlBase: MAPS_BASE },
        ],
      },
    },
    legacy: {
      key: 'booking_reminder_3h',
      map: (vars) => ({
        '1': vars.guestName ?? vars.firstName ?? '',
        '2': vars.meetingPoint ?? '',
        '3': vars.time ?? '',
        '4': vars.mapUrl ?? '',
      }),
    },
  },
  {
    id: 'guest_payment_pending',
    audience: 'guest',
    event: 'PAYMENT_PENDING',
    category: 'UTILITY',
    description: 'Instant booking held; payment not yet completed (sent at hold creation).',
    variables: [
      experienceName,
      {
        name: 'holdDeadline',
        kind: 'text',
        required: true,
        sample: { ar: 'اليوم، 1:53 مساءً', en: 'today, 1:53 PM' },
      },
      {
        name: 'payPath',
        kind: 'url-suffix',
        required: true,
        sample: { ar: 'ar/book/GH-7K3M9X/pay', en: 'en/book/GH-7K3M9X/pay' },
      },
    ],
    locales: {
      ar: {
        body: `⏳ مقعدك محجوز مؤقتًا

{experienceName}

نحتفظ لك بالمقعد حتى {holdDeadline}.
أكمل الدفع ليصبح حجزك مؤكدًا.`,
        buttons: [{ type: 'URL', title: 'إكمال الدفع', urlVariable: 'payPath' }],
      },
      en: {
        body: `⏳ Your spot is on hold

{experienceName}

We're keeping it for you until {holdDeadline}.
Complete payment to confirm your booking.`,
        buttons: [{ type: 'URL', title: 'Complete payment', urlVariable: 'payPath' }],
      },
    },
  },
  {
    id: 'guest_payment_reminder',
    audience: 'guest',
    event: 'PAYMENT_REMINDER',
    category: 'UTILITY',
    description: 'Hold about to lapse (~2h): last nudge to pay.',
    variables: [
      experienceName,
      {
        name: 'holdDeadline',
        kind: 'text',
        required: true,
        sample: { ar: 'اليوم، 1:53 مساءً', en: 'today, 1:53 PM' },
      },
      {
        name: 'payPath',
        kind: 'url-suffix',
        required: true,
        sample: { ar: 'ar/book/GH-7K3M9X/pay', en: 'en/book/GH-7K3M9X/pay' },
      },
    ],
    locales: {
      ar: {
        body: `🔔 مقعدك ينتظرك

{experienceName}

يبقى المقعد محجوزًا لك حتى {holdDeadline} فقط.
أكمل الدفع الآن ولا يفوتك الموعد.`,
        buttons: [{ type: 'URL', title: 'إكمال الدفع', urlVariable: 'payPath' }],
      },
      en: {
        body: `🔔 Your spot is still waiting

{experienceName}

We can only hold it until {holdDeadline}.
Complete payment now so you don't miss it.`,
        buttons: [{ type: 'URL', title: 'Complete payment', urlVariable: 'payPath' }],
      },
    },
  },
  {
    id: 'guest_payment_failed',
    audience: 'guest',
    event: 'PAYMENT_FAILED',
    category: 'UTILITY',
    description: 'Card declined / payment not completed; booking not confirmed; retry.',
    variables: [
      experienceName,
      {
        name: 'payPath',
        kind: 'url-suffix',
        required: true,
        sample: { ar: 'ar/book/GH-7K3M9X/pay', en: 'en/book/GH-7K3M9X/pay' },
      },
    ],
    locales: {
      ar: {
        body: `ما اكتملت عملية الدفع

لا تقلق، لم يُخصم منك شيء ولم يُؤكد الحجز بعد.

يمكنك إعادة المحاولة لإكمال حجز
{experienceName}
وإذا تكررت المشكلة، راسلنا هنا ونساعدك.`,
        buttons: [{ type: 'URL', title: 'إعادة المحاولة', urlVariable: 'payPath' }],
      },
      en: {
        body: `Payment didn't go through

Don't worry — nothing was charged and the booking isn't confirmed yet.

You can try again to complete
{experienceName}
If it keeps happening, reply here and we'll help.`,
        buttons: [{ type: 'URL', title: 'Try again', urlVariable: 'payPath' }],
      },
    },
  },
  {
    id: 'guest_review_invite',
    audience: 'guest',
    event: 'BOOKING_COMPLETED',
    category: 'UTILITY',
    description: 'Day after the experience: invite to rate the host.',
    variables: [
      experienceName,
      {
        name: 'reviewPath',
        kind: 'url-suffix',
        required: true,
        sample: { ar: 'ar/book/confirmed/GH-7K3M9X', en: 'en/book/confirmed/GH-7K3M9X' },
      },
    ],
    locales: {
      ar: {
        body: `✨ كيف كانت تجربتك؟

نتمنى أنك استمتعت بـ
{experienceName} 🤍

رأيك يساعد المضيف ويساعدنا نصنع تجارب أجمل.`,
        buttons: [{ type: 'URL', title: 'قيّم التجربة', urlVariable: 'reviewPath' }],
      },
      en: {
        body: `✨ How was it?

We hope you enjoyed
{experienceName} 🤍

Your review helps the host, and helps us craft better experiences.`,
        buttons: [{ type: 'URL', title: 'Rate your experience', urlVariable: 'reviewPath' }],
      },
    },
  },
  {
    id: 'guest_booking_on_hold',
    audience: 'guest',
    event: 'BOOKING_ON_HOLD',
    category: 'UTILITY',
    description: 'Host account paused by Gharmish; the team is arranging next steps.',
    variables: [experienceName, date, bookingPath],
    locales: {
      ar: {
        body: `🔔 تحديث مهم عن تجربتك

{experienceName}
📅 {date}

نراجع هذا الحجز مع المضيف، وبنتواصل معك خلال وقت قصير بخيار بديل أو استرجاع كامل.
ما تحتاج تسوي شيء الآن.`,
        buttons: [{ type: 'URL', title: 'عرض الحجز', urlVariable: 'bookingPath' }],
      },
      en: {
        body: `🔔 An important update on your experience

{experienceName}
📅 {date}

We're reviewing this booking with the host and will be in touch shortly with an alternative or a full refund.
Nothing is needed from you right now.`,
        buttons: [{ type: 'URL', title: 'View booking', urlVariable: 'bookingPath' }],
      },
    },
  },
];

/**
 * The only sentences allowed in `refundStatus` (plan §22 — refund
 * wording is system-owned, never free text). Amount is pre-formatted.
 */
export const REFUND_LINES = {
  refunded: {
    ar: (amount: string) => `تم استرجاع ${amount} إلى وسيلة الدفع الأصلية`,
    en: (amount: string) => `${amount} has been refunded to your original payment method`,
  },
  refund_pending: {
    ar: (amount: string) => `بدأنا استرجاع ${amount} وقد يظهر في حسابك خلال بضعة أيام عمل`,
    en: (amount: string) =>
      // P2-9: one guest-facing refund window everywhere (was "5–10 business days")
      `We've started refunding ${amount}; allow a few business days for it to appear`,
  },
  // A queued manual refund with NO payee on file — nothing has started
  // and nothing can until the guest adds their bank details (P0-2).
  needs_payee: {
    ar: (amount: string) =>
      `مبلغك المسترد ${amount} جاهز للتحويل — أضف بياناتك البنكية من صفحة حجزك`,
    en: (amount: string) =>
      `Your refund of ${amount} is ready — add your bank details from your booking page`,
  },
  wallet: {
    ar: (amount: string) => `أضفنا ${amount} إلى رصيد غارميش في حسابك`,
    en: (amount: string) => `${amount} has been added to your Gharmish Credit`,
  },
  forfeited: {
    ar: () => 'لا يوجد مبلغ مسترد وفق سياسة الإلغاء لهذا الحجز',
    en: () => "No refund applies under this booking's cancellation policy",
  },
  none: {
    ar: () => 'لم يُخصم منك أي مبلغ',
    en: () => 'Nothing was charged',
  },
} as const;

export type RefundLineKind = keyof typeof REFUND_LINES;
