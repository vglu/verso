import { describe, expect, it } from 'vitest';
import { parseFully } from './support/tree';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdownSupport } from '../src/lib/editor/markdownLang';
import { documentDir, livePreview, renderedBlocks } from '../src/lib/editor/livePreview';
import { setEditing } from '../src/lib/editor/livePreview/editing';
import { createEditor } from '../src/lib/editor/createEditor';

/**
 * A freshly opened document is frozen: nothing reveals until the user works
 * in it. The bug this guards is the transaction that *starts* editing being
 * ignored, so the first click revealed nothing and only a later, unrelated
 * transaction repainted — "it opens on the second click".
 */
function viewOf(doc: string): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return new EditorView({
    parent,
    state: parseFully(
      EditorState.create({
        doc,
        extensions: [markdownSupport(), livePreview(), documentDir.of('/docs')]
      })
    )
  });
}

/** True when the block is drawn as a widget rather than shown as source. */
function blockIsRendered(view: EditorView): boolean {
  for (const set of view.state.facet(EditorView.decorations)) {
    const value = typeof set === 'function' ? set(view) : set;
    const iter = value.iter();
    while (iter.value) {
      const spec = iter.value.spec as { widget?: unknown; block?: boolean };
      if (spec.widget && spec.block && iter.to > iter.from) return true;
      iter.next();
    }
  }
  return false;
}

const doc = 'text\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\nmore\n';

describe('starting to edit', () => {
  it('leaves the document rendered until the user acts', () => {
    const view = viewOf(doc);
    view.dispatch({ selection: EditorSelection.cursor(doc.indexOf('| a') + 2) });
    expect(blockIsRendered(view)).toBe(true);
    view.destroy();
  });

  it('repaints on the very transaction that starts editing', () => {
    const view = viewOf(doc);
    // Caret first, then the effect — the order a click produces.
    view.dispatch({ selection: EditorSelection.cursor(doc.indexOf('| a') + 2) });
    view.dispatch({ effects: setEditing.of(true) });

    expect(blockIsRendered(view)).toBe(false);
    view.destroy();
  });

  it('repaints when both arrive together', () => {
    const view = viewOf(doc);
    view.dispatch({
      selection: EditorSelection.cursor(doc.indexOf('| a') + 2),
      effects: setEditing.of(true)
    });

    expect(blockIsRendered(view)).toBe(false);
    view.destroy();
  });

  it('freezes again when the document loses focus', () => {
    const view = viewOf(doc);
    view.dispatch({
      selection: EditorSelection.cursor(doc.indexOf('| a') + 2),
      effects: setEditing.of(true)
    });
    view.dispatch({ effects: setEditing.of(false) });

    expect(blockIsRendered(view)).toBe(true);
    view.destroy();
  });

  it('still finds the block either way', () => {
    const view = viewOf(doc);
    expect(renderedBlocks(view.state)).toHaveLength(1);
    view.destroy();
  });
});

describe('the toolbar declares its edits', () => {
  it('begins editing before it changes anything', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const handle = createEditor({ parent, doc: '# heading\n', dir: '/docs' });

    handle.beginEditing();
    handle.view.dispatch({ changes: { from: 0, insert: 'x' }, userEvent: 'input.format' });

    // With editing started, the caret's line shows its markers again.
    expect(handle.getContent()).toBe('x# heading\n');
    handle.destroy();
  });
});
