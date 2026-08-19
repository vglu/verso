import { describe, it } from 'vitest';
import { EditorSelection, EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { markdownSupport } from '../src/lib/editor/markdownLang';
import { documentDir, livePreview, scanBlocksForTest } from '../src/lib/editor/livePreview';

function makeDoc(targetBytes: number): string {
  const chunk = [
    '## Section heading',
    '',
    'Some **bold** and *italic* text with `code` and a [link](https://example.com) in it.',
    '',
    '| col a | col b | col c |',
    '| ----- | ----- | ----- |',
    '| 1     | 2     | 3     |',
    '| 4     | 5     | 6     |',
    '',
    '```ts',
    'const value = compute(1, 2);',
    '```',
    '',
    '- item one',
    '- item two',
    '',
    '$$',
    'E = mc^2',
    '$$',
    ''
  ].join('\n');
  let out = '';
  while (out.length < targetBytes) out += chunk;
  return out;
}

function ms(fn: () => void): number {
  const t = performance.now();
  fn();
  return performance.now() - t;
}

describe('perf probe 3', () => {
  for (const kb of [200, 400, 200]) {
    it(`doc ~${kb}KB diagnostics`, () => {
      const doc = makeDoc(kb * 1024);
      const state = EditorState.create({
        doc,
        extensions: [markdownSupport(), livePreview(), documentDir.of('/docs')]
      });

      let s = state;
      const rows: string[] = [];
      for (let i = 0; i < 6; i++) {
        const before = syntaxTree(s);
        const beforeLen = before.length;
        const t = ms(() => (s = s.update({ selection: EditorSelection.cursor(1000 + i) }).state));
        const after = syntaxTree(s);
        rows.push(
          `${t.toFixed(1)}ms treeChanged=${after !== before} len ${beforeLen}->${after.length}`
        );
      }
      console.log(`${kb}KB docLen=${doc.length}\n  ` + rows.join('\n  '));
      console.log(`  bare scanBlocks now: ${ms(() => scanBlocksForTest(s)).toFixed(1)}ms`);
    });
  }
});
