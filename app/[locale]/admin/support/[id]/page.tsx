import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft, Paperclip } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/format';
import { hasSupportAgent } from '@/lib/env';
import { getConversationThread, listTicketsForConversation } from '@/features/support/queries';
import { TicketCard, type TicketCardCopy } from '@/app/[locale]/admin/support/ticket-card';
import { ResolveTicketForm } from '@/app/[locale]/admin/support/[id]/resolve-ticket-form';
import type { ConversationMessageRow } from '@/features/support/types';
import { ReplyForm } from '@/app/[locale]/admin/support/[id]/reply-form';

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

export default async function AdminSupportThreadPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;

  const [t, thread, tickets] = await Promise.all([
    getTranslations('admin'),
    getConversationThread(id),
    listTicketsForConversation(id),
  ]);
  if (!thread) notFound();
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
  const resolveCopy = {
    label: t('support.ticket.resolveLabel'),
    placeholder: t('support.ticket.resolvePlaceholder'),
    resolve: t('support.ticket.resolve'),
    resolving: t('support.ticket.resolving'),
    error: t('support.thread.errors.server'),
  };
  const { conversation, messages } = thread;

  const eyebrowClassName = cn(
    'text-sarat-black-600 font-medium text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );
  const guestDir = conversation.locale === 'ar' ? 'rtl' : 'ltr';
  const agentAvailable = hasSupportAgent();

  const copy = {
    replyLabel: t('support.thread.replyLabel'),
    replyPlaceholder: t('support.thread.replyPlaceholder'),
    send: t('support.thread.send'),
    sending: t('support.thread.sending'),
    windowClosedNote: t('support.thread.windowClosedNote'),
    close: t('support.thread.close'),
    reopen: t('support.thread.reopen'),
    closePending: t('support.thread.closePending'),
    reopenPending: t('support.thread.reopenPending'),
    toBot: t('support.stateActions.toBot'),
    toBotPending: t('support.stateActions.toBotPending'),
    errors: {
      forbidden: t('support.thread.errors.forbidden'),
      no_db: t('support.thread.errors.no_db'),
      not_found: t('support.thread.errors.not_found'),
      window_closed: t('support.thread.errors.window_closed'),
      not_configured: t('support.thread.errors.not_configured'),
      validation: t('support.thread.errors.validation'),
      send_failed: t('support.thread.errors.send_failed'),
      server: t('support.thread.errors.server'),
    },
  };

  const renderMessage = (m: ConversationMessageRow) => {
    const inbound = m.direction === 'in';
    return (
      <li key={m.id} className={cn('flex', inbound ? 'justify-start' : 'justify-end')}>
        <div
          className={cn(
            'flex max-w-[80%] flex-col gap-1 rounded-[20px] px-4 py-3',
            inbound ? 'bg-mist text-sarat-black' : 'bg-sarat-black text-white',
          )}
        >
          <p
            className={cn(
              'text-[11px] font-medium',
              inbound ? 'text-sarat-black-600' : 'text-white/70',
            )}
          >
            {t(`support.thread.author.${m.author}`)}
          </p>
          {m.body && (
            <p className="text-base leading-relaxed whitespace-pre-line" dir="auto">
              {m.body}
            </p>
          )}
          {m.mediaUrl && (
            <a
              href={m.mediaUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm underline-offset-4 hover:underline"
            >
              <Paperclip className="size-4" aria-hidden />
              {t('support.thread.media')}
              {m.mediaContentType ? ` · ${m.mediaContentType}` : ''}
            </a>
          )}
          <p
            className={cn(
              'text-[11px] tabular-nums',
              inbound ? 'text-sarat-black-600' : 'text-white/70',
            )}
          >
            {formatDate(new Date(m.createdAt), loc, 'gregory', DATE_TIME)}
            {!inbound && m.deliveryStatus
              ? ` · ${t(`support.thread.delivery.${m.deliveryStatus}`)}`
              : ''}
          </p>
        </div>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        <Link
          href="/admin/support"
          className="text-sarat-black-600 inline-flex min-h-11 items-center gap-2 self-start text-sm font-medium transition-opacity duration-200 hover:opacity-60"
        >
          <ArrowLeft className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
          {t('support.thread.backToInbox')}
        </Link>
        <p className={eyebrowClassName}>{t('support.eyebrow')}</p>
        <h1 className="font-display text-3xl font-semibold tracking-[-0.035em] text-balance sm:text-4xl">
          {conversation.guestName ?? conversation.profileName ?? t('support.unknownSender')}
        </h1>
        <div className="text-sarat-black-600 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          <a href={`tel:${conversation.address}`} dir="ltr" className="font-mono underline-offset-4 hover:underline">
            {conversation.address}
          </a>
          <span aria-hidden>·</span>
          <span>
            {t('support.thread.replyLanguage', {
              language: t(`support.thread.language.${conversation.locale}`),
            })}
          </span>
          {conversation.guestPersonKey && (
            <>
              <span aria-hidden>·</span>
              <Link
                href={`/admin/users/${conversation.guestPersonKey}`}
                className="underline-offset-4 hover:underline"
              >
                {t('support.thread.guestLink')}
              </Link>
            </>
          )}
          <Badge
            className={
              conversation.state === 'closed'
                ? 'bg-mist-deep text-sarat-black-600'
                : 'bg-info-surface text-info'
            }
          >
            {t(`support.state.${conversation.state}`)}
          </Badge>
          <Badge
            className={
              conversation.windowOpen
                ? 'bg-success-surface text-success'
                : 'bg-mist-deep text-sarat-black-600'
            }
          >
            {conversation.windowOpen ? t('support.windowOpen') : t('support.windowClosed')}
          </Badge>
        </div>
      </div>

      {tickets.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="font-display text-2xl font-medium tracking-[-0.025em]">
            {t('support.ticketsHeading')}
          </h2>
          <ul className="flex flex-col gap-4">
            {tickets.map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                locale={loc}
                copy={ticketCopy}
                showThreadLink={false}
              >
                {ticket.status !== 'resolved' ? (
                  <ResolveTicketForm ticketId={ticket.id} copy={resolveCopy} />
                ) : ticket.resolutionNote ? (
                  <p className="text-sarat-black-600 text-sm leading-relaxed whitespace-pre-line">
                    {ticket.resolutionNote}
                  </p>
                ) : null}
              </TicketCard>
            ))}
          </ul>
        </section>
      )}

      <section className="border-sarat-black/8 rounded-card [border-width:0.5px] p-6">
        {messages.length === 0 ? (
          <p className="text-sarat-black-600 text-base">{t('support.noMessages')}</p>
        ) : (
          <ul className="flex flex-col gap-3">{messages.map(renderMessage)}</ul>
        )}
      </section>

      <ReplyForm
        conversationId={conversation.id}
        windowOpen={conversation.windowOpen && conversation.state !== 'closed'}
        state={conversation.state}
        guestDir={guestDir}
        agentAvailable={agentAvailable}
        copy={copy}
      />
    </div>
  );
}
