'use client';

import { useState, type ReactNode } from 'react';
import { Menu } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n';
import { GharmishLogo } from '@/components/layout/gharmish-logo';
import { Sheet } from '@/components/ui/sheet';
import { AdminNav } from '@/features/admin/dashboard/components/admin-nav';
import { DashboardSearch } from '@/features/admin/dashboard/components/dashboard-search';

interface AdminShellProps {
  children: ReactNode;
  /** The signed-in admin's identifier (phone), shown in the rail footer. */
  userLabel: string;
  /**
   * Session controls (sign-out, language switch) lifted from the public
   * navbar, which the admin layout hides. Rendered in the rail footer so
   * admins keep those affordances. Server-composed and passed in, so the
   * client shell needn't import the server-action button directly.
   */
  actions?: ReactNode;
}

/**
 * The admin application shell: a persistent left rail (logo + grouped nav +
 * signed-in footer) beside a content column with a sticky top bar carrying the
 * global guest search. Structure borrowed from the Modulix mockup; skinned in
 * Gharmish brand — white surfaces, 0.5px hairlines, no shadow on the rail
 * (BRIEF §3). The rail sits on the inline-start side, so it lands on the right
 * automatically in the RTL (Arabic) locale.
 *
 * On `lg` and up the rail is static. Below that it collapses into a drawer
 * toggled from the top bar; an overlay closes it, and following any link does
 * too (`onNavigate`).
 */
export function AdminShell({ children, userLabel, actions }: AdminShellProps) {
  const t = useTranslations('admin');
  const [open, setOpen] = useState(false);

  const railBody = (
    <div className="flex h-full flex-col gap-8 overflow-y-auto p-5">
      <Link
        href="/admin"
        onClick={() => setOpen(false)}
        className="text-sarat-black inline-flex items-center px-3"
        aria-label="Gharmish"
      >
        <GharmishLogo className="h-5 w-auto" />
      </Link>
      <div className="flex-1">
        <AdminNav onNavigate={() => setOpen(false)} />
      </div>
      <div className="border-sarat-black/8 rounded-card flex flex-col gap-3 [border-width:0.5px] p-4">
        <div className="flex flex-col gap-0.5">
          <p className="text-sarat-black-600 text-[11px] tracking-[0.2em] uppercase">
            {t('nav.roleLabel')}
          </p>
          <p className="text-sarat-black truncate text-sm font-medium" dir="ltr">
            {userLabel}
          </p>
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
        title={t('nav.openMenu')}
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
            aria-label={t('nav.openMenu')}
            className="text-sarat-black hover:bg-mist rounded-input -ms-2 inline-flex size-11 items-center justify-center transition-colors duration-200 lg:hidden"
          >
            <Menu className="size-5" aria-hidden />
          </button>
          <Link
            href="/admin"
            className="text-sarat-black me-auto inline-flex items-center lg:hidden"
            aria-label="Gharmish"
          >
            <GharmishLogo className="h-5 w-auto" />
          </Link>
          <div className="ms-auto">
            <DashboardSearch
              placeholder={t('dashboard.search.placeholder')}
              submitLabel={t('dashboard.search.submit')}
            />
          </div>
        </header>

        <main className="flex-1 px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
