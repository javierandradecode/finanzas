/** Lets Excel detect UTF-8 (accents) when opening the file. */
export const CSV_BOM = '﻿';

export type CsvCell = string | number | undefined;

/** Text starting with these is read as a formula by spreadsheets. */
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(c: CsvCell): string {
  if (c === undefined) return '';
  if (typeof c === 'number') return c.toFixed(2);
  const text = FORMULA_START.test(c) ? `'${c}` : c;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** RFC 4180 rows (CRLF) preceded by a BOM. Numbers are money-like (2 decimals). */
export function toCsv(rows: CsvCell[][]): string {
  return CSV_BOM + rows.map((r) => r.map(cell).join(',') + '\r\n').join('');
}
