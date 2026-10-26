interface RejectedApplicationNoticeProps {
  eyebrow: string;
  title: string;
  description: string;
  reviewerNotes: string | null;
}

// Shown above the refile form when the application was rejected: the
// rejection email sends the applicant here to read the reviewer's note.
export function RejectedApplicationNotice({
  eyebrow,
  title,
  description,
  reviewerNotes,
}: RejectedApplicationNoticeProps) {
  return (
    <section
      role="status"
      className="border-sarat-black/12 rounded-card mt-12 flex flex-col gap-3 border p-6"
    >
      <p className="text-sarat-black-600 text-eyebrow">{eyebrow}</p>
      <h2 className="text-lg font-medium">{title}</h2>
      <p className="text-sarat-black-600 text-base leading-relaxed">{description}</p>
      {reviewerNotes && (
        <p className="text-al-qatt-red-800 text-sm whitespace-pre-line">{reviewerNotes}</p>
      )}
    </section>
  );
}
