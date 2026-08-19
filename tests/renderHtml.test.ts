import { describe, expect, it } from 'vitest';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { markdownSupport } from '../src/lib/editor/markdownLang';
import { renderDocumentHtml } from '../src/lib/export/renderHtml';

/**
 * What a document becomes when it leaves.
 *
 * Exporting is the one moment the editor turns Markdown into something else,
 * so this is where the rendering has to agree with what the screen showed —
 * and where anything a document can carry must not become executable.
 */
function html(markdown: string, options = {}): string {
  const state = EditorState.create({ doc: markdown, extensions: [markdownSupport()] });
  ensureSyntaxTree(state, markdown.length, 5000);
  return renderDocumentHtml(state, options);
}

describe('the shape of a document', () => {
  it('renders headings at their level', () => {
    expect(html('# One\n\n## Two\n')).toContain('<h1>One</h1>');
    expect(html('# One\n\n## Two\n')).toContain('<h2>Two</h2>');
  });

  it('renders a setext heading like the hash form', () => {
    expect(html('Title\n=====\n')).toContain('<h1>Title</h1>');
  });

  it('renders paragraphs and inline marks', () => {
    const out = html('Some **bold**, some *italic*, some `code`, some ~~gone~~.\n');
    expect(out).toContain('<strong>bold</strong>');
    expect(out).toContain('<em>italic</em>');
    expect(out).toContain('<code>code</code>');
    expect(out).toContain('<del>gone</del>');
  });

  it('renders quotes and rules', () => {
    expect(html('> quoted\n')).toContain('<blockquote>');
    expect(html('---\n')).toContain('<hr>');
  });

  it('renders both kinds of list, and keeps a numbered list’s first number', () => {
    expect(html('- one\n- two\n')).toContain('<ul>');
    expect(html('1. one\n2. two\n')).toContain('<ol>');
    expect(html('5. five\n6. six\n')).toContain('<ol start="5">');
  });

  it('renders task items as checkboxes that cannot be clicked', () => {
    const out = html('- [x] done\n- [ ] not done\n');
    expect(out).toContain('<input type="checkbox" disabled checked>');
    expect(out).toContain('<input type="checkbox" disabled>');
  });

  it('renders a table, keeping the alignment the author asked for', () => {
    // `:-` is left alignment stated on purpose, not the absence of one, so it
    // survives into the export.
    const out = html('| a | b |\n| :- | --: |\n| 1 | 2 |\n');
    expect(out).toContain('<th style="text-align:left">a</th>');
    expect(out).toContain('<td style="text-align:right">2</td>');
  });

  it('leaves a column alone when no alignment was asked for', () => {
    const out = html('| a | b |\n| --- | --- |\n| 1 | 2 |\n');
    expect(out).toContain('<th>a</th>');
  });

  it('renders fenced code with its language, escaped', () => {
    const out = html('```ts\nconst x = 1 < 2;\n```\n');
    expect(out).toContain('<code class="language-ts">');
    expect(out).toContain('const x = 1 &lt; 2;');
  });

  it('leaves front matter out of the document', () => {
    const out = html('---\ntitle: Notes\n---\n\n# Real\n');
    expect(out).not.toContain('title: Notes');
    expect(out).toContain('<h1>Real</h1>');
  });
});

describe('links and pictures', () => {
  it('renders a link and its text', () => {
    expect(html('[text](https://example.com)\n')).toContain(
      '<a href="https://example.com">text</a>'
    );
  });

  it('renders an image with its alt text', () => {
    expect(html('![a cat](cat.png)\n')).toContain('<img src="cat.png" alt="a cat">');
  });

  it('lets the caller rewrite an image source', () => {
    const out = html('![x](cat.png)\n', { image: () => 'data:image/png;base64,AAAA' });
    expect(out).toContain('src="data:image/png;base64,AAAA"');
  });

  it('renders a bare autolink', () => {
    expect(html('<https://example.com>\n')).toContain('href="https://example.com"');
  });
});

describe('nothing a document carries may run', () => {
  it('shows raw HTML as text', () => {
    const out = html('<script>alert(1)</script>\n');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });

  it('shows an inline tag as text', () => {
    expect(html('a <b>bold</b> tag\n')).toContain('&lt;b&gt;');
  });

  it('refuses a javascript: link', () => {
    const out = html('[click](javascript:alert(1))\n');
    expect(out).not.toContain('javascript:');
  });

  it('escapes what people type', () => {
    expect(html('5 < 6 & "quoted"\n')).toContain('5 &lt; 6 &amp; &quot;quoted&quot;');
  });
});

describe('formulas and diagrams', () => {
  const math = (formula: string, display: boolean) =>
    `<span data-display="${display}">${formula}</span>`;

  it('renders an inline formula through the caller', () => {
    const out = html('mass is $E = mc^2$ here\n', { math });
    expect(out).toContain('<span data-display="false">E = mc^2</span>');
  });

  it('renders a display formula through the caller', () => {
    const out = html('$$\nE = mc^2\n$$\n', { math });
    expect(out).toContain('math-display');
    expect(out).toContain('data-display="true"');
  });

  it('does not mistake money for mathematics', () => {
    const out = html('It costs $5 and $7 today.\n', { math });
    expect(out).not.toContain('data-display');
    expect(out).toContain('$5 and $7');
  });

  it('leaves a formula as source when nothing can render it', () => {
    expect(html('$$\nx^2\n$$\n')).toContain('math-source');
  });

  it('renders a mermaid fence through the caller', () => {
    const out = html('```mermaid\ngraph TD;\nA-->B;\n```\n', {
      diagram: () => '<svg id="d"></svg>'
    });
    expect(out).toContain('<figure class="diagram"><svg id="d"></svg></figure>');
  });

  it('falls back to code when a diagram cannot be drawn', () => {
    const out = html('```mermaid\ngraph TD;\n```\n', { diagram: () => null });
    expect(out).toContain('<code class="language-mermaid">');
  });
});
