import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { markdownSupport } from '../src/lib/editor/markdownLang';
import { frontmatterRange } from '../src/lib/editor/frontmatter';
import { extractOutline } from '../src/lib/editor/outline';
import { buildInlineForRange, livePreview } from '../src/lib/editor/livePreview';

function stateOf(doc: string): EditorState {
  return EditorState.create({ doc, extensions: [markdownSupport(), livePreview()] });
}

const withMatter = [
  '---',
  'title: Notes',
  'tags: [a, b]',
  '---',
  '',
  '# Real heading',
  '',
  'Text.',
  ''
].join('\n');

describe('recognising front matter', () => {
  it('finds the block a file opens with', () => {
    const state = stateOf(withMatter);
    const range = frontmatterRange(state)!;

    expect(state.doc.sliceString(range.from, range.to)).toBe(
      '---\ntitle: Notes\ntags: [a, b]\n---'
    );
  });

  it('accepts the YAML end marker too', () => {
    const state = stateOf('---\ntitle: x\n...\n\ntext\n');
    expect(frontmatterRange(state)).not.toBeNull();
  });

  it('is not front matter anywhere but the first line', () => {
    expect(frontmatterRange(stateOf('# Title\n\n---\ntitle: x\n---\n'))).toBeNull();
  });

  it('leaves an unclosed opener alone', () => {
    // Otherwise a document that begins with a horizontal rule turns grey to
    // the bottom.
    expect(frontmatterRange(stateOf('---\n\nJust a rule and some text.\n'))).toBeNull();
  });

  it('is not confused by a rule further down', () => {
    const state = stateOf(withMatter + '\n---\n\nAfter the rule\n');
    const range = frontmatterRange(state)!;
    expect(state.doc.lineAt(range.to).number).toBe(4);
  });
});

describe('what front matter must not become', () => {
  it('keeps its metadata out of the outline', () => {
    // `title: Notes` above a `---` parses as a setext heading, so the outline
    // of every note carrying metadata used to open with a line of it.
    const outline = extractOutline(stateOf(withMatter));
    expect(outline.map((i) => i.text)).toEqual(['Real heading']);
  });

  it('is styled as one block rather than a rule and a heading', () => {
    const built = buildInlineForRange(stateOf(withMatter), 0, withMatter.length);
    const classes = built.decorations
      .map((d) => (d.value.spec as { class?: string }).class ?? '')
      .filter((c) => c.includes('md-frontmatter'));

    expect(classes).toHaveLength(4);
    expect(classes[0]).toContain('md-frontmatter-first');
    expect(classes[3]).toContain('md-frontmatter-last');
  });

  it('leaves the document below it rendered normally', () => {
    const built = buildInlineForRange(stateOf(withMatter), 0, withMatter.length);
    const classes = built.decorations.map((d) => (d.value.spec as { class?: string }).class ?? '');
    expect(classes.some((c) => c.includes('md-h1'))).toBe(true);
  });
});
