'use client';

import { useState, type ReactNode } from 'react';
import { ArrowLeft, Menu, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { GharmishLogo } from '@/components/layout/gharmish-logo';
import { Sheet } from '@/components/ui/sheet';
import { HostNav } from '@/features/host-dashboard/components/host-nav';

interface HostShellProps {
  children: ReactNode;
  /** The signed-in host's display name, shown in the rail footer. */
  userLabel: string;
  /** Pending booking requests — surfaced as a chip on the bookings item. */
  pendingRequests: number;
  /**
   * Session controls (sign-out, language switch) lifted from the public
   * navbar, which the host layout hides. Rendered in the rail footer so
   * hosts keep those affordances. Server-composed and passed in, so the
   * client shell needn't import the server-action button directly.
   */
  actions?: ReactNode;
}

/**
 * The host application shell — the sibling of `AdminShell`: a persistent
 * left rail (logo + nav + signed-in footer) beside a content column with a
 * sticky top bar carrying the "new experience" CTA. Skinned in Gharmish
 * brand — white surfaces, 0.5px hairlines, no shadow on the rail (BRIEF §3).
 * The rail sits on the inline-start side, so it lands on the right
 * automatically in the RTL (Arabic) locale.
 *
 * On `lg` and up the rail is static. Below that it collapses into a drawer
 * toggled from the top bar; an overlay closes it, and following any link
 * does too (`onNavigate`).
 */
export function HostShell({ children, userLabel, pendingRequests, actions }: HostShellProps) {
  const t = useTranslations('hostDashboard.nav');
  const [open, setOpen] = useState(false);

  const railBody = (
    <div className="flex h-full flex-col gap-8 overflow-y-auto p-5">
      <Link
        href="/host"
        onClick={() => setOpen(false)}
        className="text-sarat-black inline-flex items-center px-3"
        aria-label="Gharmish"
      >
        <GharmishLogo className="h-5 w-auto" />
      </Link>
      <div className="flex-1">
        <HostNav pendingRequests={pendingRequests} onNavigate={() => setOpen(false)} />
      </div>
      {/* Way out of the dashboard — without this, sign-out is the only
          exit back to the public site. */}
      <Link
        href="/"
        onClick={() => setOpen(false)}
        className="text-sarat-black-600 hover:bg-mist hover:text-sarat-black rounded-input flex items-center gap-3 px-3 py-2.5 text-sm transition-colors duration-200"
      >
        <ArrowLeft className="size-5 shrink-0 rtl:rotate-180" aria-hidden />
        <span className="truncate">{t('backToSite')}</span>
      </Link>
      <div className="border-sarat-black/8 rounded-card flex flex-col gap-3 [border-width:0.5px] p-4">
        <div className="flex flex-col gap-0.5">
          <p className="text-sarat-black-600 text-[11px] tracking-[0.2em] uppercase">
            {t('roleLabel')}
          </p>
          <p className="text-sarat-black truncate text-sm font-medium">{userLabel}</p>
        </div>
        {actions && (
          <div className="border-sarat-black/8 flex items-center justify-between gap-2 [border-block-start-width:0.5px] pt-3">
            {actions}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-dvh w-full">
      {/* Static rail (lg+) */}
      <aside className="border-sarat-black/8 sticky top-0 hidden h-dvh w-64 shrink-0 border-e [border-inline-end-width:0.5px] bg-white lg:block">
        {railBody}
      </aside>

      {/* Mobile drawer — springs in from the inline-start edge (flips in
          RTL); Base UI supplies focus trap, Esc, and the overlay. */}
      <Sheet
        open={open}
        onOpenChange={setOpen}
        side="start"
        title={t('openMenu')}
        hideTitle
        className="w-72 max-w-[85%] lg:hidden"
        contentClassName="h-full p-0"
      >
        {railBody}
      </Sheet>

      {/* Content column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-sarat-black/8 sticky top-0 z-30 flex items-center gap-3 [border-block-end-width:0.5px] border-b bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={t('openMenu')}
            className="text-sarat-black hover:bg-mist rounded-input -ms-2 inline-flex size-11 items-center justify-center transition-colors duration-200 lg:hidden"
          >
            <Menu className="size-5" aria-hidden />
          </button>
          <Link
            href="/host"
            className="text-sarat-black me-auto inline-flex items-center lg:hidden"
            aria-label="Gharmish"
          >
            <GharmishLogo className="h-5 w-auto" />
          </Link>
          <Link
            href="/host/experiences/new"
            className={cn(
              buttonVariants({ variant: 'primary', size: 'sm' }),
              'ms-auto inline-flex items-center gap-2',
            )}
          >
            <Plus className="size-4 shrink-0" aria-hidden />
            {t('newExperience')}
          </Link>
        </header>

        <main className="flex-1 px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
