import { getTranslations } from 'next-intl/server';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import type { Locale } from '@/lib/i18n';
import type { HostInfo } from '@/features/experiences/types';

/**
 * Host card — Avatar (initials fallback), name, verified badge, bio.
 * Restraint-first: hairline-bordered surface via the section it sits in.
 */
export interface HostCardProps {
  host: HostInfo;
  locale: Locale;
}

export async function HostCard({ host, locale }: HostCardProps) {
  const t = await getTranslations('host');
  const bio = locale === 'ar' ? host.bioAr : host.bioEn;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <Avatar name={host.name} size="lg" />
        <div className="flex flex-col gap-1">
          <span className="text-lg font-medium">{host.name}</span>
          {host.verified && <Badge variant="verified">{t('verified')}</Badge>}
        </div>
      </div>
      <p className="text-sarat-black-600 text-base">{bio}</p>
    </div>
  );
}
