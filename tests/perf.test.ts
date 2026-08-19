import { describe, expect, it } from 'vitest';
import { EditorSelection, EditorState } from '@codemirror/state';
import { markdownSupport } from '../src/lib/editor/markdownLang';
import { blocksRendered, livePreview, renderedBlocks } from '../src/lib/editor/livePreview';

/**
 * Guards the shape of the cost, not an absolute number.
 *
 * The block layer scans the whole document, so the danger is that a keystroke
 * starts costing time proportional to the file rather than to the edit. The
 * thresholds are deliberately loose — they exist to catch a regression that
 * reintroduces a forced parse or a per-line walk on the typing path, not to
 * measure the machine.
 */
function bigDocument(targetBytes: number): string {
  const chunk = [
    '## Section heading',
    '',
    'Some **bold** and *italic* text with `code` and a [link](https://example.com).',
    '',
    '| col a | col b |',
    '| --- | --- |',
    '| 1 | 2 |',
    '',
    '```ts',
    'const value = compute(1, 2);',
    '```',
    ''
  ].join('\n');

  let doc = '';
  while (doc.length < targetBytes) doc += chunk + '\n';
  return doc;
}

function stateOf(doc: string): EditorState {
  return EditorState.create({
    doc,
    selection: EditorSelection.cursor(doc.length),
    extensions: [markdownSupport(), livePreview()]
  });
}

/** Median milliseconds to apply one typed character. */
function medianKeystrokeMs(state: EditorState, samples = 15): number {
  const timings: number[] = [];
  let current = state;

  for (let i = 0; i < samples; i++) {
    const at = current.doc.length;
    const started = performance.now();
    current = current.update({
      changes: { from: at, insert: 'x' },
      selection: EditorSelection.cursor(at + 1),
      userEvent: 'input.type'
    }).state;
    timings.push(performance.now() - started);
  }

  timings.sort((a, b) => a - b);
  return timings[Math.floor(timings.length / 2)] ?? 0;
}

/** Median milliseconds to move the caret without changing the text. */
function medianCaretMs(state: EditorState, samples = 15): number {
  const timings: number[] = [];
  let current = state;

  for (let i = 0; i < samples; i++) {
    const at = (i * 977) % current.doc.length;
    const started = performance.now();
    current = current.update({ selection: EditorSelection.cursor(at) }).state;
    timings.push(performance.now() - started);
  }

  timings.sort((a, b) => a - b);
  return timings[Math.floor(timings.length / 2)] ?? 0;
}

describe('typing cost', () => {
  it('stays modest on a 200 KB document', () => {
    const median = medianKeystrokeMs(stateOf(bigDocument(200 * 1024)));
    expect(median).toBeLessThan(20);
  });

  it('does not grow in step with the document', () => {
    // Four times the text must not cost four times the keystroke. A forced
    // parse or a full line walk on the typing path shows up here immediately.
    const small = medianKeystrokeMs(stateOf(bigDocument(100 * 1024)));
    const large = medianKeystrokeMs(stateOf(bigDocument(400 * 1024)));

    expect(large).toBeLessThan(Math.max(small * 3 + 8, 40));
  });

  /**
   * The worst case measured is a document just under the block-scan limit:
   * every keystroke re-scans the whole of it. One frame is 16ms, so that is
   * the line this must not cross — past it, typing is visibly behind the
   * keyboard rather than merely expensive.
   */
  it('stays inside a frame on a document just under the scan limit', () => {
    const median = medianKeystrokeMs(stateOf(bigDocument(1024 * 1024)), 9);
    expect(median).toBeLessThan(16);
  });
});

describe('the point where blocks stop being rendered', () => {
  const table = '\n| a | b |\n| - | - |\n| 1 | 2 |\n';

  it('renders them on an ordinary document, and says so', () => {
    const state = stateOf(`${'filler\n'.repeat(100)}${table}`);
    expect(blocksRendered(state)).toBe(true);
    expect(renderedBlocks(state).length).toBe(1);
  });

  it('gives up past the limit — and admits it rather than going quiet', () => {
    // Silently leaving half a document as raw pipes reads as a broken
    // renderer; the status strip shows a badge driven by this flag.
    const state = stateOf(`${'filler line of text\n'.repeat(120000)}${table}`);
    expect(state.doc.length).toBeGreaterThan(2 * 1024 * 1024);
    expect(blocksRendered(state)).toBe(false);
    expect(renderedBlocks(state)).toEqual([]);
  });
});

describe('moving the caret', () => {
  /**
   * Moving the caret re-decorates but never re-scans, so its cost is set by
   * the screen rather than by the file. A change that makes this grow with the
   * document has put a whole-document walk on the movement path.
   */
  it('costs about the same whatever the document size', () => {
    const small = medianCaretMs(stateOf(bigDocument(100 * 1024)));
    const large = medianCaretMs(stateOf(bigDocument(800 * 1024)));

    expect(large).toBeLessThan(Math.max(small * 4 + 4, 10));
  });
});
