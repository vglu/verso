import { describe, expect, it } from 'vitest';
import { EditorSelection, EditorState } from '@codemirror/state';
import { markdownSupport } from '../src/lib/editor/markdownLang';
import { livePreview } from '../src/lib/editor/livePreview';

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
});
