import type { NextRequest } from 'next/server';
import { addSuppression } from '@/lib/notifications/ledger';
import { unsubscribeTokenValid } from '@/lib/marketing/unsubscribe-token';

/**
 * One-tap marketing unsubscribe (2026-08-15 marketing audit). Writes a
 * MARKETING-scope suppression — transactional messages (receipts,
 * reminders, cancellations) keep delivering; only campaigns stop. The
 * signed token limits the endpoint to links we minted, so it can't be
 * used to suppress arbitrary addresses.
 *
 * GET on purpose: this URL is tapped from an email client, and a plain
 * link must complete the action without a form hop. The response is a
 * minimal self-contained page in the guest's language.
 */
export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get('e') ?? '';
  const token = request.nextUrl.searchParams.get('t');
  const locale = request.nextUrl.searchParams.get('l') === 'ar' ? 'ar' : 'en';

  const valid = email.length > 0 && unsubscribeTokenValid(email, token);
  if (valid) await addSuppression('email', email, 'manual', 'marketing');

  const copy =
    locale === 'ar'
      ? {
          dir: 'rtl',
          title: valid ? 'تم إلغاء الاشتراك' : 'رابط غير صالح',
          body: valid
            ? 'لن تصلك رسائل تسويقية من غارميش بعد الآن. رسائل حجوزاتك (الإيصالات والتذكيرات) تصلك كالمعتاد.'
            : 'تعذّر التحقق من هذا الرابط. افتح الرابط من رسالتنا مباشرة، أو راسلنا على hello@gharmish.com.',
        }
      : {
          dir: 'ltr',
          title: valid ? 'You are unsubscribed' : 'Invalid link',
          body: valid
            ? 'You will no longer receive marketing messages from Gharmish. Booking messages (receipts and reminders) still deliver as usual.'
            : 'This link could not be verified. Open it directly from our email, or write to hello@gharmish.com.',
        };

  const html = `<!doctype html><html lang="${locale}" dir="${copy.dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${copy.title}</title></head><body style="margin:0;background:#fff;color:#1a1812;font-family:system-ui,sans-serif;display:grid;min-height:100vh;place-items:center;padding:24px"><main style="max-width:28rem;text-align:center"><h1 style="font-size:1.25rem;margin:0 0 .75rem">${copy.title}</h1><p style="font-size:.95rem;line-height:1.6;color:#5c584c;margin:0">${copy.body}</p></main></body></html>`;
  return new Response(html, {
    status: valid ? 200 : 400,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
