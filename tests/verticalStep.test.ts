import { describe, expect, it } from 'vitest';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdownSupport } from '../src/lib/editor/markdownLang';
import { livePreview } from '../src/lib/editor/livePreview';
import { setEditing } from '../src/lib/editor/livePreview/editing';
import { stepDownIntoBlock, stepUpIntoBlock } from '../src/lib/editor/blockNav';
import { parseViewFully } from './support/tree';

/**
 * One press of an arrow key moves one step.
 *
 * Vertical motion in CodeMirror is a question about pixels, and the pixels
 * above a document full of rendered blocks are estimates until they have been
 * drawn. Measured in the running application on docs/screenshots/showcase.md,
 * in live preview, one press of Up from the last line moved the caret from
 * line 71 to line 33 — past a formula, a rule, a diagram and a block of code —
 * and a later press went from 29 to 17, over a table.
 *
 * There is no layout in a test, so the jump cannot be produced by asking the
 * real thing. It is produced here the only honest way: by handing the code the
 * answer the running editor gave, and checking that it refuses it.
 */

const DOC = [
  'Line one.', //  1
  '', //  2
  '| a | b |', //  3  table
  '| - | - |', //  4
  '| 1 | 2 |', //  5
  '', //  6
  'After the table.', //  7
  '', //  8
  'Second paragraph.', //  9
  '', // 10
  'Last line.' // 11
].join('\n');

function viewOf(line: number, column = 0): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const at = startOf(line) + column;
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: DOC,
      selection: EditorSelection.cursor(at),
      extensions: [markdownSupport(), livePreview()]
    })
  });
  parseViewFully(view);
  view.dispatch({ effects: setEditing.of(true) });
  return view;
}

function startOf(line: number): number {
  return (
    DOC.split('\n')
      .slice(0, line - 1)
      .join('\n').length + (line > 1 ? 1 : 0)
  );
}

const lineOf = (view: EditorView): number =>
  view.state.doc.lineAt(view.state.selection.main.head).number;

/**
 * A view that has been measured, and that answers a vertical move with the
 * position given — the shape of the fault, without needing a screen.
 */
function withGeometry(view: EditorView, landsOnLine: number): void {
  Object.defineProperty(view.contentDOM, 'clientHeight', { value: 600, configurable: true });
  view.moveVertically = () => EditorSelection.cursor(startOf(landsOnLine));
}

describe('a vertical step, when the editor proposes a leap', () => {
  it('refuses a proposal that clears half the document', () => {
    const view = viewOf(11); // the last line
    withGeometry(view, 3); // what the running editor actually proposed

    expect(stepUpIntoBlock(view)).toBe(true);
    expect(lineOf(view)).toBe(10); // the adjacent line, and nothing further

    view.destroy();
  });

  it('accepts the proposal when it is the adjacent line', () => {
    const view = viewOf(11);
    withGeometry(view, 10);

    // Nothing to correct: CodeMirror keeps the movement, and with it the goal
    // column it tracks across a run of presses.
    expect(stepUpIntoBlock(view)).toBe(false);

    view.destroy();
  });

  it('accepts movement between the rows of one wrapped line', () => {
    const view = viewOf(9);
    // A wrapped line moves within itself: same line number, so it is one step
    // by definition.
    withGeometry(view, 9);

    expect(stepUpIntoBlock(view)).toBe(false);
    expect(stepDownIntoBlock(view)).toBe(false);

    view.destroy();
  });

  it('still steps into a rendered block, and does not ask about pixels first', () => {
    const view = viewOf(6); // the blank line under the table
    withGeometry(view, 1); // a leap, proposed while a block is in the way

    expect(stepUpIntoBlock(view)).toBe(true);
    expect(lineOf(view)).toBe(5); // the table's last line, not line 1

    view.destroy();
  });

  it('walks the blank line between a paragraph and a block, one line at a time', () => {
    const view = viewOf(7); // 'After the table.'
    withGeometry(view, 1);

    expect(stepUpIntoBlock(view)).toBe(true);
    expect(lineOf(view)).toBe(6); // the blank line, not the table and not line 1

    view.destroy();
  });

  it('enters the block going down as well as coming up', () => {
    const down = viewOf(2); // the blank line before the table
    withGeometry(down, 9);
    expect(stepDownIntoBlock(down)).toBe(true);
    expect(lineOf(down)).toBe(3); // the table's first line
    down.destroy();

    const up = viewOf(6); // the blank line after it
    withGeometry(up, 1);
    expect(stepUpIntoBlock(up)).toBe(true);
    expect(lineOf(up)).toBe(5); // the table's last line
    up.destroy();
  });

  it('says nothing at all when the view has never been measured', () => {
    const view = viewOf(11);
    // clientHeight is zero in a headless test, and an unmeasured editor
    // answers a vertical move with a position it has invented. Overriding on
    // that is how the caret ended up at the first table in the file.
    view.moveVertically = () => EditorSelection.cursor(startOf(1));

    expect(stepUpIntoBlock(view)).toBe(false);

    view.destroy();
  });
});
