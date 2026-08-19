import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdownSupport } from '../src/lib/editor/markdownLang';
import { livePreview } from '../src/lib/editor/livePreview';
import { editingField } from '../src/lib/editor/livePreview/editing';

/**
 * Typing through an input method.
 *
 * An IME builds a word over several keystrokes, and a transaction dispatched
 * between them tears down the composition the browser is holding — the
 * half-formed word disappears. The reveal that a keystroke would have caused
 * therefore waits for the composition to finish, which is what this covers.
 *
 * The guard itself (`view.composing`) cannot be exercised here: jsdom has no
 * real input method, and CodeMirror's composition tracking never engages from
 * a synthetic event. What is testable is that the end of a composition is not
 * a dead end — that the document does become editable afterwards.
 */
function viewOf(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return new EditorView({
    parent,
    state: EditorState.create({ doc, extensions: [markdownSupport(), livePreview()] })
  });
}

describe('composition', () => {
  it('starts editing when a composition finishes', () => {
    const view = viewOf('**hi**\n');
    expect(view.state.field(editingField, false)).toBe(false);

    view.contentDOM.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));

    expect(view.state.field(editingField, false)).toBe(true);
    view.destroy();
  });

  it('does not fire a second time once editing has begun', () => {
    const view = viewOf('**hi**\n');
    let updates = 0;
    view.dispatch({ effects: [] });

    view.contentDOM.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    const after = view.state;
    view.contentDOM.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    updates = view.state === after ? 0 : 1;

    expect(updates).toBe(0);
    view.destroy();
  });
});
