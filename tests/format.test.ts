import { describe, expect, it } from 'vitest';
import { parseFully } from './support/tree';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdownSupport } from '../src/lib/editor/markdownLang';
import {
  formatStateAt,
  insertCodeBlock,
  insertRule,
  insertTable,
  setHeading,
  toggleList,
  toggleQuote
} from '../src/lib/editor/format';
import {
  blocksOf,
  moveBlockDown,
  moveBlockUp,
  nextBlock,
  nextHeading,
  prevBlock,
  selectBlock
} from '../src/lib/editor/blockNav';

function viewOf(doc: string, cursor = 0): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return new EditorView({
    parent,
    state: parseFully(
      EditorState.create({
        doc,
        selection: EditorSelection.cursor(cursor),
        extensions: [markdownSupport()]
      })
    )
  });
}

describe('block formatting', () => {
  it('applies and removes a heading level', () => {
    const view = viewOf('plain text', 2);
    setHeading(view, 2);
    expect(view.state.doc.toString()).toBe('## plain text');
    setHeading(view, 2);
    expect(view.state.doc.toString()).toBe('plain text');
    view.destroy();
  });

  it('replaces one heading level with another instead of stacking', () => {
    const view = viewOf('### deep', 4);
    setHeading(view, 1);
    expect(view.state.doc.toString()).toBe('# deep');
    view.destroy();
  });

  it('turns lines into each kind of list and back', () => {
    const view = viewOf('one', 1);
    toggleList(view, 'bullet');
    expect(view.state.doc.toString()).toBe('- one');
    toggleList(view, 'task');
    expect(view.state.doc.toString()).toBe('- [ ] one');
    toggleList(view, 'task');
    expect(view.state.doc.toString()).toBe('one');
    view.destroy();
  });

  it('numbers an ordered list across a multi-line selection', () => {
    const view = viewOf('a\nb\nc');
    view.dispatch({ selection: EditorSelection.range(0, 5) });
    toggleList(view, 'ordered');
    expect(view.state.doc.toString()).toBe('1. a\n2. b\n3. c');
    view.destroy();
  });

  it('toggles a quote', () => {
    const view = viewOf('said', 1);
    toggleQuote(view);
    expect(view.state.doc.toString()).toBe('> said');
    toggleQuote(view);
    expect(view.state.doc.toString()).toBe('said');
    view.destroy();
  });
});

describe('inserting blocks', () => {
  it('inserts a table with a delimiter row that parses', async () => {
    const { parseTable } = await import('../src/lib/editor/livePreview/table');
    const view = viewOf('');
    insertTable(view, 3, 2);

    const text = view.state.doc.toString();
    const table = text.trim();
    expect(parseTable(table)).not.toBeNull();
    expect(parseTable(table)!.header).toHaveLength(3);
    expect(parseTable(table)!.rows).toHaveLength(2);
    view.destroy();
  });

  it('wraps a selection in a fenced code block', () => {
    const view = viewOf('let a = 1');
    view.dispatch({ selection: EditorSelection.range(0, 9) });
    insertCodeBlock(view);
    expect(view.state.doc.toString()).toContain('```\nlet a = 1\n```');
    view.destroy();
  });

  it('inserts a horizontal rule on its own line', () => {
    const view = viewOf('text', 4);
    insertRule(view);
    expect(view.state.doc.toString()).toContain('\n---\n');
    view.destroy();
  });
});

describe('format state under the caret', () => {
  it('reports the heading level and list kind', () => {
    const view = viewOf('## title\n- [ ] task', 3);
    expect(formatStateAt(view.state).heading).toBe(2);

    view.dispatch({ selection: EditorSelection.cursor(15) });
    const state = formatStateAt(view.state);
    expect(state.task).toBe(true);
    expect(state.heading).toBe(0);
    view.destroy();
  });
});

describe('block navigation', () => {
  const doc = '# Title\n\nFirst paragraph.\n\nSecond paragraph.\n\n## Section\n\nThird.';

  it('sees each top-level block', () => {
    const view = viewOf(doc);
    const names = blocksOf(view.state).map((b) => b.name);
    expect(names.filter((n) => n === 'Paragraph')).toHaveLength(3);
    expect(names.filter((n) => n.startsWith('ATXHeading'))).toHaveLength(2);
    view.destroy();
  });

  it('moves forward one block at a time', () => {
    const view = viewOf(doc, 0);
    nextBlock(view);
    expect(view.state.doc.sliceString(view.state.selection.main.head, 999)).toMatch(/^First/);
    nextBlock(view);
    expect(view.state.doc.sliceString(view.state.selection.main.head, 999)).toMatch(/^Second/);
    view.destroy();
  });

  it('goes to the start of the current block before leaving it', () => {
    const startOfSecond = doc.indexOf('Second paragraph.');
    const view = viewOf(doc, startOfSecond + 6);
    prevBlock(view);
    expect(view.state.selection.main.head).toBe(startOfSecond);
    prevBlock(view);
    expect(view.state.selection.main.head).toBe(doc.indexOf('First paragraph.'));
    view.destroy();
  });

  it('jumps between headings only', () => {
    const view = viewOf(doc, 0);
    nextHeading(view);
    expect(view.state.selection.main.head).toBe(doc.indexOf('## Section'));
    view.destroy();
  });

  it('selects the block the caret is in', () => {
    const view = viewOf(doc, doc.indexOf('First paragraph.') + 3);
    selectBlock(view);
    const { from, to } = view.state.selection.main;
    expect(view.state.doc.sliceString(from, to)).toBe('First paragraph.');
    view.destroy();
  });

  it('swaps a block with its neighbour, keeping the blank line between', () => {
    const view = viewOf(doc, doc.indexOf('Second paragraph.') + 2);
    moveBlockUp(view);
    const text = view.state.doc.toString();
    expect(text.indexOf('Second paragraph.')).toBeLessThan(text.indexOf('First paragraph.'));
    expect(text).toContain('Second paragraph.\n\nFirst paragraph.');

    moveBlockDown(view);
    expect(view.state.doc.toString()).toBe(doc);
    view.destroy();
  });
});
