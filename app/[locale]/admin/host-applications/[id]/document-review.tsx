'use client';

import { useActionState, useId, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  reviewDocument,
  type DocumentReviewState,
} from '@/features/host-applications/admin-actions';
import type {
  HostApplicationDocumentAdminView,
  HostDocumentStatus,
} from '@/features/host-applications/types';

type ErrorKey =
  | 'forbidden'
  | 'no_db'
  | 'not_found'
  | 'validation'
  | 'server'
  | 'rejection_note_short';

export interface DocumentReviewCopy {
  heading: string;
  empty: string;
  view: string;
  approve: string;
  reject: string;
  pendingAction: string;
  noteLabel: string;
  noteHint: string;
  statuses: Record<HostDocumentStatus, string>;
  /** Localized labels per document type value. */
  typeLabels: Record<string, string>;
  errors: Record<ErrorKey, string>;
}

export interface DocumentReviewProps {
  /** Documents pre-enriched server-side with a locale-formatted date. */
  items: ReadonlyArray<{ document: HostApplicationDocumentAdminView; uploadedOn: string }>;
  /** Locale-aware eyebrow class from the server page (uppercase is EN-only). */
  headingClassName: string;
  copy: DocumentReviewCopy;
}

const STATUS_TONE: Record<HostDocumentStatus, string> = {
  pending: 'bg-pending-surface text-pending',
  approved: 'bg-success-surface text-success',
  rejected: 'bg-error-surface text-error',
};

const initialState: DocumentReviewState = { success: false };

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function DecisionButton({
  decision,
  copy,
}: {
  decision: 'approved' | 'rejected';
  copy: DocumentReviewCopy;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      name="decision"
      value={decision}
      variant={decision === 'approved' ? 'primary' : 'secondary'}
      size="sm"
      pending={pending}
    >
      {pending ? copy.pendingAction : decision === 'approved' ? copy.approve : copy.reject}
    </Button>
  );
}

function errorMessage(state: DocumentReviewState, copy: DocumentReviewCopy): string | undefined {
  if (state.message === 'validation' && state.fieldError) {
    const key = state.fieldError as ErrorKey;
    return key in copy.errors ? copy.errors[key] : copy.errors.validation;
  }
  if (!state.message) return undefined;
  const key = state.message as ErrorKey;
  return key in copy.errors ? copy.errors[key] : copy.errors.server;
}

function DocumentRow({
  document,
  uploadedOnLabel,
  copy,
}: {
  document: HostApplicationDocumentAdminView;
  uploadedOnLabel: string;
  copy: DocumentReviewCopy;
}) {
  const [state, formAction] = useActionState(reviewDocument, initialState);
  const [noteOpen, setNoteOpen] = useState(false);
  const noteId = useId();
  const error = errorMessage(state, copy);

  return (
    <li className="border-sarat-black/8 rounded-card flex flex-col gap-3 [border-width:0.5px] p-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-base font-medium">
          {copy.typeLabels[document.type] ?? document.type}
        </span>
        <Badge className={STATUS_TONE[document.status]}>{copy.statuses[document.status]}</Badge>
        {document.signedUrl && (
          <a
            href={document.signedUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sarat-black inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4 transition-opacity duration-200 hover:opacity-60"
          >
            {copy.view}
          </a>
        )}
      </div>
      <p className="text-sarat-black-600 text-sm" dir="ltr">
        {document.fileName} · {formatSize(document.sizeBytes)} · {uploadedOnLabel}
      </p>
      {document.reviewerNotes && (
        <p className="text-sarat-black-600 text-sm whitespace-pre-line">{document.reviewerNotes}</p>
      )}

      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="documentId" value={document.id} />
        {noteOpen && (
          <div className="flex flex-col gap-2">
            <label htmlFor={noteId} className="text-sm font-medium">
              {copy.noteLabel}
            </label>
            <textarea
              id={noteId}
              name="reviewerNotes"
              rows={2}
              maxLength={2000}
              className={cn(
                'rounded-input border-sarat-black/20 text-sarat-black w-full resize-y [border-width:0.5px] bg-white px-4 py-3 text-base',
                'placeholder:text-sarat-black-600 disabled:pointer-events-none disabled:opacity-50',
              )}
            />
            <p className="text-sarat-black-600 text-sm">{copy.noteHint}</p>
          </div>
        )}
        {error && (
          <p role="alert" className="text-al-qatt-red-800 text-sm">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <DecisionButton decision="approved" copy={copy} />
          {noteOpen ? (
            <DecisionButton decision="rejected" copy={copy} />
          ) : (
            // First tap on "Reject" opens the note field (a rejection
            // needs a reason); the second actually submits.
            <Button type="button" variant="secondary" size="sm" onClick={() => setNoteOpen(true)}>
              {copy.reject}
            </Button>
          )}
        </div>
      </form>
    </li>
  );
}

export function DocumentReview({ items, headingClassName, copy }: DocumentReviewProps) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className={headingClassName}>{copy.heading}</h2>
      {items.length === 0 ? (
        <p className="text-sarat-black-600 text-sm">{copy.empty}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map(({ document, uploadedOn }) => (
            <DocumentRow
              key={document.id}
              document={document}
              uploadedOnLabel={uploadedOn}
              copy={copy}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
