import { describe, expect, it } from 'vitest';
import { parseFully } from './support/tree';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdownSupport } from '../src/lib/editor/markdownLang';
import {
  cancelJump,
  jumpBack,
  jumpForward,
  jumpHistoryKeeper,
  pushJump
} from '../src/lib/editor/history';

/**
 * Navigation history holds places the reader can return to. Its two ways of
 * being useless are recording every caret twitch, and holding on to offsets
 * that the text has since moved out from under.
 */
function viewOf(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return new EditorView({
    parent,
    state: parseFully(
      EditorState.create({ doc, extensions: [markdownSupport(), jumpHistoryKeeper] })
    )
  });
}

const doc = '# One\n\nfirst section\n\n# Two\n\nsecond section\n\n# Three\n\nthird section\n';

describe('going back', () => {
  it('returns to where the jump started', () => {
    const view = viewOf(doc);
    const start = doc.indexOf('first section');
    view.dispatch({ selection: EditorSelection.cursor(start) });

    pushJump(view);
    view.dispatch({ selection: EditorSelection.cursor(doc.indexOf('third section')) });

    expect(jumpBack(view)).toBe(true);
    expect(view.state.selection.main.head).toBe(start);
    view.destroy();
  });

  it('does nothing when there is nowhere to go', () => {
    const view = viewOf(doc);
    expect(jumpBack(view)).toBe(false);
    expect(jumpForward(view)).toBe(false);
    view.destroy();
  });

  it('offers forward again after going back', () => {
    const view = viewOf(doc);
    const start = doc.indexOf('first section');
    const target = doc.indexOf('third section');

    view.dispatch({ selection: EditorSelection.cursor(start) });
    pushJump(view);
    view.dispatch({ selection: EditorSelection.cursor(target) });

    jumpBack(view);
    expect(jumpForward(view)).toBe(true);
    expect(view.state.selection.main.head).toBe(target);
    view.destroy();
  });

  it('ignores two jumps from nearly the same place', () => {
    const view = viewOf(doc);
    view.dispatch({ selection: EditorSelection.cursor(10) });
    pushJump(view);
    pushJump(view);

    jumpBack(view);
    expect(jumpBack(view)).toBe(false);
    view.destroy();
  });
});

describe('a jump that did not happen', () => {
  it('leaves no trace in either direction', () => {
    // Pressing "next heading" at the last heading must not quietly become a
    // forward entry pointing at a place the reader never visited.
    const view = viewOf(doc);
    view.dispatch({ selection: EditorSelection.cursor(5) });

    pushJump(view);
    cancelJump(view);

    expect(jumpBack(view)).toBe(false);
    expect(jumpForward(view)).toBe(false);
    view.destroy();
  });
});

describe('following the text as it changes', () => {
  it('comes back to the same words after an edit above them', () => {
    const view = viewOf(doc);
    const start = doc.indexOf('second section');
    view.dispatch({ selection: EditorSelection.cursor(start) });
    pushJump(view);
    view.dispatch({ selection: EditorSelection.cursor(doc.length - 2) });

    // Insert text before the recorded position.
    const inserted = 'a new opening paragraph\n\n';
    view.dispatch({ changes: { from: 0, insert: inserted }, userEvent: 'input.type' });

    jumpBack(view);
    const landed = view.state.selection.main.head;
    expect(view.state.doc.sliceString(landed, landed + 14)).toBe('second section');
    view.destroy();
  });
});
