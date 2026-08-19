/**
 * GFM table parsing, kept pure so it is unit-testable without a DOM.
 * The syntax tree has already told us the range is a table; this only needs
 * to split it into cells faithfully.
 */

export type CellAlign = 'left' | 'center' | 'right' | null;

export interface ParsedTable {
  header: string[];
  align: CellAlign[];
  rows: string[][];
}

/** Split one table row into trimmed cells, honouring escapes and inline code. */
export function splitRow(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inCode = false;
  let i = 0;

  while (i < line.length) {
    const ch = line[i]!;

    if (ch === '\\' && i + 1 < line.length) {
      // Keep the escape so the inline renderer can resolve it later.
      current += ch + line[i + 1];
      i += 2;
      continue;
    }
    if (ch === '`') {
      inCode = !inCode;
      current += ch;
      i += 1;
      continue;
    }
    if (ch === '|' && !inCode) {
      cells.push(current);
      current = '';
      i += 1;
      continue;
    }
    current += ch;
    i += 1;
  }
  cells.push(current);

  // Border pipes produce empty cells at the edges; those are not columns.
  if (cells.length > 1 && cells[0]!.trim() === '') cells.shift();
  if (cells.length > 1 && cells[cells.length - 1]!.trim() === '') cells.pop();

  return cells.map((c) => c.trim());
}

const DELIMITER_CELL = /^:?-{1,}:?$/;

export function isDelimiterRow(line: string): boolean {
  const cells = splitRow(line);
  return cells.length > 0 && cells.every((c) => DELIMITER_CELL.test(c));
}

function alignOf(cell: string): CellAlign {
  const left = cell.startsWith(':');
  const right = cell.endsWith(':');
  if (left && right) return 'center';
  if (right) return 'right';
  if (left) return 'left';
  return null;
}

export function parseTable(source: string): ParsedTable | null {
  const lines = source.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length < 2) return null;

  const header = splitRow(lines[0]!);
  if (!isDelimiterRow(lines[1]!)) return null;

  const align = splitRow(lines[1]!).map(alignOf);
  const rows = lines.slice(2).map(splitRow);

  // Pad short rows so the rendered table stays rectangular.
  const width = Math.max(header.length, ...rows.map((r) => r.length));
  const padCells = (r: string[]): string[] => {
    const out = r.slice(0, width);
    while (out.length < width) out.push('');
    return out;
  };
  const padAlign = (a: CellAlign[]): CellAlign[] => {
    const out = a.slice(0, width);
    while (out.length < width) out.push(null);
    return out;
  };

  return {
    header: padCells(header),
    align: padAlign(align),
    rows: rows.map(padCells)
  };
}
