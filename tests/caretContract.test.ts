import { describe, expect, it } from 'vitest';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdownSupport } from '../src/lib/editor/markdownLang';
import { documentDir, livePreview } from '../src/lib/editor/livePreview';
import { setEditing } from '../src/lib/editor/livePreview/editing';
import { computeActive, isLineActive } from '../src/lib/editor/livePreview/active';

/**
 * What the caret is allowed to do around a block that is drawn as one object.
 * The rule: movement treats it as a whole, deletion does not get to.
 */
function viewOf(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [markdownSupport(), livePreview(), documentDir.of('/docs')]
    })
  });
}

const doc = 'before\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\nafter\n';
const tableFrom = doc.indexOf('| a | b |');
const tableTo = doc.indexOf('| 1 | 2 |') + '| 1 | 2 |'.length;

describe('a rendered block cannot be deleted blind', () => {
  it('refuses a deletion that swallows the whole table', () => {
    const view = viewOf(doc);
    view.dispatch({ changes: { from: tableFrom, to: tableTo, insert: '' } });

    expect(view.state.doc.toString()).toBe(doc);
    view.destroy();
  });

  it('allows it once the table is open and its text is on screen', () => {
    const view = viewOf(doc);
    view.dispatch({
      selection: EditorSelection.cursor(tableFrom + 2),
      effects: setEditing.of(true)
    });
    view.dispatch({ changes: { from: tableFrom, to: tableTo, insert: '' } });

    expect(view.state.doc.toString()).not.toBe(doc);
    view.destroy();
  });

  it('never gets in the way of ordinary editing', () => {
    const view = viewOf(doc);
    view.dispatch({ changes: { from: 0, insert: 'X' }, userEvent: 'input.type' });
    expect(view.state.doc.toString().startsWith('Xbefore')).toBe(true);

    // A deletion inside the block's own lines is fine — it is not the block.
    view.dispatch({
      changes: { from: tableFrom + 3, to: tableFrom + 4, insert: '' },
      userEvent: 'delete'
    });
    expect(view.state.doc.toString()).not.toContain('| a | b |');
    view.destroy();
  });

  it('does not interfere with loading a file', () => {
    const view = viewOf(doc);
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: 'something else\n' },
      userEvent: 'input.reload'
    });
    expect(view.state.doc.toString()).toBe('something else\n');
    view.destroy();
  });
});

describe('how wide a selection may reveal', () => {
  const long = Array.from({ length: 80 }, (_, i) => `**line ${i}**`).join('\n');

  function activeLinesFor(from: number, to: number): number {
    const state = EditorState.create({
      doc: long,
      selection: EditorSelection.range(from, to),
      extensions: [markdownSupport()]
    });
    const active = computeActive(state, false);
    let count = 0;
    for (let n = 1; n <= state.doc.lines; n++) if (isLineActive(active, n)) count += 1;
    return count;
  }

  it('reveals what a normal selection covers', () => {
    const state = EditorState.create({ doc: long, extensions: [markdownSupport()] });
    const to = state.doc.line(5).to;
    expect(activeLinesFor(0, to)).toBe(5);
  });

  it('stops revealing when the selection is the whole document', () => {
    // Select-all asked for the text, not for its markup.
    expect(activeLinesFor(0, long.length)).toBe(1);
  });
});
