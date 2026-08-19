import { describe, expect, it } from 'vitest';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdownSupport } from '../src/lib/editor/markdownLang';
import {
  documentDir,
  livePreview,
  renderedBlocks,
  setEditing
} from '../src/lib/editor/livePreview';

/**
 * ADR-003: how a block opens under the caret.
 *
 * A block whose source is a *description* — a formula, a diagram, an image —
 * keeps its rendered result on screen while the source appears beside it. A
 * table's source is its content, so it is shown alone.
 */
function viewOf(doc: string, cursor?: number): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [markdownSupport(), livePreview(), documentDir.of('/docs')]
    })
  });
  if (cursor !== undefined) {
    // Reveal only starts once the reader actually works in the document, so a
    // bare selection change is not enough to open anything.
    view.dispatch({ selection: EditorSelection.cursor(cursor), effects: setEditing.of(true) });
  }
  return view;
}

/** Decorations that add something rather than replacing a range. */
function previewWidgetCount(view: EditorView): number {
  let count = 0;
  for (const set of view.state.facet(EditorView.decorations)) {
    const value = typeof set === 'function' ? set(view) : set;
    const iter = value.iter();
    while (iter.value) {
      const spec = iter.value.spec as { widget?: unknown; block?: boolean };
      // A preview sits at a single point after the block; a replacement spans it.
      if (spec.widget && spec.block && iter.from === iter.to) count += 1;
      iter.next();
    }
  }
  return count;
}

describe('an image on its own line is a block', () => {
  it('is scanned as one', () => {
    const view = viewOf('text\n\n![alt](pic.png)\n\nmore\n');
    const images = renderedBlocks(view.state).filter((b) => b.kind === 'image');
    expect(images).toHaveLength(1);
    expect(images[0]!.source).toBe('pic.png');
    expect(images[0]!.alt).toBe('alt');
    view.destroy();
  });

  it('but an image inside a sentence is not', () => {
    const view = viewOf('see ![alt](pic.png) here\n');
    expect(renderedBlocks(view.state).filter((b) => b.kind === 'image')).toHaveLength(0);
    view.destroy();
  });
});

describe('a generated block keeps its result while being edited', () => {
  const mathDoc = 'before\n\n$$\nE = mc^2\n$$\n\nafter\n';

  it('shows no separate preview while it is just rendered', () => {
    const view = viewOf(mathDoc, 0);
    expect(previewWidgetCount(view)).toBe(0);
    view.destroy();
  });

  it('adds the rendered result beneath the source once the caret is inside', () => {
    const view = viewOf(mathDoc, mathDoc.indexOf('E = mc^2') + 2);
    expect(previewWidgetCount(view)).toBe(1);
    view.destroy();
  });

  it('does the same for a diagram', () => {
    const doc = 'text\n\n```mermaid\ngraph TD\n  A-->B\n```\n\nmore\n';
    const view = viewOf(doc, doc.indexOf('graph TD') + 2);
    expect(previewWidgetCount(view)).toBe(1);
    view.destroy();
  });

  it('does not do it for a table, whose source is its content', () => {
    const doc = 'text\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\nmore\n';
    const view = viewOf(doc, doc.indexOf('| a | b |') + 2);
    expect(previewWidgetCount(view)).toBe(0);
    view.destroy();
  });
});
