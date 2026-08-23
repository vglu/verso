import { syntaxTree } from '@codemirror/language';
import { EditorSelection, type EditorState, type SelectionRange } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { renderedBlocks } from './livePreview';

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

/**
 * Own the vertical step whenever the editor's own idea of it is not one step.
 *
 * Two faults live here, and they are the same fault seen from two sides.
 *
 * A table drawn as a widget has no visual lines inside it, so plain Up/Down
 * skips the whole thing — twenty rows vanish in one keypress. That is the one
 * this used to answer: when the next line belongs to a rendered block, put
 * the caret on that block's near edge instead. The selection landing inside
 * turns the block into source on the same transaction, so the following press
 * continues line by line, and leaving the far edge renders it again.
 *
 * The other is worse and was invisible to that rule. Vertical motion in
 * CodeMirror is a question about pixels, and the pixels above a document full
 * of rendered blocks are estimates until they have been drawn. Measured in the
 * running application, one press of Up from the last line of the showcase
 * document moved the caret from line 71 to line 33 — past a formula, a rule, a
 * diagram and a block of code — and a later press went from 29 to 17, over a
 * table. The old rule declined both: the *adjacent* line was ordinary text, so
 * as far as it could see nothing was being crossed.
 *
 * So the question changed. It is no longer "is a block next to me" but "is the
 * editor about to move me further than one step". One step means: another row
 * of the same wrapped line, the adjacent line, or the near edge of a rendered
 * block. Anything else is overridden and the caret goes where it should have.
 * CodeMirror keeps the movement whenever it is right, which is almost always —
 * it tracks the goal column across a run of presses better than this can.
 */
function stepIntoBlock(view: EditorView, direction: 1 | -1): boolean {
  const state = view.state;
  const range = state.selection.main;
  if (!range.empty) return false;

  const head = range.head;
  const blocks = renderedBlocks(state);
  if (blocks.length === 0) return false;

  // Is the next line inside a block? That is the whole question, and it is a
  // question about the text.
  //
  // It used to be asked of the layout — "where would the editor put the caret"
  // — because a block drawn as one object has no lines inside it to land on,
  // and the caret clears it in a single step. But the first keystroke is also
  // what turns rendering on, so the geometry it produced had not been measured
  // yet, and a wrong answer sent the caret to the first table in the document.
  // The text always knows, and it knows before anything has been drawn.
  const line = state.doc.lineAt(head);
  const nextNumber = line.number + direction;
  if (nextNumber < 1 || nextNumber > state.doc.lines) return false;

  const adjacent = state.doc.line(nextNumber);
  const crossed = blocks.find(
    (b) =>
      adjacent.from >= b.from &&
      adjacent.to <= b.to &&
      // Already inside it: the source is showing and ordinary line movement
      // is exactly right, so stay out of the way.
      !(head >= b.from && head <= b.to)
  );

  // Where one step is allowed to land: the next line, or — when a rendered
  // block starts there — its near edge.
  const targetLine = crossed
    ? direction === 1
      ? state.doc.lineAt(crossed.from)
      : state.doc.lineAt(crossed.to)
    : adjacent;

  if (!crossed && !overshoots(view, range, direction, line.number, targetLine)) return false;

  const entry = keepColumn(view, head, targetLine);
  if (entry === head) return false;

  view.dispatch({
    selection: EditorSelection.cursor(entry),
    effects: EditorView.scrollIntoView(entry, { y: 'nearest', yMargin: 32 }),
    scrollIntoView: false
  });
  return true;
}

/**
 * Would the editor's own vertical motion go further than one step?
 *
 * Asked by doing it: `moveVertically` is a pure calculation on the current
 * layout, so the answer costs nothing and needs no guessing about wrapped
 * lines — a long paragraph moving between its own rows lands on the same line
 * number, which is inside the allowance by definition.
 *
 * When the layout cannot answer — a headless test, or the first keystroke of
 * the session, before anything has been drawn — the answer is no. Overriding
 * on a guess is how the caret ended up at the first table in the file the last
 * time this was decided by geometry.
 */
function overshoots(
  view: EditorView,
  range: SelectionRange,
  direction: 1 | -1,
  from: number,
  target: { from: number }
): boolean {
  // No layout, no opinion. A headless test and the moment before the first
  // paint both report a content box of no height, and `moveVertically` on an
  // unmeasured document answers with a position it has invented.
  if (view.contentDOM.clientHeight === 0) return false;

  try {
    const proposed = view.moveVertically(range, direction === 1);
    const line = view.state.doc.lineAt(proposed.head).number;
    const wanted = view.state.doc.lineAt(target.from).number;
    const low = Math.min(from, wanted);
    const high = Math.max(from, wanted);
    return line < low || line > high;
  } catch {
    return false;
  }
}

/**
 * Land on the entry line under the same horizontal position the caret had.
 *
 * Vertical movement everywhere else keeps its column; dropping to column 0
 * on the way into a table is the sort of small betrayal that makes movement
 * feel arbitrary. Falls back to the line start when there is no layout to
 * measure (tests, or before the first paint).
 */
function keepColumn(view: EditorView, head: number, line: { from: number; to: number }): number {
  try {
    const coords = view.coordsAtPos(head);
    if (!coords) return line.from;
    const lineTop = view.coordsAtPos(line.from);
    if (!lineTop) return line.from;

    const at = view.posAtCoords({ x: coords.left, y: (lineTop.top + lineTop.bottom) / 2 });
    if (at === null) return line.from;
    return Math.max(line.from, Math.min(at, line.to));
  } catch {
    return line.from;
  }
}

export function stepDownIntoBlock(view: EditorView): boolean {
  return stepIntoBlock(view, 1);
}

export function stepUpIntoBlock(view: EditorView): boolean {
  return stepIntoBlock(view, -1);
}
