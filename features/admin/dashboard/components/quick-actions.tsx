import { Download, Plus, Settings2 } from 'lucide-react';
import { Link } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

interface QuickActionsProps {
  newExperienceLabel: string;
  exportLabel: string;
  settingsLabel: string;
}

/**
 * Header actions — the operator's primary verbs. "New experience" is the
 * prominent primary (mirrors the mockup's "Add task"); "Export" is a quieter
 * secondary that points at analytics today (a dedicated CSV route is a
 * documented next step). Links styled as buttons keep keyboard + focus
 * semantics intact.
 */
export function QuickActions({
  newExperienceLabel,
  exportLabel,
  settingsLabel,
}: QuickActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href="/admin/experiences/new"
        className={cn(buttonVariants({ variant: 'primary', size: 'sm' }))}
      >
        <Plus aria-hidden />
        {newExperienceLabel}
      </Link>
      <Link
        href="/admin/settings"
        className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}
      >
        <Settings2 aria-hidden />
        {settingsLabel}
      </Link>
      {/* Plain <a>: an API route download, not an app navigation. */}
      <a
        href="/api/admin/export/bookings"
        download
        className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}
      >
        <Download aria-hidden />
        {exportLabel}
      </a>
    </div>
  );
}
