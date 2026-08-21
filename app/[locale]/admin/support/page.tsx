import type { Metadata } from 'next';
import { ArrowLeft, MessageCircle } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate } from '@/lib/format';
import {
  CONVERSATIONS_LIST_LIMIT,
  listConversationsForAdmin,
  listOpenTicketsForAdmin,
} from '@/features/support/queries';
import type { AdminConversationRow } from '@/features/support/types';
import { TicketCard, type TicketCardCopy } from '@/app/[locale]/admin/support/ticket-card';

const DATE_TIME: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admin.meta' });
  return { title: t('supportTitle'), robots: { index: false, follow: false } };
}

export default async function AdminSupportPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;

  const [t, rows, tickets] = await Promise.all([
    getTranslations('admin'),
    listConversationsForAdmin(),
    listOpenTicketsForAdmin(),
  ]);
  const ticketCopy: TicketCardCopy = {
    due: (date) => t('support.ticket.due', { date }),
    overdue: t('support.ticket.overdue'),
    escalated: t('support.ticket.escalated'),
    openedBy: (who) => t('support.ticket.openedBy', { who }),
    openThread: t('support.ticket.openThread'),
    booking: (reference) => t('support.ticket.booking', { reference }),
    priority: {
      urgent: t('support.ticket.priority.urgent'),
      high: t('support.ticket.priority.high'),
      normal: t('support.ticket.priority.normal'),
    },
    status: {
      open: t('support.ticket.status.open'),
      waiting_guest: t('support.ticket.status.waiting_guest'),
      waiting_admin: t('support.ticket.status.waiting_admin'),
      resolved: t('support.ticket.status.resolved'),
    },
    category: (key) => t.has(`support.ticket.category.${key}`) ? t(`support.ticket.category.${key}`) : key,
  };
  const awaiting = (rows ?? []).filter((r) => r.awaitingReply);
  const others = (rows ?? []).filter((r) => !r.awaitingReply);

  const eyebrowClassName = cn(
    'text-sarat-black-600 font-medium text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  const renderRow = (row: AdminConversationRow) => (
    <li key={row.id}>
      <Link
        href={`/admin/support/${row.id}`}
        className="border-sarat-black/8 rounded-card hover:bg-mist flex flex-col gap-2 [border-width:0.5px] p-6 transition-colors duration-200"
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sarat-black text-base font-medium">
            {row.guestName ?? row.profileName ?? t('support.unknownSender')}
          </span>
          <span className="text-sarat-black-600 font-mono text-[13px]" dir="ltr">
            {row.address}
          </span>
          {row.awaitingReply && (
            <Badge className="bg-pending-surface text-pending">{t('support.awaiting')}</Badge>
          )}
          <Badge
            className={
              row.state === 'closed'
                ? 'bg-mist-deep text-sarat-black-600'
                : 'bg-info-surface text-info'
            }
          >
            {t(`support.state.${row.state}`)}
          </Badge>
          <Badge
            className={
              row.windowOpen ? 'bg-success-surface text-success' : 'bg-mist-deep text-sarat-black-600'
            }
          >
            {row.windowOpen ? t('support.windowOpen') : t('support.windowClosed')}
          </Badge>
        </div>
        <p className="text-sarat-black-600 line-clamp-2 text-sm leading-relaxed" dir="auto">
          {row.lastMessagePreview || t('support.noMessages')}
        </p>
        {row.lastInboundAt && (
          <p className="text-sarat-black-600 text-[13px]">
            {t('support.lastInbound', { date: formatDate(new Date(row.lastInboundAt), loc, 'gregory', DATE_TIME) })}
          </p>
        )}
      </Link>
    </li>
  );

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        <Link
          href="/admin"
          className="text-sarat-black-600 inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium transition-opacity duration-200 hover:opacity-60"
        >
          <ArrowLeft className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
          {t('backToAdmin')}
        </Link>
        <p className={eyebrowClassName}>{t('support.eyebrow')}</p>
        <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
          {t('support.title')}
        </h1>
        <p className="text-sarat-black-600 max-w-2xl text-base leading-relaxed">
          {t('support.intro')}
        </p>
      </div>

      {rows === null ? (
        <div className="border-sarat-black/8 rounded-card flex flex-col items-start gap-4 [border-width:0.5px] p-10">
          <p className={eyebrowClassName}>{t('noDb.eyebrow')}</p>
          <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
            {t('noDb.title')}
          </h2>
          <p className="text-sarat-black-600 max-w-xl text-base">{t('noDb.description')}</p>
        </div>
      ) : rows.length === 0 && (!tickets || tickets.length === 0) ? (
        <EmptyState
          icon={MessageCircle}
          eyebrow={t('support.empty.eyebrow')}
          title={t('support.empty.title')}
          description={t('support.empty.description')}
        />
      ) : (
        <>
          <section className="flex flex-col gap-4">
            <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
              {t('support.ticketsHeading')}
              {tickets && tickets.length > 0 && (
                <span className="text-sarat-black-600 ms-2 text-base tabular-nums">
                  {tickets.length}
                </span>
              )}
            </h2>
            {!tickets || tickets.length === 0 ? (
              <p className="text-sarat-black-600 text-base">{t('support.ticketsEmpty')}</p>
            ) : (
              <ul className="flex flex-col gap-4">
                {tickets.map((ticket) => (
                  <TicketCard key={ticket.id} ticket={ticket} locale={loc} copy={ticketCopy} />
                ))}
              </ul>
            )}
          </section>
          <section className="flex flex-col gap-4">
            <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
              {t('support.awaitingHeading')}
              {awaiting.length > 0 && (
                <span className="text-sarat-black-600 ms-2 text-base tabular-nums">
                  {awaiting.length}
                </span>
              )}
            </h2>
            {awaiting.length === 0 ? (
              <p className="text-sarat-black-600 text-base">{t('support.awaitingEmpty')}</p>
            ) : (
              <ul className="flex flex-col gap-4">{awaiting.map(renderRow)}</ul>
            )}
          </section>
          {others.length > 0 && (
            <section className="flex flex-col gap-4">
              <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
                {t('support.otherHeading')}
              </h2>
              <ul className="flex flex-col gap-4">{others.map(renderRow)}</ul>
            </section>
          )}
          {rows.length >= CONVERSATIONS_LIST_LIMIT && (
            <p className="text-sarat-black-600 text-sm">
              {t('support.truncated', { count: CONVERSATIONS_LIST_LIMIT })}
            </p>
          )}
        </>
      )}
    </div>
  );
}
