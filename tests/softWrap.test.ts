import { describe, expect, it } from 'vitest';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdownSupport } from '../src/lib/editor/markdownLang';
import { livePreview } from '../src/lib/editor/livePreview';
import { setEditing } from '../src/lib/editor/livePreview/editing';
import { parseViewFully } from './support/tree';

/**
 * A paragraph wrapped by hand is still one paragraph.
 *
 * A single newline inside a paragraph is a space in CommonMark, and every
 * renderer flows it as one. A live editor is tempted to disagree, because a
 * line of the file is a line of the screen — and so a document wrapped at
 * seventy-six columns was drawn as four short lines in a column wide enough
 * for two.
 *
 * What is asserted here is what the reader sees: the text of the rendered
 * line. Not the decoration set, which could be built correctly and still put
 * the words together wrongly.
 */

/**
 * A document that opens with a heading, and a caret resting on it.
 *
 * The caret has to be somewhere, and a caret inside a paragraph is precisely
 * the case where the source is supposed to show — so the tests would all be
 * measuring the exception. It sits on the heading unless a test says otherwise.
 */
function viewOf(body: string, caretAt = 0): EditorView {
  const doc = `# Title

${body}`;
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection: EditorSelection.cursor(caretAt),
      extensions: [markdownSupport(), livePreview()]
    })
  });
  parseViewFully(view);
  view.dispatch({ effects: setEditing.of(true) });
  return view;
}

/** What the reader would read off the screen, line by line. */
function rendered(view: EditorView): string[] {
  return [...view.contentDOM.querySelectorAll('.cm-line')].map((line) =>
    // CodeMirror pads an empty line with a zero-width space; it is not text.
    (line.textContent ?? '').replace(/\u200B/g, '')
  );
}

describe('a paragraph wrapped by hand', () => {
  it('is read as one line, with a space where the break was', () => {
    const view = viewOf(['The document behind the', 'screenshots in the README.', ''].join('\n'));

    expect(rendered(view)[2]).toBe('The document behind the screenshots in the README.');

    view.destroy();
  });

  it('leaves the file exactly as it was', () => {
    const body = ['One line,', 'and another.'].join('\n');
    const view = viewOf(body);

    expect(view.state.doc.toString()).toBe(`# Title\n\n${body}`);

    view.destroy();
  });

  it('puts the lines back while the caret is inside it', () => {
    const body = ['One line,', 'and another.'].join('\n');
    // Caret inside the paragraph, after the heading and the blank line.
    const view = viewOf(body, '# Title\n\n'.length + 3);
    // ADR-003: a block under the caret shows its source, and for a paragraph
    // the source is where its line breaks are, which is what the person
    // maintaining that wrapping is editing.
    // The caret is in the paragraph, so the heading is not: it stays rendered.
    expect(rendered(view)).toEqual(['Title', '', 'One line,', 'and another.']);

    view.destroy();
  });

  it('keeps a hard break, which was asked for on purpose', () => {
    // Two trailing spaces are CommonMark's hard break.
    const view = viewOf(['Address line one,  ', 'address line two.'].join('\n'));

    expect(rendered(view)).toEqual(['# Title', '', 'Address line one,  ', 'address line two.']);

    view.destroy();
  });

  it('keeps a backslash break too', () => {
    const view = viewOf(['Address line one,\\', 'address line two.'].join('\n'));

    expect(rendered(view)[2]).toContain('Address line one,');
    expect(rendered(view).length).toBeGreaterThan(3);

    view.destroy();
  });

  it('joins with exactly one space, whatever the wrapping left behind', () => {
    // Trailing single space on the first line, indentation on the second:
    // hand-wrapped text is full of both, and two spaces would show.
    const view = viewOf(['The first part, ', '   and the second.'].join('\n'));

    expect(rendered(view)[2]).toBe('The first part, and the second.');

    view.destroy();
  });

  it('does not reach across a blank line into the next paragraph', () => {
    const view = viewOf(['First paragraph.', '', 'Second paragraph.'].join('\n'));

    expect(rendered(view)).toEqual(['# Title', '', 'First paragraph.', '', 'Second paragraph.']);

    view.destroy();
  });

  it('leaves a block of code alone, where a line break is the content', () => {
    const view = viewOf(['```', 'const a = 1;', 'const b = 2;', '```'].join('\n'));

    const lines = rendered(view);
    expect(lines).toContain('const a = 1;');
    expect(lines).toContain('const b = 2;');

    view.destroy();
  });
});
