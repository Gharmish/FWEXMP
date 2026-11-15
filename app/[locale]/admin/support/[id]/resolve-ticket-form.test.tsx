import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SupportActionState } from '@/features/support/actions';

/**
 * Each refusal of `resolveTicket` gets its own message (#375): a stale
 * card on an already-resolved ticket used to show "Something went wrong.
 * Try again." — a retry that can never succeed.
 */

const actionState = vi.hoisted(() => ({ current: { success: false } as SupportActionState }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useActionState: () => [actionState.current, () => undefined, false],
  };
});
vi.mock('@/features/support/actions', () => ({ resolveTicket: vi.fn() }));
vi.mock('@/components/ui/button', () => ({
  Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));

import { ResolveTicketForm } from './resolve-ticket-form';

const copy = {
  label: 'Resolution note',
  placeholder: 'What was done',
  resolve: 'Mark resolved',
  resolving: 'Resolving',
  errors: {
    forbidden: 'FORBIDDEN',
    no_db: 'NO_DB',
    not_found: 'ALREADY_RESOLVED',
    validation: 'NOTE_TOO_LONG',
    server: 'SERVER',
  },
};

function render(state: SupportActionState): string {
  actionState.current = state;
  return renderToStaticMarkup(<ResolveTicketForm ticketId="t-1" copy={copy} />);
}

describe('<ResolveTicketForm> refusal copy', () => {
  it.each([
    ['not_found', 'ALREADY_RESOLVED'],
    ['forbidden', 'FORBIDDEN'],
    ['validation', 'NOTE_TOO_LONG'],
    ['no_db', 'NO_DB'],
    ['server', 'SERVER'],
  ] as const)('%s shows its own message', (message, expected) => {
    const html = render({ success: false, message, values: { resolutionNote: 'kept' } });
    expect(html).toContain(expected);
    for (const other of Object.values(copy.errors).filter((v) => v !== expected)) {
      expect(html).not.toContain(other);
    }
    expect(html).toContain('kept');
  });

  it('shows no alert before a submit', () => {
    expect(render({ success: false })).not.toContain('role="alert"');
  });
});
