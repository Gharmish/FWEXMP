'use client';

import { useState } from 'react';
import { Check, Link2, Mail, Share } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Dialog } from '@/components/ui/dialog';
import { buttonVariants } from '@/components/ui/button';
import { trackShare } from '@/lib/funnel-tracking';

/**
 * Brand glyphs (Simple Icons path data, 24×24 viewBox) rendered in
 * currentColor — monochrome per BRIEF §3 restraint; the coloured-mark
 * exception is payment marks only. lucide-react dropped brand icons,
 * and adding an icon dependency is off the table.
 */
const BRAND_GLYPHS: Readonly<Record<'whatsapp' | 'x' | 'telegram', string>> = {
  whatsapp:
    'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z',
  x: 'M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z',
  telegram:
    'M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z',
};

type ShareChannel = 'whatsapp' | 'x' | 'telegram' | 'email';

const CHANNELS: readonly ShareChannel[] = ['whatsapp', 'x', 'telegram', 'email'];

interface ShareButtonProps {
  /** Absolute canonical URL of the page being shared (no query string). */
  url: string;
  /** Localized content title, used in the share message and email subject. */
  title: string;
  /** Picks the dialog heading and the GA content_type. */
  contentType: 'experience' | 'host';
  /** Stable analytics id — the experience/host slug. */
  analyticsId: string;
  /** Overrides the default "Share" label (e.g. "Share this experience" on the ticket). */
  label?: string;
  /**
   * `quiet`: text-link treatment matching the back-link rows on detail
   * pages. `outline`: secondary-button treatment for action rows.
   */
  variant?: 'quiet' | 'outline';
  className?: string;
}

/**
 * Share affordance for public pages. On touch devices with the Web
 * Share API it opens the OS share sheet (which carries WhatsApp,
 * Snapchat, Instagram — everything installed); elsewhere it falls back
 * to a brand dialog with WhatsApp / X / Telegram / Email and copy-link.
 * Channel links carry `utm_source=<channel>&utm_medium=share` so shared
 * visits attribute in the existing UTM→booking capture; the copied link
 * stays clean — people paste it where UTM junk reads as spam.
 */
export function ShareButton({
  url,
  title,
  contentType,
  analyticsId,
  label,
  variant = 'quiet',
  className,
}: ShareButtonProps) {
  const t = useTranslations('share');
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const message = t('message', { title });
  const withUtm = (source: string) =>
    `${url}${url.includes('?') ? '&' : '?'}utm_source=${source}&utm_medium=share`;

  const channelHref = (channel: ShareChannel): string => {
    const link = withUtm(channel);
    switch (channel) {
      case 'whatsapp':
        return `https://wa.me/?text=${encodeURIComponent(`${message}\n${link}`)}`;
      case 'x':
        return `https://x.com/intent/post?text=${encodeURIComponent(message)}&url=${encodeURIComponent(link)}`;
      case 'telegram':
        return `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(message)}`;
      case 'email':
        return `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${message}\n\n${link}`)}`;
    }
  };

  async function handleOpen() {
    // Native share sheet only where it's the better experience: touch
    // devices. Desktop browsers' native sheets are poor, so fine
    // pointers always get the brand dialog.
    if (
      typeof navigator !== 'undefined' &&
      'share' in navigator &&
      window.matchMedia('(pointer: coarse)').matches
    ) {
      try {
        await navigator.share({ title, text: message, url: withUtm('native') });
        trackShare({ id: analyticsId, contentType, method: 'native' });
        return;
      } catch (error) {
        // Dismissed the sheet — not a request to see our dialog instead.
        if (error instanceof DOMException && error.name === 'AbortError') return;
        // Anything else (NotAllowedError, unsupported data): fall through.
      }
    }
    setCopied(false);
    setOpen(true);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      trackShare({ id: analyticsId, contentType, method: 'copy' });
    } catch {
      // Clipboard unavailable (permissions / insecure context) — no-op.
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className={cn(
          variant === 'quiet'
            ? 'text-sarat-black-600 hover:text-sarat-black inline-flex min-h-11 shrink-0 items-center gap-2 text-sm font-medium transition-colors duration-200'
            : cn(buttonVariants({ variant: 'secondary', size: 'md' }), 'print:hidden'),
          className,
        )}
      >
        <Share className="size-4 shrink-0" aria-hidden />
        {label ?? t('button')}
      </button>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={contentType === 'host' ? t('dialogTitleHost') : t('dialogTitleExperience')}
      >
        <div className="grid grid-cols-2 gap-2">
          {CHANNELS.map((channel) => (
            <a
              key={channel}
              href={channelHref(channel)}
              {...(channel === 'email'
                ? {}
                : { target: '_blank', rel: 'noopener noreferrer' })}
              onClick={() => {
                trackShare({ id: analyticsId, contentType, method: channel });
                setOpen(false);
              }}
              className="border-sarat-black/10 hover:bg-mist flex h-12 items-center gap-3 rounded-button [border-width:0.5px] px-4 text-sm font-medium transition-colors duration-200"
            >
              {channel === 'email' ? (
                <Mail className="size-5 shrink-0" strokeWidth={1.5} aria-hidden />
              ) : (
                <svg viewBox="0 0 24 24" fill="currentColor" className="size-5 shrink-0" aria-hidden>
                  <path d={BRAND_GLYPHS[channel]} />
                </svg>
              )}
              {t(channel)}
            </a>
          ))}
          <button
            type="button"
            onClick={copyLink}
            className={cn(
              'border-sarat-black/10 hover:bg-mist col-span-2 flex h-12 items-center gap-3 rounded-button [border-width:0.5px] px-4 text-sm font-medium transition-colors duration-200',
              copied && 'text-success',
            )}
          >
            {copied ? (
              <Check className="size-5 shrink-0" strokeWidth={1.5} aria-hidden />
            ) : (
              <Link2 className="size-5 shrink-0" strokeWidth={1.5} aria-hidden />
            )}
            {copied ? t('copied') : t('copyLabel')}
          </button>
        </div>
      </Dialog>
    </>
  );
}
