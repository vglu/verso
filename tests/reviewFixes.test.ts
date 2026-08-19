import { describe, expect, it } from 'vitest';
import { parseFully } from './support/tree';
import { EditorState } from '@codemirror/state';
import { markdownSupport } from '../src/lib/editor/markdownLang';
import { buildInlineForRange, documentDir, editingField } from '../src/lib/editor/livePreview';
import { ImageWidget } from '../src/lib/editor/livePreview/widgets';
import { MathWidget } from '../src/lib/editor/livePreview/richWidgets';

/**
 * Defects found by an outside review of the rendering layer, each verified
 * against real Markdown before being fixed.
 */
function build(doc: string) {
  const state = parseFully(
    EditorState.create({
      doc,
      extensions: [markdownSupport(), editingField, documentDir.of('/docs')]
    })
  );
  return buildInlineForRange(state, 0, doc.length);
}

function widgets(doc: string): unknown[] {
  return build(doc)
    .decorations.map((r) => (r.value.spec as { widget?: unknown }).widget)
    .filter(Boolean);
}

function hiddenText(doc: string): string[] {
  return build(doc).atomics.map((r) => doc.slice(r.from, r.to));
}

describe('a dollar sign in prose is money, not mathematics', () => {
  it('leaves two prices on one line alone', () => {
    expect(widgets('It costs $5 and $7 today.\n')).toHaveLength(0);
    expect(widgets('Pay $9.99 now, or $19.99 later.\n')).toHaveLength(0);
  });

  it('still renders a real formula', () => {
    const found = widgets('mass is $E = mc^2$ exactly\n').filter((w) => w instanceof MathWidget);
    expect(found).toHaveLength(1);
    expect((found[0] as MathWidget).formula).toBe('E = mc^2');
  });

  it('requires the closing dollar to end the formula, not start a word', () => {
    // "$x$5" would be a formula followed by a digit — that is prose.
    expect(widgets('give me $x$5 please\n')).toHaveLength(0);
  });

  it('treats an escaped dollar as text', () => {
    expect(widgets('costs \\$5 and \\$7\n')).toHaveLength(0);
  });

  it('handles several formulas on one line', () => {
    expect(widgets('$a$ and $b$\n').filter((w) => w instanceof MathWidget)).toHaveLength(2);
  });
});

describe('reference links', () => {
  it('hides the reference label instead of leaking it into the text', () => {
    const hidden = hiddenText('see [text][ref] here\n');
    expect(hidden.join('')).toContain('ref');
  });

  it('leaves a link definition line exactly as written', () => {
    // Half-concealing it used to delete the colon and keep the rest.
    expect(hiddenText('[ref]: https://example.com\n')).toHaveLength(0);
  });
});

describe('images', () => {
  it('renders a single-quoted title form', () => {
    const found = widgets("![a](b.png 'the title')\n").filter((w) => w instanceof ImageWidget);
    expect(found).toHaveLength(1);
    expect((found[0] as ImageWidget).url).toBe('b.png');
  });

  it('renders an angle-bracketed url containing a space', () => {
    const found = widgets('![a](<my file.png>)\n').filter((w) => w instanceof ImageWidget);
    expect(found).toHaveLength(1);
    expect((found[0] as ImageWidget).url).toBe('my file.png');
  });

  it('keeps the alt text when it contains brackets', () => {
    const found = widgets('![a [b] c](x.png)\n').filter((w) => w instanceof ImageWidget);
    expect(found).toHaveLength(1);
    expect((found[0] as ImageWidget).alt).toContain('[b]');
  });
});

describe('whitespace after a block marker', () => {
  it('swallows every space after a heading hash', () => {
    expect(hiddenText('#   spaced\n')).toContain('#   ');
  });

  it('swallows every space after a quote marker', () => {
    expect(hiddenText('>   quoted\n')).toContain('>   ');
  });
});
