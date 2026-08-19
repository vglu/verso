import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdownSupport } from '../src/lib/editor/markdownLang';
import { livePreview } from '../src/lib/editor/livePreview';
import { setEditing } from '../src/lib/editor/livePreview/editing';
import { stepDownIntoBlock, stepUpIntoBlock } from '../src/lib/editor/blockNav';

/**
 * Pressing an arrow key must never send the reader somewhere else in the
 * document.
 *
 * Stepping into a rendered block is the one case where the arrow keys are
 * intercepted, and the rule for it has to be a question about the text — is
 * the next line inside a block? — rather than a question about the layout.
 * Layout is not always available to answer: the first keystroke is also what
 * turns rendering on, and the geometry it produces has not been measured yet.
 * A wrong answer there used to throw the caret to the first table in the file.
 */
function viewOf(doc: string, at: number): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection: EditorSelection.cursor(at),
      extensions: [markdownSupport(), livePreview()]
    })
  });
  ensureSyntaxTree(view.state, doc.length, 5000);
  // The document is only rendered once it has been touched.
  view.dispatch({ effects: setEditing.of(true) });
  return view;
}

const withTable = [
  '# Title',
  '',
  '| a | b |',
  '| - | - |',
  '| 1 | 2 |',
  '',
  'Paragraph one.',
  '',
  'Paragraph two.',
  '',
  'The last line.',
  ''
].join('\n');

describe('the arrow keys near a rendered block', () => {
  it('does not intervene between two ordinary lines', () => {
    const view = viewOf(withTable, view0(withTable, 9));
    expect(stepUpIntoBlock(view)).toBe(false);
    view.destroy();
  });

  it('leaves the very last line alone', () => {
    // The reported bug: standing at the end of a document and pressing Up
    // landed somewhere unrelated, because the answer came from geometry that
    // had not been measured.
    const view = viewOf(withTable, withTable.length);
    const before = view.state.selection.main.head;

    expect(stepUpIntoBlock(view)).toBe(false);
    expect(view.state.selection.main.head).toBe(before);
    view.destroy();
  });

  it('steps into the table from the line above it', () => {
    const view = viewOf(withTable, view0(withTable, 2));
    expect(stepDownIntoBlock(view)).toBe(true);

    const line = view.state.doc.lineAt(view.state.selection.main.head).number;
    expect(line).toBe(3);
    view.destroy();
  });

  it('steps into the table from the line below it', () => {
    const view = viewOf(withTable, view0(withTable, 6));
    expect(stepUpIntoBlock(view)).toBe(true);

    const line = view.state.doc.lineAt(view.state.selection.main.head).number;
    expect(line).toBe(5);
    view.destroy();
  });

  it('stays out of the way once the caret is inside the block', () => {
    const view = viewOf(withTable, view0(withTable, 4));
    expect(stepUpIntoBlock(view)).toBe(false);
    expect(stepDownIntoBlock(view)).toBe(false);
    view.destroy();
  });
});

describe('a real document, at its end', () => {
  it('does not jump to a table elsewhere in the file', () => {
    const doc = readFileSync(join(process.cwd(), 'tests/fixtures/real-doc.md'), 'utf8');
    const view = viewOf(doc, doc.length);
    const before = view.state.selection.main.head;

    stepUpIntoBlock(view);

    const moved = Math.abs(view.state.selection.main.head - before);
    expect(moved).toBe(0);
    view.destroy();
  });
});

/** Offset of the start of a 1-based line, for readable test positions. */
function view0(doc: string, line: number): number {
  return doc.split('\n').slice(0, line - 1).join('\n').length + (line > 1 ? 1 : 0);
}
