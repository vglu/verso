import { describe, expect, it, vi } from 'vitest';
import { parseFully } from './support/tree';
import { EditorState } from '@codemirror/state';
import { markdownSupport } from '../src/lib/editor/markdownLang';

/**
 * "Standalone" is the whole promise of the export: the file has to survive
 * being mailed, moved to a stick, or opened on a machine that has never heard
 * of this application. Anything it reaches out for is a way for it to arrive
 * broken.
 */
vi.mock('../src/lib/ipc/commands', () => ({
  readImageDataUri: vi.fn(async (path: string) => `data:image/png;base64,${path.length}`)
}));

const { buildStandaloneHtml } = await import('../src/lib/export/standalone');

function stateOf(doc: string): EditorState {
  return parseFully(EditorState.create({ doc, extensions: [markdownSupport()] }));
}

const options = { title: 'Notes', dir: 'C:/docs' };

describe('the exported page', () => {
  it('is a whole document with the title on it', async () => {
    const html = await buildStandaloneHtml(stateOf('# Hello\n'), options);

    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<title>Notes</title>');
    expect(html).toContain('<h1>Hello</h1>');
  });

  it('carries its stylesheet inside it', async () => {
    const html = await buildStandaloneHtml(stateOf('# Hello\n'), options);

    expect(html).toContain('<style>');
    expect(html).not.toContain('<link');
    expect(html).toContain('blockquote');
  });

  it('asks the network for nothing', async () => {
    const html = await buildStandaloneHtml(
      stateOf('# Hello\n\n$x^2$\n\n```mermaid\ngraph TD;\nA-->B;\n```\n'),
      options
    );

    // No stylesheet, script or font fetched from anywhere.
    expect(html).not.toMatch(/<script\b/i);
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/@import/i);
    expect(html).not.toMatch(/url\((['"]?)https?:/i);
  });

  it('draws formulas as MathML, which needs no font and no stylesheet', async () => {
    const html = await buildStandaloneHtml(stateOf('mass is $E = mc^2$ here\n'), options);
    expect(html).toContain('<math');
  });

  it('embeds a local picture', async () => {
    const html = await buildStandaloneHtml(stateOf('![cat](cat.png)\n'), options);
    expect(html).toContain('src="data:image/png;base64,');
  });

  it('leaves a remote picture where it is', async () => {
    const html = await buildStandaloneHtml(
      stateOf('![cat](https://example.com/cat.png)\n'),
      options
    );
    expect(html).toContain('src="https://example.com/cat.png"');
  });

  it('carries the reader’s text width', async () => {
    const html = await buildStandaloneHtml(stateOf('# x\n'), { ...options, pageWidth: 820 });
    expect(html).toContain('--page-width: 820px');
  });

  it('has a print stylesheet, because paper is the other half of exporting', async () => {
    const html = await buildStandaloneHtml(stateOf('# x\n'), options);
    expect(html).toContain('@media print');
    expect(html).toContain('@page');
  });
});
