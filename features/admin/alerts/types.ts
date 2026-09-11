export interface AdminAlertRow {
  id: string;
  kind: string;
  subject: string;
  detail: Record<string, unknown>;
  ticketId: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
  /** Persisted inside a quiet window — recorded, not paged. */
  suppressed: boolean;
}

export type AlertActionMessage = 'forbidden' | 'no_db' | 'validation' | 'not_found' | 'server';

export type AlertActionState = { success: false; message?: AlertActionMessage } | { success: true };
