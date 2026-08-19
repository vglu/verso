import { describe, expect, it } from 'vitest';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdownSupport } from '../src/lib/editor/markdownLang';
import { foldableSection, markdownFolding, toggleSectionAt } from '../src/lib/editor/folding';

/**
 * What a heading owns. A section runs to the next heading of the same rank or
 * higher — that is what "this section" means to a reader, and it is the only
 * unit worth collapsing.
 */
function stateOf(doc: string): EditorState {
  const state = EditorState.create({ doc, extensions: [markdownSupport()] });
  // The parser is lazy; folding asks about lines anywhere in the document.
  ensureSyntaxTree(state, doc.length, 5000);
  return state;
}

function foldAtLine(doc: string, lineNumber: number): string | null {
  const state = stateOf(doc);
  const line = state.doc.line(lineNumber);
  const range = foldableSection(state, line.from, line.to);
  return range ? state.doc.sliceString(range.from, range.to) : null;
}

const doc = [
  '# Title', // 1
  '', // 2
  'Intro paragraph.', // 3
  '', // 4
  '## First', // 5
  '', // 6
  'Body of the first section.', // 7
  '', // 8
  '### Nested', // 9
  '', // 10
  'Deeper text.', // 11
  '', // 12
  '## Second', // 13
  '', // 14
  'Body of the second section.', // 15
  ''
].join('\n');

describe('which lines fold', () => {
  it('folds a section down to the next heading of the same rank', () => {
    const folded = foldAtLine(doc, 5);
    expect(folded).toContain('Body of the first section.');
    expect(folded).toContain('Deeper text.');
    expect(folded).not.toContain('## Second');
  });

  it('lets a deeper heading fold only its own part', () => {
    const folded = foldAtLine(doc, 9);
    expect(folded).toContain('Deeper text.');
    expect(folded).not.toContain('Body of the first section.');
  });

  it('folds the whole document under its title', () => {
    const folded = foldAtLine(doc, 1);
    expect(folded).toContain('## Second');
  });

  it('leaves the blank line between sections outside the fold', () => {
    expect(foldAtLine(doc, 5)?.endsWith('\n')).toBe(false);
  });

  it('offers nothing on an ordinary paragraph', () => {
    expect(foldAtLine(doc, 3)).toBeNull();
  });

  it('offers nothing on a heading with nothing under it', () => {
    expect(foldAtLine('# One\n## Two\n', 2)).toBeNull();
  });
});

describe('folding it, in a real view', () => {
  function viewOf(text: string): EditorView {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({ doc: text, extensions: [markdownSupport(), markdownFolding()] })
    });
    ensureSyntaxTree(view.state, text.length, 5000);
    return view;
  }

  it('offers a chevron on foldable headings and nowhere else', () => {
    const view = viewOf(doc);
    // Four headings, of which every one has something under it.
    expect(view.dom.querySelectorAll('.md-fold')).toHaveLength(4);
    view.destroy();
  });

  it('hides the section and turns the chevron', () => {
    const view = viewOf(doc);
    const heading = view.state.doc.line(5).from;

    expect(toggleSectionAt(view, heading)).toBe(true);
    expect(view.dom.querySelectorAll('.md-fold-closed')).toHaveLength(1);
    expect(view.dom.textContent).not.toContain('Body of the first section.');
    // The text is hidden, not deleted.
    expect(view.state.doc.toString()).toBe(doc);
    view.destroy();
  });

  it('brings it back', () => {
    const view = viewOf(doc);
    const heading = view.state.doc.line(5).from;

    toggleSectionAt(view, heading);
    toggleSectionAt(view, heading);

    expect(view.dom.querySelectorAll('.md-fold-closed')).toHaveLength(0);
    expect(view.dom.textContent).toContain('Body of the first section.');
    view.destroy();
  });

  it('does nothing on a line with no section under it', () => {
    const view = viewOf(doc);
    expect(toggleSectionAt(view, view.state.doc.line(3).from)).toBe(false);
    view.destroy();
  });
});

describe('what is not a heading', () => {
  it('ignores a hash inside a fenced code block', () => {
    // Folding "the section" from here would swallow the rest of the file.
    const withFence = ['# Real', '', '```sh', '# not a heading', 'echo hi', '```', '', 'After', ''];
    expect(foldAtLine(withFence.join('\n'), 4)).toBeNull();
  });

  it('folds a list item that has something under it', () => {
    const list = ['- parent', '  - child one', '  - child two', '', 'After', ''].join('\n');
    const folded = foldAtLine(list, 1);
    expect(folded).toContain('child one');
    expect(folded).toContain('child two');
    expect(folded).not.toContain('After');
  });

  it('offers nothing on a list item that stands alone', () => {
    expect(foldAtLine('- one\n- two\n', 1)).toBeNull();
  });
});
