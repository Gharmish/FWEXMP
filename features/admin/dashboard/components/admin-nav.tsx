'use client';

import type { ComponentType } from 'react';
import {
  Activity,
  BarChart3,
  CalendarCheck,
  ClipboardCheck,
  Landmark,
  LayoutDashboard,
  Settings,
  Star,
  TriangleAlert,
  UserPlus,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { SPRING } from '@/components/ui/motion';

interface NavItem {
  href: string;
  Icon: ComponentType<{ className?: string }>;
  /** A key under `admin.nav.*` — used when the item has no matching section. */
  labelKey?: string;
  /** A key under `admin.sections.*` — reuses the existing section title. */
  sectionKey?: string;
  /** Highlight only on an exact path match (the dashboard root). */
  exact?: boolean;
}

interface NavGroup {
  /** A key under `admin.nav.groups.*`. */
  headingKey: string;
  items: readonly NavItem[];
}

/**
 * The admin section map, grouped for the sidebar. Borrowed structure from the
 * Modulix dashboard mockup (a persistent left rail), rendered in the Gharmish
 * design language — hairline borders, brand tints, no shadow (BRIEF §3).
 */
const GROUPS: readonly NavGroup[] = [
  {
    headingKey: 'overview',
    items: [
      { href: '/admin', Icon: LayoutDashboard, labelKey: 'dashboard', exact: true },
      { href: '/admin/analytics', Icon: BarChart3, sectionKey: 'analytics' },
      { href: '/admin/activity', Icon: Activity, sectionKey: 'activity' },
    ],
  },
  {
    headingKey: 'operations',
    items: [
      { href: '/admin/bookings', Icon: CalendarCheck, sectionKey: 'bookings' },
      { href: '/admin/host-applications', Icon: UserPlus, sectionKey: 'hostApplications' },
      {
        href: '/admin/experience-moderation',
        Icon: ClipboardCheck,
        sectionKey: 'experienceModeration',
      },
      { href: '/admin/payouts', Icon: Wallet, sectionKey: 'payouts' },
      { href: '/admin/vat', Icon: Landmark, sectionKey: 'vat' },
      { href: '/admin/reviews', Icon: Star, sectionKey: 'reviews' },
      { href: '/admin/disputes', Icon: TriangleAlert, sectionKey: 'disputes' },
    ],
  },
  {
    headingKey: 'directory',
    items: [
      { href: '/admin/hosts', Icon: Users, sectionKey: 'hosts' },
      { href: '/admin/guests', Icon: UserRound, sectionKey: 'guests' },
    ],
  },
  {
    headingKey: 'setting',
    items: [{ href: '/admin/settings', Icon: Settings, sectionKey: 'settings' }],
  },
];

interface AdminNavProps {
  /** Called after a link is followed — lets the mobile drawer close itself. */
  onNavigate?: () => void;
}

/**
 * Grouped sidebar navigation for the admin section. Active state is derived
 * from the locale-stripped pathname (next-intl `usePathname`): the dashboard
 * matches exactly, every other item matches its subtree so detail routes keep
 * their parent highlighted. The active row gets a Saffron Gold inline-start
 * indicator (BRIEF §3 emphasis) over a `mist-deep` fill — no shadow.
 */
export function AdminNav({ onNavigate }: AdminNavProps) {
  const t = useTranslations('admin');
  const pathname = usePathname();

  function isActive(item: NavItem): boolean {
    if (item.exact) return pathname === item.href;
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }

  return (
    <nav aria-label={t('nav.menuLabel')} className="flex flex-col gap-6">
      {GROUPS.map((group) => (
        <div key={group.headingKey} className="flex flex-col gap-1">
          <p className="text-sarat-black-600 px-3 pb-1 text-[11px] tracking-[0.2em] uppercase">
            {t(`nav.groups.${group.headingKey}`)}
          </p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = isActive(item);
              const label = item.labelKey
                ? t(`nav.${item.labelKey}`)
                : t(`sections.${item.sectionKey}.title`);
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
                        layoutId="admin-nav-active"
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
                    <span className="truncate">{label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
