import { EditorSelection, type EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { setEditing } from './livePreview/editing';
import { isDelimiterRow } from './livePreview/table';

/**
 * Moving around a table by keyboard, over the source text.
 *
 * The table on screen is a rendering; the file is still a handful of lines
 * with pipes in them. Everything here works on those lines and moves only the
 * caret — with one exception, adding a row, which copies the shape of the row
 * above it rather than reformatting anything. A table nobody has touched must
 * come back out of the editor byte for byte, however crooked its pipes are.
 */

export interface TableCell {
  /** The cell's text, without the padding around it. */
  from: number;
  to: number;
  /** The whole slot between two pipes, padding included. */
  segFrom: number;
  segTo: number;
}

export interface TableRow {
  from: number;
  to: number;
  cells: TableCell[];
}

export interface TableRegion {
  from: number;
  to: number;
  /** Header and body rows. The delimiter row is not one you can type in. */
  rows: TableRow[];
}

/**
 * Offsets of the pipes that actually separate cells.
 *
 * A pipe inside `inline code` or behind a backslash is content, and treating
 * it as a separator splits a cell that the reader never split.
 */
function separatorPipes(line: string): number[] {
  const out: number[] = [];
  let inCode = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '\\') {
      i += 1;
      continue;
    }
    if (ch === '`') {
      inCode = !inCode;
      continue;
    }
    if (ch === '|' && !inCode) out.push(i);
  }
  return out;
}

/** The slots between the separators, with the border pipes' empties dropped. */
function segmentsOf(line: string): { from: number; to: number }[] {
  const pipes = separatorPipes(line);
  if (pipes.length === 0) return [];

  const segments: { from: number; to: number }[] = [];
  let start = 0;
  for (const p of pipes) {
    segments.push({ from: start, to: p });
    start = p + 1;
  }
  segments.push({ from: start, to: line.length });

  // `| a | b |` has an empty slot before the first pipe and after the last.
  // Those are the border, not columns — the same rule parseTable uses.
  const blank = (s: { from: number; to: number }): boolean =>
    line.slice(s.from, s.to).trim().length === 0;
  if (segments.length > 1 && blank(segments[0]!)) segments.shift();
  if (segments.length > 1 && blank(segments[segments.length - 1]!)) segments.pop();

  return segments;
}

export function cellsOfRow(text: string, lineFrom: number): TableCell[] {
  return segmentsOf(text).map((seg) => {
    const raw = text.slice(seg.from, seg.to);
    const lead = raw.length - raw.trimStart().length;
    const trail = raw.length - raw.trimEnd().length;

    // An empty slot has no text to land on. Sit one space in, so typing gives
    // `| x |` and not `|x  |`.
    const empty = raw.trim().length === 0;
    const from = empty ? Math.min(seg.from + 1, seg.to) : seg.from + lead;
    const to = empty ? from : seg.to - trail;

    return {
      from: lineFrom + from,
      to: lineFrom + to,
      segFrom: lineFrom + seg.from,
      segTo: lineFrom + seg.to
    };
  });
}

function looksLikeRow(text: string): boolean {
  return text.trim().length > 0 && separatorPipes(text).length > 0;
}

/**
 * The table the given position sits in, or null.
 *
 * Found by looking at the text rather than the syntax tree: this runs on every
 * Tab, and the tree for a large document is parsed lazily, so asking it here
 * would mean either a stall or a wrong answer.
 */
export function tableRegionAt(state: EditorState, pos: number): TableRegion | null {
  const line = state.doc.lineAt(pos);
  if (!looksLikeRow(line.text)) return null;

  let first = line.number;
  while (first > 1 && looksLikeRow(state.doc.line(first - 1).text)) first -= 1;
  let last = line.number;
  while (last < state.doc.lines && looksLikeRow(state.doc.line(last + 1).text)) last += 1;

  // The delimiter row is what makes a run of pipes a table; the row above it
  // is the header. Anything before that is a paragraph that happens to touch.
  let delimiter = -1;
  for (let n = first + 1; n <= last; n++) {
    if (isDelimiterRow(state.doc.line(n).text)) {
      delimiter = n;
      break;
    }
  }
  if (delimiter < 0) return null;

  const start = delimiter - 1;
  if (line.number < start) return null;

  const rows: TableRow[] = [];
  for (let n = start; n <= last; n++) {
    if (n === delimiter) continue;
    const l = state.doc.line(n);
    rows.push({ from: l.from, to: l.to, cells: cellsOfRow(l.text, l.from) });
  }

  return { from: state.doc.line(start).from, to: state.doc.line(last).to, rows };
}

/** Where the caret is in the grid, clamped to the nearest cell on its row. */
function locate(region: TableRegion, pos: number): { row: number; col: number } | null {
  const rowIndex = region.rows.findIndex((r) => pos >= r.from && pos <= r.to);
  if (rowIndex < 0) return null;

  const cells = region.rows[rowIndex]!.cells;
  if (cells.length === 0) return null;

  let col = cells.findIndex((c) => pos >= c.segFrom && pos <= c.segTo);
  if (col < 0) col = pos < cells[0]!.segFrom ? 0 : cells.length - 1;
  return { row: rowIndex, col };
}

/** The next cell in reading order, or null at either end of the table. */
export function cellStep(region: TableRegion, pos: number, dir: 1 | -1): TableCell | null {
  const at = locate(region, pos);
  if (!at) return null;

  let { row, col } = at;
  col += dir;
  while (col < 0 || col >= (region.rows[row]?.cells.length ?? 0)) {
    row += dir;
    const next = region.rows[row];
    if (!next || next.cells.length === 0) return null;
    col = dir === 1 ? 0 : next.cells.length - 1;
  }

  return region.rows[row]?.cells[col] ?? null;
}

/**
 * The same row with its text taken out and its pipes left exactly where they
 * were. Copying the shape is what keeps a hand-aligned table aligned and a
 * ragged one ragged; re-generating the row from a column count would rewrite
 * lines the reader never touched.
 */
export function blankRowLike(line: string): string {
  const lead = line.length - line.trimStart().length;
  const pipes = new Set(separatorPipes(line));
  let out = line.slice(0, lead);
  for (let i = lead; i < line.length; i++) out += pipes.has(i) ? '|' : ' ';
  return out;
}

function selectCell(view: EditorView, cell: TableCell): void {
  view.dispatch({
    selection:
      cell.to > cell.from
        ? EditorSelection.range(cell.from, cell.to)
        : EditorSelection.cursor(cell.from),
    effects: setEditing.of(true),
    scrollIntoView: true
  });
}

function move(view: EditorView, dir: 1 | -1): boolean {
  const pos = view.state.selection.main.head;
  const region = tableRegionAt(view.state, pos);
  if (!region) return false;

  const cell = cellStep(region, pos, dir);
  if (cell) {
    selectCell(view, cell);
    return true;
  }

  // Past the last cell: Tab adds a row, which is how every table editor
  // people have used behaves. Past the first cell it does nothing — Shift+Tab
  // is not a request to grow the table upwards.
  if (dir === 1 && !view.state.readOnly) return appendRow(view, region);
  return true;
}

function appendRow(view: EditorView, region: TableRegion): boolean {
  const lastRow = region.rows[region.rows.length - 1];
  if (!lastRow) return false;

  const insert = `\n${blankRowLike(view.state.doc.sliceString(lastRow.from, lastRow.to))}`;
  view.dispatch({
    changes: { from: lastRow.to, insert },
    effects: setEditing.of(true),
    userEvent: 'input.table',
    scrollIntoView: true
  });

  const fresh = tableRegionAt(view.state, lastRow.to + 1);
  const first = fresh?.rows[fresh.rows.length - 1]?.cells[0];
  if (first) selectCell(view, first);
  return true;
}

export function nextTableCell(view: EditorView): boolean {
  return move(view, 1);
}

export function prevTableCell(view: EditorView): boolean {
  return move(view, -1);
}

/**
 * Step out of the table, onto the line below it.
 *
 * Escape means "I am done here": the caret leaves, so the table collapses back
 * into its rendered form without freezing the rest of the document.
 */
export function exitTable(view: EditorView): boolean {
  const region = tableRegionAt(view.state, view.state.selection.main.head);
  if (!region) return false;

  const lastLine = view.state.doc.lineAt(region.to).number;
  const target =
    lastLine < view.state.doc.lines ? view.state.doc.line(lastLine + 1).from : region.to;

  view.dispatch({ selection: EditorSelection.cursor(target), scrollIntoView: true });
  return true;
}
