import { getTranslations } from 'next-intl/server';
import { Avatar } from '@/components/ui/avatar';
import { VerifiedSeal } from '@/components/ui/verified-seal';
import type { Locale } from '@/lib/i18n';
import type { HostInfo } from '@/features/experiences/types';
import { toArabicText } from '@/features/experiences/lib/arabic-content';
import { hostLanguagesLabel } from '@/features/hosts/lib/languages';

/**
 * One-line host introduction for the listing header: portrait, "Hosted by
 * {name}", the verified micro-seal, and the languages spoken. The host is
 * the way into an experience (brand hierarchy: guest → host → place), so
 * the face sits on the first screen; the whole row jumps to the full host
 * section further down the page.
 */
export interface HostBylineProps {
  host: HostInfo;
  locale: Locale;
  /** In-page anchor of the full host section (e.g. `#host`). */
  href: string;
}

export async function HostByline({ host, locale, href }: HostBylineProps) {
  const [t, tv] = await Promise.all([getTranslations('host'), getTranslations('verifiedBadge')]);
  const name = locale === 'ar' ? toArabicText(host.name) : host.name;
  const languagesLabel = hostLanguagesLabel(host.languages, locale);

  return (
    <a
      href={href}
      className="border-sarat-black/12 flex min-h-11 items-center gap-3 border-t pt-4 transition-opacity duration-200 hover:opacity-60"
    >
      {/* Decorative here: the text beside it already names the host. */}
      <Avatar name={name} src={host.photoUrl ?? undefined} size="md" aria-hidden />
      <span className="flex min-w-0 flex-col">
        <span className="flex items-center gap-2 font-medium">
          <span className="truncate">{t('hostedByName', { name })}</span>
          {/* Micro-seal, not the tappable lockup: this row is one link, so
              a nested button would be invalid — the host section below
              carries the full verified sheet. */}
          {host.verified && <VerifiedSeal className="size-4" label={tv('lockup')} />}
        </span>
        {languagesLabel && (
          <span className="text-sarat-black-600 text-sm">
            {t('speaks', { languages: languagesLabel })}
          </span>
        )}
      </span>
    </a>
  );
}
