'use client';

import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toCsv } from '@/lib/csv';

export interface CsvDownloadButtonProps {
  headers: readonly string[];
  rows: readonly (readonly (string | number)[])[];
  filename: string;
  label: string;
}

/**
 * Client-side CSV export of data the page already loaded — no extra API
 * surface, no second query that could disagree with what's on screen.
 * Serialization goes through the ONE shared writer in `lib/csv.ts`
 * (2026-08-01 ninth audit — this file carried its own unhardened copy:
 * no formula-injection defusing, no CR quoting, LF endings; every
 * current column is system-generated, but the first free-text column
 * added would have inherited the gap silently).
 */
export function CsvDownloadButton({ headers, rows, filename, label }: CsvDownloadButtonProps) {
  const download = () => {
    const blob = new Blob([toCsv(headers, rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Button type="button" variant="secondary" size="md" className="gap-2" onClick={download}>
      <Download className="size-4 shrink-0" aria-hidden />
      {label}
    </Button>
  );
}
