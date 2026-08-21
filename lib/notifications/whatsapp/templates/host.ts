import type { WhatsAppTemplate, WhatsAppVariableSpec } from '../types';

/**
 * Host templates. Hosts are partners: calm, respectful, no alarm. Money
 * is always the host's payout (never the guest's total or our take),
 * labelled "مستحقاتك المتوقعة" until settlement and "مستحقاتك" after.
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
  sample: { ar: 'ضيف واحد', en: '1 guest' },
};
const payout: WhatsAppVariableSpec = {
  name: 'payout',
  kind: 'text',
  required: true,
  sample: { ar: '221 ر.س.', en: 'SAR 221' },
  description: 'Host payout for this booking (commission already deducted).',
};
const bookingPath: WhatsAppVariableSpec = {
  name: 'bookingPath',
  kind: 'url-suffix',
  required: true,
  sample: { ar: 'ar/host/bookings/GH-7K3M9X', en: 'en/host/bookings/GH-7K3M9X' },
};
const earningsPath: WhatsAppVariableSpec = {
  name: 'earningsPath',
  kind: 'url-suffix',
  required: true,
  sample: { ar: 'ar/host/earnings', en: 'en/host/earnings' },
};

const legacyHostBooking = (vars: Record<string, string>) => ({
  '1': vars.experienceName ?? '',
  '2': vars.date ?? '',
  '3': vars.time ?? '',
  '4': vars.guestsNumber ?? '',
  '5': vars.payout ?? '',
  '6': vars.dashboardUrl ?? '',
});

export const HOST_TEMPLATES: readonly WhatsAppTemplate[] = [
  {
    id: 'host_booking_new',
    audience: 'host',
    event: 'BOOKING_HELD',
    category: 'UTILITY',
    description: 'Instant booking placed; guest is completing payment (hold).',
    variables: [experienceName, date, time, guests, payout, bookingPath],
    locales: {
      ar: {
        body: `🎉 لديك حجز جديد

{experienceName}

📅 {date}
🕘 {time}
👤 {guests}

💰 مستحقاتك المتوقعة: {payout}

الضيف يكمل الدفع الآن، وبنأكد لك فور اكتماله.`,
        buttons: [{ type: 'URL', title: 'عرض الحجز', urlVariable: 'bookingPath' }],
      },
      en: {
        body: `🎉 You've got a new booking

{experienceName}

📅 {date}
🕘 {time}
👤 {guests}

💰 Expected payout: {payout}

The guest is completing payment now — we'll confirm as soon as it lands.`,
        buttons: [{ type: 'URL', title: 'View booking', urlVariable: 'bookingPath' }],
      },
    },
    legacy: { key: 'host_new_booking', map: legacyHostBooking },
  },
  {
    id: 'host_booking_confirmed',
    audience: 'host',
    event: 'BOOKING_CONFIRMED',
    category: 'UTILITY',
    description: 'Payment settled — the booking is fully confirmed.',
    variables: [experienceName, date, time, guests, payout, bookingPath],
    locales: {
      ar: {
        body: `✅ تم تأكيد الحجز

{experienceName}

📅 {date}
🕘 {time}
👤 {guests}

💰 مستحقاتك: {payout}

اكتمل الدفع. نتمنى لك ولضيفك تجربة جميلة.`,
        buttons: [{ type: 'URL', title: 'عرض الحجز', urlVariable: 'bookingPath' }],
      },
      en: {
        body: `✅ Booking confirmed

{experienceName}

📅 {date}
🕘 {time}
👤 {guests}

💰 Your payout: {payout}

Payment is complete. Wishing you and your guest a lovely time.`,
        buttons: [{ type: 'URL', title: 'View booking', urlVariable: 'bookingPath' }],
      },
    },
    legacy: {
      key: 'host_payment_received',
      map: (vars) => ({
        '1': vars.experienceName ?? '',
        '2': vars.date ?? '',
        '3': vars.time ?? '',
        '4': vars.payout ?? '',
        '5': vars.dashboardUrl ?? '',
      }),
    },
  },
  {
    id: 'host_booking_request',
    audience: 'host',
    event: 'BOOKING_REQUESTED',
    category: 'UTILITY',
    description: 'Request-to-book awaiting the host decision before the deadline.',
    variables: [
      experienceName,
      date,
      time,
      guests,
      payout,
      {
        name: 'deadline',
        kind: 'text',
        required: true,
        sample: { ar: 'الجمعة، 22 أغسطس، 10:00 صباحًا', en: 'Friday, 22 August, 10:00 AM' },
      },
      bookingPath,
    ],
    locales: {
      ar: {
        body: `🔔 لديك طلب حجز جديد

{experienceName}

📅 {date}
🕘 {time}
👥 {guests}

💰 مستحقاتك المتوقعة: {payout}

الضيف ينتظر تأكيدك الآن. نرجو قبول الطلب أو الاعتذار عنه قبل {deadline}، وشكرًا لسرعة ردك.`,
        buttons: [{ type: 'URL', title: 'مراجعة الطلب', urlVariable: 'bookingPath' }],
      },
      en: {
        body: `🔔 New booking request

{experienceName}

📅 {date}
🕘 {time}
👥 {guests}

💰 Expected payout: {payout}

Your guest is waiting for your answer. Please accept or decline before {deadline} — thank you for replying quickly.`,
        buttons: [{ type: 'URL', title: 'Review request', urlVariable: 'bookingPath' }],
      },
    },
    legacy: { key: 'host_new_request', map: legacyHostBooking },
  },
  {
    id: 'host_booking_cancelled',
    audience: 'host',
    event: 'BOOKING_CANCELLED',
    category: 'UTILITY',
    description: 'A guest (or Gharmish) cancelled; spots are back on the calendar.',
    variables: [experienceName, date, bookingPath],
    locales: {
      ar: {
        body: `تم إلغاء حجز

{experienceName}
📅 {date}

عادت المقاعد إلى تقويمك، ولا يلزمك أي إجراء.
شكرًا لتفهمك 🤍`,
        buttons: [{ type: 'URL', title: 'عرض التفاصيل', urlVariable: 'bookingPath' }],
      },
      en: {
        body: `A booking was cancelled

{experienceName}
📅 {date}

The spots are back on your calendar — nothing is needed from you.
Thank you for understanding 🤍`,
        buttons: [{ type: 'URL', title: 'View details', urlVariable: 'bookingPath' }],
      },
    },
    legacy: {
      key: 'host_guest_cancelled',
      map: (vars) => ({
        '1': vars.experienceName ?? '',
        '2': vars.date ?? '',
        '3': vars.time ?? '',
        '4': vars.dashboardUrl ?? '',
      }),
    },
  },
  {
    id: 'host_booking_rescheduled',
    audience: 'host',
    event: 'BOOKING_RESCHEDULED',
    category: 'UTILITY',
    description: 'Guest moved the booking to a new open date.',
    variables: [experienceName, date, time, bookingPath],
    locales: {
      ar: {
        body: `🔄 تم تحديث موعد حجز

{experienceName}

الموعد الجديد:
📅 {date}
🕘 {time}

عادت المقاعد إلى التاريخ السابق، ولا يلزمك أي إجراء.`,
        buttons: [{ type: 'URL', title: 'عرض الحجز', urlVariable: 'bookingPath' }],
      },
      en: {
        body: `🔄 A booking moved to a new date

{experienceName}

New time:
📅 {date}
🕘 {time}

The previous date has its spots back — nothing is needed from you.`,
        buttons: [{ type: 'URL', title: 'View booking', urlVariable: 'bookingPath' }],
      },
    },
    legacy: {
      key: 'host_booking_rescheduled',
      map: (vars) => ({
        '1': vars.experienceName ?? '',
        '2': vars.date ?? '',
        '3': vars.time ?? '',
        '4': vars.dashboardUrl ?? '',
      }),
    },
  },
  {
    id: 'host_reminder_tomorrow',
    audience: 'host',
    event: 'REMINDER_24H',
    category: 'UTILITY',
    description: '~24h before: who is coming tomorrow.',
    variables: [experienceName, date, time, guests, bookingPath],
    locales: {
      ar: {
        body: `🤍 ضيفك بانتظار تجربة جميلة غدًا

{experienceName}

📅 {date}
🕘 {time}
👥 {guests}

تأكد أن كل شيء جاهز لاستقبالهم.`,
        buttons: [{ type: 'URL', title: 'عرض تفاصيل الحجز', urlVariable: 'bookingPath' }],
      },
      en: {
        body: `🤍 Your guests are looking forward to tomorrow

{experienceName}

📅 {date}
🕘 {time}
👥 {guests}

Make sure everything is ready to welcome them.`,
        buttons: [{ type: 'URL', title: 'View booking', urlVariable: 'bookingPath' }],
      },
    },
  },
  {
    id: 'host_booking_completed',
    audience: 'host',
    event: 'BOOKING_COMPLETED',
    category: 'UTILITY',
    description: 'Experience marked complete; payout now eligible.',
    variables: [experienceName, payout, earningsPath],
    locales: {
      ar: {
        body: `✨ تمت التجربة

شكرًا لاستضافتك لضيوف غارميش في
{experienceName}

💰 مستحقاتك: {payout}
تظهر ضمن دفعتك القادمة.

نتمنى أنهم عاشوا تجربة تستحق الذكر 🤍`,
        buttons: [{ type: 'URL', title: 'عرض مستحقاتك', urlVariable: 'earningsPath' }],
      },
      en: {
        body: `✨ Experience complete

Thank you for hosting Gharmish guests at
{experienceName}

💰 Your payout: {payout}
It will be included in your next transfer.

We hope it was one to remember 🤍`,
        buttons: [{ type: 'URL', title: 'View earnings', urlVariable: 'earningsPath' }],
      },
    },
  },
  {
    id: 'host_payout_sent',
    audience: 'host',
    event: 'PAYOUT_PAID',
    category: 'UTILITY',
    description: 'Bank transfer of a payout batch recorded by Gharmish.',
    variables: [
      {
        name: 'amount',
        kind: 'text',
        required: true,
        sample: { ar: '1,105 ر.س.', en: 'SAR 1,105' },
      },
      {
        name: 'bankHint',
        kind: 'text',
        required: true,
        sample: { ar: 'إلى حسابك المنتهي بـ 4321', en: 'to your account ending 4321' },
        description: 'Masked destination — never a full IBAN.',
      },
      earningsPath,
    ],
    locales: {
      ar: {
        body: `✅ تم تحويل مستحقاتك

المبلغ: {amount}
💳 {bankHint}

قد يستغرق ظهوره في حسابك يومًا إلى يومي عمل حسب البنك.
شكرًا لاستضافتك مع غارميش 🤍`,
        buttons: [{ type: 'URL', title: 'عرض المستحقات', urlVariable: 'earningsPath' }],
      },
      en: {
        body: `✅ Your payout is on its way

Amount: {amount}
💳 {bankHint}

It can take one to two business days to show, depending on your bank.
Thank you for hosting with Gharmish 🤍`,
        buttons: [{ type: 'URL', title: 'View earnings', urlVariable: 'earningsPath' }],
      },
    },
  },
  {
    id: 'host_new_review',
    audience: 'host',
    event: 'REVIEW_CREATED',
    category: 'UTILITY',
    description: 'A guest left a review (text not included — read it in the dashboard).',
    variables: [
      experienceName,
      {
        name: 'reviewsPath',
        kind: 'url-suffix',
        required: true,
        sample: { ar: 'ar/host/reviews', en: 'en/host/reviews' },
      },
    ],
    locales: {
      ar: {
        body: `⭐ وصلك تقييم جديد

شارك أحد ضيوفك رأيه في
{experienceName}

تقدر تقرأه وترد عليه من لوحتك.`,
        buttons: [{ type: 'URL', title: 'عرض التقييم', urlVariable: 'reviewsPath' }],
      },
      en: {
        body: `⭐ You have a new review

One of your guests shared their thoughts on
{experienceName}

Read it and reply from your dashboard.`,
        buttons: [{ type: 'URL', title: 'View review', urlVariable: 'reviewsPath' }],
      },
    },
  },
  {
    id: 'host_experience_approved',
    audience: 'host',
    event: 'EXPERIENCE_APPROVED',
    category: 'UTILITY',
    description: 'Moderation approved the listing; it is now live.',
    variables: [
      experienceName,
      {
        name: 'experiencePath',
        kind: 'url-suffix',
        required: true,
        sample: {
          ar: 'ar/experiences/asiri-coffee-ritual-and-saleeg-lunch',
          en: 'en/experiences/asiri-coffee-ritual-and-saleeg-lunch',
        },
      },
    ],
    locales: {
      ar: {
        body: `🎉 تجربتك أصبحت جاهزة للحجز

تم اعتماد
{experienceName}
وأصبحت ظاهرة لضيوف غارميش.

شاركها مع من تحب، وخلّ جدولك محدثًا ✨`,
        buttons: [{ type: 'URL', title: 'عرض التجربة', urlVariable: 'experiencePath' }],
      },
      en: {
        body: `🎉 Your experience is live

{experienceName}
has been approved and is now visible to Gharmish guests.

Share it with your circle, and keep your calendar up to date ✨`,
        buttons: [{ type: 'URL', title: 'View experience', urlVariable: 'experiencePath' }],
      },
    },
  },
  {
    id: 'host_experience_changes',
    audience: 'host',
    event: 'EXPERIENCE_CHANGES_REQUESTED',
    category: 'UTILITY',
    description: 'Moderation asked for edits (notes live in the dashboard).',
    variables: [
      experienceName,
      {
        name: 'editPath',
        kind: 'url-suffix',
        required: true,
        sample: {
          ar: 'ar/host/experiences/6f1d2c3b-0000-4000-8000-000000000001',
          en: 'en/host/experiences/6f1d2c3b-0000-4000-8000-000000000001',
        },
      },
    ],
    locales: {
      ar: {
        body: `نحتاج تعديلًا بسيطًا على تجربتك

راجع ملاحظات فريق غارميش على
{experienceName}
وأرسل التحديث متى ما أصبح جاهزًا.

نحن هنا لو احتجت أي مساعدة 🤍`,
        buttons: [{ type: 'URL', title: 'عرض الملاحظات', urlVariable: 'editPath' }],
      },
      en: {
        body: `A small change is needed on your experience

Take a look at the Gharmish team's notes on
{experienceName}
and resubmit whenever it's ready.

We're here if you need a hand 🤍`,
        buttons: [{ type: 'URL', title: 'View notes', urlVariable: 'editPath' }],
      },
    },
  },
  {
    id: 'host_application_approved',
    audience: 'host',
    event: 'APPLICATION_APPROVED',
    category: 'UTILITY',
    description: 'Host onboarding approved; start creating experiences.',
    variables: [
      {
        name: 'firstName',
        kind: 'text',
        required: true,
        sample: { ar: 'عبدالعزيز', en: 'Abdulaziz' },
      },
      {
        name: 'newExperiencePath',
        kind: 'url-suffix',
        required: true,
        sample: { ar: 'ar/host/experiences/new', en: 'en/host/experiences/new' },
      },
    ],
    locales: {
      ar: {
        body: `🎉 أهلًا بك كمضيف في غارميش يا {firstName}

تم اعتماد حسابك، وتقدر الآن تبدأ بإضافة تجاربك.

فريقنا معك في كل خطوة، من الصور إلى أول ضيف 🤍`,
        buttons: [{ type: 'URL', title: 'أنشئ تجربتك', urlVariable: 'newExperiencePath' }],
      },
      en: {
        body: `🎉 Welcome to Gharmish, {firstName}

Your host account is approved — you can start adding your experiences now.

Our team is with you every step, from photos to your first guest 🤍`,
        buttons: [{ type: 'URL', title: 'Create an experience', urlVariable: 'newExperiencePath' }],
      },
    },
  },
];
