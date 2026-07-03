'use client';

import { useState, useSyncExternalStore } from 'react';
import { Check, Copy, Share2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

interface HostShareCardProps {
  /** Absolute, locale-prefixed profile URL, e.g. https://gharmish.com/en/hosts/the-flower-men. */
  url: string;
  /** Pre-composed share message (already localized), e.g. "Discover my experiences on Gharmish". */
  shareText: string;
}

/**
 * "Share your profile" card for the host dashboard. Gives a host three ways to
 * push traffic to their public link: copy it, send it on WhatsApp (the default
 * share channel in KSA), or open the device share sheet. The native share
 * button is feature-detected after mount to avoid a hydration mismatch and to
 * stay out of the way on desktop browsers that don't support it.
 */
export function HostShareCard({ url, shareText }: HostShareCardProps) {
  const t = useTranslations('hostDashboard.share');
  const [copied, setCopied] = useState(false);

  // Feature-detect the Web Share API as a client-only value. useSyncExternalStore
  // keeps SSR (false) and the first client render in sync — the native button
  // appears only after hydration, where it's actually usable — without a
  // setState-in-effect cascade.
  const canNativeShare = useSyncExternalStore(
    () => () => {},
    () => typeof navigator !== 'undefined' && typeof navigator.share === 'function',
    () => false,
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (permissions / insecure context) — no-op.
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({ title: shareText, text: shareText, url });
    } catch {
      // User dismissed the sheet, or share failed — no-op.
    }
  }

  // wa.me deep link: the message plus the URL on its own line.
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(`${shareText}\n${url}`)}`;
  // The link is shown without its scheme — cleaner, and it's the part a host
  // recognises. The full URL is what lands on the clipboard.
  const displayUrl = url.replace(/^https?:\/\//, '');

  return (
    <div className="border-sarat-black/8 rounded-card flex flex-col gap-4 [border-width:0.5px] p-5">
      <div className="flex flex-col gap-1">
        <p className="text-base font-medium">{t('title')}</p>
        <p className="text-sarat-black-600 text-sm leading-relaxed">{t('description')}</p>
      </div>

      <div className="bg-mist rounded-input flex items-center justify-between gap-3 px-4 py-3">
        <span className="text-sarat-black truncate text-sm" dir="ltr">
          {displayUrl}
        </span>
        <button
          type="button"
          onClick={copy}
          aria-label={t('copy')}
          className={cn(
            'text-sarat-black-600 hover:text-sarat-black inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors duration-200',
            copied && 'text-success',
          )}
        >
          {copied ? (
            <Check className="size-4 shrink-0" aria-hidden />
          ) : (
            <Copy className="size-4 shrink-0" aria-hidden />
          )}
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={copy}
          className={cn(buttonVariants({ variant: 'primary', size: 'md' }))}
        >
          {copied ? t('copied') : t('copy')}
        </button>
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: 'secondary', size: 'md' }))}
        >
          {t('whatsapp')}
        </a>
        {canNativeShare && (
          <button
            type="button"
            onClick={nativeShare}
            className={cn(
              buttonVariants({ variant: 'secondary', size: 'md' }),
              'inline-flex items-center gap-2',
            )}
          >
            <Share2 className="size-4 shrink-0" aria-hidden />
            {t('more')}
          </button>
        )}
      </div>
    </div>
  );
}
