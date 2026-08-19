import { syntaxTree } from '@codemirror/language';
import { EditorSelection, type EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

/**
 * Moving around a document by its blocks.
 *
 * A "block" here is a top-level node of the Markdown tree — a paragraph, a
 * heading, a table, a fenced code block, a list. That is the same unit the
 * reader sees, which is what makes the movement predictable: the caret lands
 * where a block starts, never in the middle of one.
 */

export interface Block {
  from: number;
  to: number;
  name: string;
}

/** Top-level blocks, in document order. */
export function blocksOf(state: EditorState): Block[] {
  const blocks: Block[] = [];
  const cursor = syntaxTree(state).topNode.cursor();

  if (cursor.firstChild()) {
    do {
      if (cursor.to > cursor.from) {
        blocks.push({ from: cursor.from, to: cursor.to, name: cursor.name });
      }
    } while (cursor.nextSibling());
  }

  return blocks;
}

export function blockAt(state: EditorState, pos: number): Block | null {
  const blocks = blocksOf(state);
  for (const block of blocks) {
    if (pos >= block.from && pos <= block.to) return block;
  }
  return null;
}

function moveTo(view: EditorView, pos: number): boolean {
  const clamped = Math.max(0, Math.min(pos, view.state.doc.length));
  view.dispatch({
    selection: EditorSelection.cursor(clamped),
    effects: EditorView.scrollIntoView(clamped, { y: 'nearest', yMargin: 48 }),
    scrollIntoView: false
  });
  return true;
}

/**
 * Down a block. From anywhere inside a block this lands on the start of the
 * next one — including a table, which opens as source rather than being
 * stepped over.
 */
export function nextBlock(view: EditorView): boolean {
  const pos = view.state.selection.main.head;
  const next = blocksOf(view.state).find((b) => b.from > pos);
  return moveTo(view, next ? next.from : view.state.doc.length);
}

/**
 * Up a block. The first press goes to the start of the block the caret is in
 * (unless it is already there), the next press to the block before it —
 * the behaviour Word established and everything since has copied.
 */
export function prevBlock(view: EditorView): boolean {
  const pos = view.state.selection.main.head;
  const blocks = blocksOf(view.state);

  const current = blocks.find((b) => pos > b.from && pos <= b.to);
  if (current) return moveTo(view, current.from);

  let target = 0;
  for (const block of blocks) {
    if (block.from < pos) target = block.from;
    else break;
  }
  return moveTo(view, target);
}

function headingPositions(state: EditorState): number[] {
  return blocksOf(state)
    .filter((b) => /^(ATXHeading|SetextHeading)[1-6]?$/.test(b.name))
    .map((b) => b.from);
}

export function nextHeading(view: EditorView): boolean {
  const pos = view.state.selection.main.head;
  const next = headingPositions(view.state).find((p) => p > pos);
  return next === undefined ? false : moveTo(view, next);
}

export function prevHeading(view: EditorView): boolean {
  const pos = view.state.selection.main.head;
  const before = headingPositions(view.state).filter((p) => p < pos);
  const target = before[before.length - 1];
  return target === undefined ? false : moveTo(view, target);
}

/** Select the block the caret sits in — the usual prelude to cut or replace. */
export function selectBlock(view: EditorView): boolean {
  const block = blockAt(view.state, view.state.selection.main.head);
  if (!block) return false;
  view.dispatch({ selection: EditorSelection.range(block.from, block.to) });
  return true;
}

/** Whole lines a block occupies, so a swap never cuts a line in half. */
function blockLines(state: EditorState, block: Block): { from: number; to: number } {
  return {
    from: state.doc.lineAt(block.from).from,
    to: state.doc.lineAt(block.to).to
  };
}

function swapBlocks(view: EditorView, direction: -1 | 1): boolean {
  const state = view.state;
  const pos = state.selection.main.head;
  const blocks = blocksOf(state);
  const index = blocks.findIndex((b) => pos >= b.from && pos <= b.to);
  if (index < 0) return false;

  const otherIndex = index + direction;
  const current = blocks[index];
  const other = blocks[otherIndex];
  if (!current || !other) return false;

  const a = blockLines(state, current);
  const b = blockLines(state, other);
  const [first, second] = direction === -1 ? [b, a] : [a, b];

  const firstText = state.doc.sliceString(first.from, first.to);
  const secondText = state.doc.sliceString(second.from, second.to);
  // Whatever separates the two blocks — usually a blank line — stays put.
  const between = state.doc.sliceString(first.to, second.from);

  const insert = secondText + between + firstText;
  const offsetInBlock = pos - a.from;
  const caret =
    direction === -1
      ? first.from + offsetInBlock
      : first.from + secondText.length + between.length + offsetInBlock;

  view.dispatch({
    changes: { from: first.from, to: second.to, insert },
    selection: EditorSelection.cursor(Math.min(caret, first.from + insert.length)),
    userEvent: 'move.block',
    scrollIntoView: true
  });
  return true;
}

export function moveBlockUp(view: EditorView): boolean {
  return swapBlocks(view, -1);
}

export function moveBlockDown(view: EditorView): boolean {
  return swapBlocks(view, 1);
}
