import type { EditorState } from '@codemirror/state';

/**
 * Which parts of the document currently show their raw Markdown.
 *
 * Reveal is line-based: a line whose text the caret (or a selection) touches
 * shows its syntax, everything else stays rendered. That is the Typora feel,
 * and it is cheap and predictable — no per-node hit testing.
 */
export interface ActiveContext {
  lines: Set<number>;
  ranges: readonly { from: number; to: number }[];
  /** Reader mode: nothing is ever revealed. */
  frozen: boolean;
}

/**
 * Beyond this many lines a selection stops revealing what it covers.
 *
 * Select-all on a long document would otherwise strip the formatting from the
 * entire thing at once — the reader asked to select the text, not to see its
 * markup.
 */
const MAX_REVEALED_LINES = 40;

export function computeActive(state: EditorState, frozen = false): ActiveContext {
  const lines = new Set<number>();
  const ranges: { from: number; to: number }[] = [];

  if (!frozen) {
    for (const range of state.selection.ranges) {
      ranges.push({ from: range.from, to: range.to });
      const first = state.doc.lineAt(range.from).number;
      let last = state.doc.lineAt(range.to).number;

      // A selection that stops exactly at a line start does not reach into
      // that line, so shift+Down should not un-render it.
      if (range.to > range.from && state.doc.lineAt(range.to).from === range.to) {
        last = Math.max(first, last - 1);
      }

      if (last - first >= MAX_REVEALED_LINES) {
        // Too broad to be about the markup: reveal only where the caret is.
        const head = state.doc.lineAt(range.head).number;
        lines.add(head);
        continue;
      }

      for (let n = first; n <= last; n++) lines.add(n);
    }
  }

  return { lines, ranges, frozen };
}

export function isLineActive(active: ActiveContext, lineNumber: number): boolean {
  return !active.frozen && active.lines.has(lineNumber);
}

/**
 * Block-level reveal: a table or other block widget opens up when the
 * selection is anywhere inside it, not just on one of its lines.
 */
export function isRangeActive(active: ActiveContext, from: number, to: number): boolean {
  if (active.frozen) return false;
  return active.ranges.some((r) => r.from <= to && r.to >= from);
}
