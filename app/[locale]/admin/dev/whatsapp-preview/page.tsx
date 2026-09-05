import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { cn } from '@/lib/utils';
import { adminGuard } from '@/features/admin/guard';
import { WHATSAPP_TEMPLATES, renderWhatsApp } from '@/lib/notifications/whatsapp';
import { SUPPORT_SESSION_COPY } from '@/lib/notifications/whatsapp/templates/internal';

export const metadata: Metadata = {
  title: 'WhatsApp preview',
  robots: { index: false, follow: false },
};

/**
 * Developer/admin preview of every WhatsApp template in both languages,
 * rendered with its own Meta samples — what the recipient will read,
 * the button, and the length. Admin-gated (TOTP) and noindex; exists so
 * copy can be reviewed without sending a message.
 */
export default async function WhatsAppPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ audience?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (await adminGuard()) notFound();
  const { audience } = await searchParams;

  const templates = WHATSAPP_TEMPLATES.filter((t) => !audience || t.audience === audience);
  const audiences = ['guest', 'host', 'support', 'admin'] as const;

  return (
    <div className="flex flex-col gap-12">
      <div className="flex flex-col gap-3">
        <p className="text-sarat-black-600 text-[11px] font-medium tracking-[0.2em] uppercase">
          Developer
        </p>
        <h1 className="font-display text-4xl font-semibold tracking-[-0.035em]">
          WhatsApp templates
        </h1>
        <p className="text-sarat-black-600 max-w-2xl text-base leading-relaxed">
          Every template in <span className="font-mono text-sm">lib/notifications/whatsapp</span>,
          rendered with its Meta review samples. Arabic on the left, English on the right.
        </p>
        <nav className="flex flex-wrap gap-2 text-sm">
          <a
            href="?"
            className={cn(
              'rounded-button border-sarat-black/20 [border-width:0.5px] px-3 py-1',
              !audience && 'bg-sarat-black text-white',
            )}
          >
            All ({WHATSAPP_TEMPLATES.length})
          </a>
          {audiences.map((a) => (
            <a
              key={a}
              href={`?audience=${a}`}
              className={cn(
                'rounded-button border-sarat-black/20 [border-width:0.5px] px-3 py-1',
                audience === a && 'bg-sarat-black text-white',
              )}
            >
              {a} ({WHATSAPP_TEMPLATES.filter((t) => t.audience === a).length})
            </a>
          ))}
        </nav>
      </div>

      <ul className="flex flex-col gap-8">
        {templates.map((template) => (
          <li
            key={template.id}
            className="border-sarat-black/8 rounded-card flex flex-col gap-4 [border-width:0.5px] p-6"
          >
            <div className="flex flex-wrap items-baseline gap-3">
              <h2 className="font-mono text-base">{template.id}</h2>
              <span className="text-sarat-black-600 text-sm">
                {template.audience} · {template.event} · {template.category}
                {template.legacy ? ` · fallback: ${template.legacy.key}` : ''}
              </span>
            </div>
            <p className="text-sarat-black-600 text-sm">{template.description}</p>
            <div className="grid gap-4 md:grid-cols-2">
              {(['ar', 'en'] as const).map((loc) => {
                const vars = Object.fromEntries(
                  template.variables.map((v) => [v.name, v.sample[loc]]),
                );
                const out = renderWhatsApp(template.id, loc, vars);
                return (
                  <div key={loc} className="flex flex-col gap-2">
                    <p className="text-sarat-black-600 text-[11px] font-medium tracking-[0.2em] uppercase">
                      {loc === 'ar' ? 'Arabic' : 'English'}
                      {out.ok ? ` · ${out.message.preview.length} chars` : ' · render error'}
                    </p>
                    <div
                      dir={loc === 'ar' ? 'rtl' : 'ltr'}
                      className="bg-mist rounded-[20px] px-4 py-3 text-[15px] leading-relaxed whitespace-pre-line"
                    >
                      {out.ok ? out.message.preview : out.error}
                    </div>
                    {out.ok &&
                      out.message.buttons.map((b) => (
                        <div
                          key={b.title}
                          className="border-sarat-black/10 text-sarawat-blue rounded-[20px] [border-width:0.5px] py-2 text-center text-[15px] font-medium"
                          title={b.url}
                        >
                          {b.title}
                        </div>
                      ))}
                  </div>
                );
              })}
            </div>
            <details className="text-sm">
              <summary className="text-sarat-black-600 cursor-pointer">Variables</summary>
              <ul className="mt-2 flex flex-col gap-1 font-mono text-[12px]">
                {template.variables.map((v, i) => (
                  <li key={v.name}>
                    {`{{${i + 1}}}`} {v.name} · {v.kind}
                    {v.required ? '' : ' · optional'}
                    {v.description ? ` — ${v.description}` : ''}
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ul>

      <section className="border-sarat-black/8 rounded-card flex flex-col gap-4 [border-width:0.5px] p-6">
        <h2 className="font-mono text-base">support · in-session copy (free-form, no approval)</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {(['ar', 'en'] as const).map((loc) => (
            <div key={loc} className="flex flex-col gap-3">
              <div
                dir={loc === 'ar' ? 'rtl' : 'ltr'}
                className="bg-mist rounded-[20px] px-4 py-3 text-[15px] whitespace-pre-line"
              >
                {SUPPORT_SESSION_COPY.ack[loc]}
              </div>
              <div
                dir={loc === 'ar' ? 'rtl' : 'ltr'}
                className="bg-mist rounded-[20px] px-4 py-3 text-[15px] whitespace-pre-line"
              >
                {SUPPORT_SESSION_COPY.ticketOpened[loc]('TK-7K3M9X')}
              </div>
              <div
                dir={loc === 'ar' ? 'rtl' : 'ltr'}
                className="bg-mist rounded-[20px] px-4 py-3 text-[15px] whitespace-pre-line"
              >
                {SUPPORT_SESSION_COPY.ticketResolved[loc]('TK-7K3M9X')}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
