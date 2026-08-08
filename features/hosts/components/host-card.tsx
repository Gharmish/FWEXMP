import { ArrowRight, Languages, Timer } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { VerifiedBadge } from '@/features/hosts/components/verified-badge';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import type { HostInfo } from '@/features/experiences/types';
import type { HostResponseStats } from '@/features/hosts/queries';
import { toArabicText } from '@/features/experiences/lib/arabic-content';
import { pickLocalized } from '@/lib/ar-placeholder';

/**
 * Host card — Avatar (initials fallback), name, verified badge, bio,
 * and a "view profile" link to /hosts/[slug]. Restraint-first: hairline
 * border comes from the section the card sits in, not the card itself.
 */
export interface HostCardProps {
  host: HostInfo;
  locale: Locale;
  /** Real request-handling stats; omitted until the host has a sample. */
  responseStats?: HostResponseStats | null;
}

export async function HostCard({ host, locale, responseStats }: HostCardProps) {
  const t = await getTranslations('host');
  const bio = pickLocalized(locale, host.bioEn, host.bioAr);
  const name = locale === 'ar' ? toArabicText(host.name) : host.name;
  const slug = host.slug;

  const languageNames = new Intl.DisplayNames(locale === 'ar' ? 'ar' : 'en', {
    type: 'language',
  });
  const languagesLabel =
    host.languages.length > 0
      ? new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(
          host.languages.map((code) => languageNames.of(code) ?? code),
        )
      : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <Avatar name={name} src={host.photoUrl ?? undefined} size="lg" />
        {/* `min-w-0`: without it this flex child keeps its default
            `min-width: auto` and can never shrink below the widest chip,
            which pushed the whole detail page into a sideways scroll on a
            320px screen. Lets the chip row actually wrap. */}
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-lg font-medium">{name}</span>
          <div className="flex flex-wrap items-center gap-2">
            {host.verified && (
              <VerifiedBadge hostName={name} locale={locale} verifiedAt={host.verifiedAt} />
            )}
            {languagesLabel && (
              <Badge variant="neutral">
                <Languages aria-hidden />
                {t('speaks', { languages: languagesLabel })}
              </Badge>
            )}
            {responseStats && (
              <Badge variant="neutral">
                <Timer aria-hidden />
                {t('respondsIn', { hours: responseStats.avgResponseHours })}
              </Badge>
            )}
            {responseStats && (
              <Badge variant="neutral">{t('responseRate', { pct: responseStats.ratePct })}</Badge>
            )}
          </div>
        </div>
      </div>
      <p className="text-sarat-black-600 text-base">{bio}</p>
      <Link
        href={`/hosts/${slug}`}
        className="text-sarat-black inline-flex min-h-11 w-fit items-center gap-2 text-sm font-medium transition-opacity duration-200 hover:opacity-60"
      >
        {t('viewProfile')}
        <ArrowRight className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
      </Link>
    </div>
  );
}
