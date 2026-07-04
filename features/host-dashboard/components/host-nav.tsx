'use client';

import type { ComponentType } from 'react';
import { Banknote, CalendarCheck, LayoutDashboard, Map, Star, UserRound } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { SPRING } from '@/components/ui/motion';

interface NavItem {
  href: string;
  Icon: ComponentType<{ className?: string }>;
  /** A key under `hostDashboard.nav.*`. */
  labelKey: string;
  /** Highlight only on an exact path match (the overview root). */
  exact?: boolean;
  /** Show the pending-requests count chip on this item. */
  showPending?: boolean;
}

const ITEMS: readonly NavItem[] = [
  { href: '/host', Icon: LayoutDashboard, labelKey: 'overview', exact: true },
  { href: '/host/bookings', Icon: CalendarCheck, labelKey: 'bookings', showPending: true },
  { href: '/host/experiences', Icon: Map, labelKey: 'experiences' },
  { href: '/host/earnings', Icon: Banknote, labelKey: 'earnings' },
  { href: '/host/reviews', Icon: Star, labelKey: 'reviews' },
  { href: '/host/profile', Icon: UserRound, labelKey: 'profile' },
];

interface HostNavProps {
  /** Pending booking requests — rendered as a chip on the bookings item. */
  pendingRequests: number;
  /** Called after a link is followed — lets the mobile drawer close itself. */
  onNavigate?: () => void;
}

/**
 * Sidebar navigation for the host section — the sibling of `AdminNav`,
 * flat (five destinations need no groups) and carrying the pending-requests
 * chip so an open request is visible from every host page. Active state is
 * derived from the locale-stripped pathname; the overview matches exactly,
 * every other item matches its subtree so detail routes keep their parent
 * highlighted.
 */
export function HostNav({ pendingRequests, onNavigate }: HostNavProps) {
  const t = useTranslations('hostDashboard.nav');
  const pathname = usePathname();

  function isActive(item: NavItem): boolean {
    if (item.exact) return pathname === item.href;
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }

  return (
    <nav aria-label={t('menuLabel')}>
      <ul className="flex flex-col gap-0.5">
        {ITEMS.map((item) => {
          const active = isActive(item);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-input group relative flex items-center gap-3 px-3 py-2.5 text-sm transition-colors duration-200',
                  active
                    ? 'bg-mist-deep text-sarat-black font-medium'
                    : 'text-sarat-black-600 hover:bg-mist hover:text-sarat-black',
                )}
              >
                {active && (
                  // Shared layoutId: the saffron indicator glides between
                  // rows on the one spring instead of teleporting.
                  <motion.span
                    aria-hidden
                    layoutId="host-nav-active"
                    transition={SPRING}
                    className="bg-saffron-gold absolute inset-y-2 start-0 w-0.5 rounded-full"
                  />
                )}
                <item.Icon
                  className={cn(
                    'size-5 shrink-0',
                    active ? 'text-sarat-black' : 'text-sarat-black-600',
                  )}
                />
                <span className="truncate">{t(item.labelKey)}</span>
                {item.showPending && pendingRequests > 0 && (
                  <span
                    className="bg-saffron-gold/20 text-sarat-black ms-auto inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-medium tabular-nums"
                    aria-label={t('pendingBadge', { count: pendingRequests })}
                  >
                    {pendingRequests}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
