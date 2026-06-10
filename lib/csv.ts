/**
 * Minimal RFC-4180 CSV writer for admin exports. Values containing a
 * comma, quote, or newline are double-quoted with internal quotes
 * doubled. A UTF-8 BOM is prepended so Excel opens Arabic text
 * correctly. Cells starting with a formula trigger (= + - @) are
 * prefixed with a quote to defuse CSV-injection in spreadsheet apps.
 */

export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(
  header: readonly string[],
  rows: readonly (readonly (string | number | null | undefined)[])[],
): string {
  const lines = [header.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))];
  return `﻿${lines.join('\r\n')}\r\n`;
}
