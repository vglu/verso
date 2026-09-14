import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * CodeMirror's height map does not include vertical margins on `.cm-line`.
 * A heading + code-block gap of ~2em made a click on the first line of a
 * fence land two or three lines further down.
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
});
