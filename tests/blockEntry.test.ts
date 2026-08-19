import { describe, expect, it } from 'vitest';
import { parseFully } from './support/tree';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdownSupport } from '../src/lib/editor/markdownLang';
import { livePreview, renderedBlocks } from '../src/lib/editor/livePreview';
import { stepDownIntoBlock, stepUpIntoBlock } from '../src/lib/editor/blockNav';

/**
 * Reported from real use: standing above a table and pressing Down leapt the
 * whole table; standing below it and pressing Up leapt back over it. A block
 * widget has no visual lines inside it, so the caret has to be put in.
 */
const doc = [
  'Before the table.',
  '',
  '| A | B |',
  '| --- | --- |',
  '| 1 | 2 |',
  '| 3 | 4 |',
  '',
  'After the table.'
].join('\n');

const TABLE_FIRST_LINE = 3; // 1-based
const TABLE_LAST_LINE = 6;

function viewOf(cursorLine: number): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const state = parseFully(
    EditorState.create({
      doc,
      extensions: [markdownSupport(), livePreview()]
    })
  );
  const view = new EditorView({ parent, state });
  view.dispatch({ selection: EditorSelection.cursor(view.state.doc.line(cursorLine).from) });
  return view;
}

function lineOfCaret(view: EditorView): number {
  return view.state.doc.lineAt(view.state.selection.main.head).number;
}

describe('stepping into a rendered block', () => {
  it('recognises the table as a rendered block', () => {
    const view = viewOf(1);
    const blocks = renderedBlocks(view.state);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.kind).toBe('table');
    view.destroy();
  });

  it('Down from the line above lands on the first line of the table', () => {
    const view = viewOf(2); // the blank line before the table
    expect(stepDownIntoBlock(view)).toBe(true);
    expect(lineOfCaret(view)).toBe(TABLE_FIRST_LINE);
    view.destroy();
  });

  it('Up from the line below lands on the last line of the table', () => {
    const view = viewOf(7); // the blank line after the table
    expect(stepUpIntoBlock(view)).toBe(true);
    expect(lineOfCaret(view)).toBe(TABLE_LAST_LINE);
    view.destroy();
  });

  it('does not interfere once the caret is inside the table', () => {
    const view = viewOf(TABLE_FIRST_LINE);
    // Inside, the block shows its source, so ordinary line movement applies.
    expect(stepDownIntoBlock(view)).toBe(false);
    expect(stepUpIntoBlock(view)).toBe(false);
    view.destroy();
  });

  it('leaves ordinary lines alone', () => {
    const view = viewOf(1);
    // Line 2 is blank and not part of any block: default movement handles it.
    expect(stepDownIntoBlock(view)).toBe(false);
    view.destroy();
  });

  it('does nothing at the edges of the document', () => {
    const first = viewOf(1);
    expect(stepUpIntoBlock(first)).toBe(false);
    first.destroy();

    const last = viewOf(8);
    expect(stepDownIntoBlock(last)).toBe(false);
    last.destroy();
  });
});
