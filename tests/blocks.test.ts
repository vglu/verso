import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { markdownSupport } from '../src/lib/editor/markdownLang';
import {
  buildInlineForRange,
  documentDir,
  editingField,
  scanBlocksForTest
} from '../src/lib/editor/livePreview';
import { MathWidget } from '../src/lib/editor/livePreview/richWidgets';

function stateOf(doc: string): EditorState {
  return EditorState.create({
    doc,
    extensions: [markdownSupport(), editingField, documentDir.of('/docs')]
  });
}

describe('block scanning', () => {
  it('finds GFM tables', () => {
    const blocks = scanBlocksForTest(stateOf('| a | b |\n| - | - |\n| 1 | 2 |\n'));
    expect(blocks.map((b) => b.kind)).toEqual(['table']);
  });

  it('finds mermaid fences and keeps only the diagram body', () => {
    const blocks = scanBlocksForTest(stateOf('```mermaid\ngraph TD;\n  A-->B;\n```\n'));
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.kind).toBe('mermaid');
    expect(blocks[0]!.source).toBe('graph TD;\n  A-->B;');
  });

  it('leaves other fenced languages alone', () => {
    expect(scanBlocksForTest(stateOf('```ts\nconst a = 1;\n```\n'))).toHaveLength(0);
  });

  it('finds display math delimited by $$ lines', () => {
    const blocks = scanBlocksForTest(stateOf('text\n\n$$\nE = mc^2\n$$\n\nmore\n'));
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.kind).toBe('math');
    expect(blocks[0]!.source).toBe('E = mc^2');
  });

  it('ignores $$ inside a code fence', () => {
    const blocks = scanBlocksForTest(stateOf('```sh\n$$\necho hi\n$$\n```\n'));
    expect(blocks.filter((b) => b.kind === 'math')).toHaveLength(0);
  });

  it('ignores an unclosed display block', () => {
    expect(scanBlocksForTest(stateOf('$$\nE = mc^2\n'))).toHaveLength(0);
  });
});

describe('inline math', () => {
  function mathWidgets(doc: string): MathWidget[] {
    const built = buildInlineForRange(stateOf(doc), 0, doc.length);
    return built.decorations
      .map((r) => (r.value.spec as { widget?: unknown }).widget)
      .filter((w): w is MathWidget => w instanceof MathWidget);
  }

  it('renders $…$ as a formula', () => {
    const widgets = mathWidgets('mass is $E = mc^2$ exactly\n');
    expect(widgets).toHaveLength(1);
    expect(widgets[0]!.formula).toBe('E = mc^2');
    expect(widgets[0]!.display).toBe(false);
  });

  it('leaves a dollar sign in prose alone', () => {
    expect(mathWidgets('it costs $5 today\n')).toHaveLength(0);
  });

  it('never treats code as math', () => {
    expect(mathWidgets('use `$HOME` and `$PATH`\n')).toHaveLength(0);
    expect(mathWidgets('```sh\necho $A and $B\n```\n')).toHaveLength(0);
  });

  it('handles several formulas on one line', () => {
    expect(mathWidgets('$a$ and $b$\n')).toHaveLength(2);
  });
});
