import { ArrowRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import type { HostInfo } from '@/features/experiences/types';
import { toArabicText } from '@/features/experiences/lib/arabic-content';

/**
 * Host card — Avatar (initials fallback), name, verified badge, bio,
 * and a "view profile" link to /hosts/[slug]. Restraint-first: hairline
 * border comes from the section the card sits in, not the card itself.
 */
export interface HostCardProps {
  host: HostInfo;
  locale: Locale;
}

export async function HostCard({ host, locale }: HostCardProps) {
  const t = await getTranslations('host');
  const bio = locale === 'ar' ? host.bioAr : host.bioEn;
  const name = locale === 'ar' ? toArabicText(host.name) : host.name;
  const slug = host.slug;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <Avatar name={name} src={host.photoUrl ?? undefined} size="lg" />
        <div className="flex flex-col gap-1">
          <span className="text-lg font-medium">{name}</span>
          {host.verified && <Badge variant="verified">{t('verified')}</Badge>}
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
