import type { Formatter } from './types';

/**
 * CSV, turned into a Markdown table.
 *
 * This is the conversion a Markdown editor should have: people are handed
 * data as CSV and want it in a document as a table, and doing that by hand is
 * an afternoon of aligning pipes.
 *
 * The parser follows RFC 4180 — quoted fields, doubled quotes inside them,
 * and separators or line breaks inside quotes — because the half-parser that
 * splits on commas turns one bad row into a silently mangled table.
 */

const DELIMITERS = [',', ';', '\t', '|'] as const;
type Delimiter = (typeof DELIMITERS)[number];

/**
 * Guess the separator by counting candidates outside quotes on the first few
 * lines and taking the one that appears the same number of times on each —
 * a column separator is regular, an apostrophe or a comma in prose is not.
 */
export function detectDelimiter(text: string): Delimiter {
  const sample = text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .slice(0, 10);
  if (sample.length === 0) return ',';

  let best: Delimiter = ',';
  let bestScore = -1;
  for (const candidate of DELIMITERS) {
    const counts = sample.map((line) => countOutsideQuotes(line, candidate));
    if (counts[0] === 0) continue;
    const consistent = counts.every((n) => n === counts[0]);
    const score = (consistent ? 1000 : 0) + counts[0]!;
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

function countOutsideQuotes(line: string, delimiter: string): number {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') i += 1;
      else inQuotes = !inQuotes;
    } else if (!inQuotes && ch === delimiter) {
      count += 1;
    }
  }
  return count;
}

/** Rows of fields. Ragged input stays ragged — padding is the caller's call. */
export function parseCsv(text: string, delimiter: string = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"' && field === '') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      // A CRLF is one break, not two.
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // A trailing newline produces one empty row; it is not data.
  return rows.filter((r) => r.length > 1 || (r[0] ?? '') !== '');
}

/**
 * Cells go into a table, so anything that would end the cell early has to
 * stop meaning that: a pipe is escaped, and a line break inside a quoted
 * field becomes a space — Markdown tables have no way to hold one, and the
 * alternative (`<br>`) would show up as text, since Verso never executes
 * HTML from a document.
 */
function escapeCell(value: string): string {
  return value
    .replace(/\|/g, '\\|')
    .replace(/\s*\r?\n\s*/g, ' ')
    .trim();
}

export const csvToMarkdownTable: Formatter = {
  id: 'csv-table',
  titleKey: 'format.csvTable',
  extensions: ['csv', 'tsv'],

  format(text) {
    if (!text.trim()) return null;

    const delimiter = detectDelimiter(text);
    const rows = parseCsv(text, delimiter);
    if (rows.length === 0) return null;

    const width = Math.max(...rows.map((r) => r.length));
    if (width < 2) return null; // one column is a list, not a table

    const padded = rows.map((r) => {
      const cells = r.map(escapeCell);
      while (cells.length < width) cells.push('');
      return cells;
    });

    const [header, ...body] = padded;
    if (!header) return null;

    // The columns are padded to a common width so the source is readable as
    // text too — which is the whole promise of the format.
    const widths = header.map((_, column) =>
      Math.max(3, ...padded.map((r) => (r[column] ?? '').length))
    );
    const line = (cells: string[]): string =>
      `| ${cells.map((cell, i) => cell.padEnd(widths[i] ?? cell.length)).join(' | ')} |`;

    const out = [
      line(header),
      `| ${widths.map((w) => '-'.repeat(w)).join(' | ')} |`,
      ...body.map(line)
    ];

    return {
      text: `${out.join('\n')}\n`,
      note: `${body.length} rows`
    };
  }
};
