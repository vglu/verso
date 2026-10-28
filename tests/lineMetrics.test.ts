import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * CodeMirror's height map does not include vertical margins on `.cm-line` or
 * on block widgets. A heading + code-block gap of ~2em, or a table's 0.8em
 * margin, made a click land one or more lines further down.
 */
describe('cm-line vertical metrics', () => {
  it('does not put vertical margins on .cm-line', () => {
    const css = readFileSync('src/styles/markdown.css', 'utf8');
    const blocks = [...css.matchAll(/\.cm-line[^{]*\{[^}]+\}/g)].map((m) => m[0]);
    expect(blocks.length).toBeGreaterThan(5);
    for (const block of blocks) {
      expect(block).not.toMatch(/margin(?:-block|-top|-bottom)\s*:/);
    }
  });

  it('does not put vertical margins on block widgets', () => {
    const css = readFileSync('src/styles/markdown.css', 'utf8');
    for (const sel of ['.md-table-wrap', '.md-math-display', '.md-mermaid']) {
      const match = css.match(new RegExp(`${sel.replace('.', '\\.')}\\s*\\{[^}]+\\}`));
      expect(match, sel).toBeTruthy();
      expect(match![0]).not.toMatch(/margin(?:-block|-top|-bottom)?\s*:/);
    }
  });

  it('remasures the editor when an image finishes loading', () => {
    const src = readFileSync('src/lib/editor/livePreview/widgets.ts', 'utf8');
    expect(src).toMatch(/img\.addEventListener\('load',\s*remasure\)/);
    expect(src).toMatch(/view\.requestMeasure\(\)/);
    expect(src).toMatch(/img\.complete && img\.naturalHeight > 0/);
  });
});
