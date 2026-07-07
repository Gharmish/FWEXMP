'use client';

import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface CsvDownloadButtonProps {
  headers: readonly string[];
  rows: readonly (readonly (string | number)[])[];
  filename: string;
  label: string;
}

function csvField(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Client-side CSV export of data the page already loaded — no extra API
 * surface, no second query that could disagree with what's on screen.
 * BOM-prefixed so Excel opens the Arabic column values as UTF-8.
 */
export function CsvDownloadButton({ headers, rows, filename, label }: CsvDownloadButtonProps) {
  const download = () => {
    const csv = [headers, ...rows].map((row) => row.map(csvField).join(',')).join('\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
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
