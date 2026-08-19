import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { markdownSupport } from '../src/lib/editor/markdownLang';
import {
  buildInlineForRange,
  documentDir,
  editingField,
  setEditing,
  type Built
} from '../src/lib/editor/livePreview';
import {
  BulletWidget,
  CheckboxWidget,
  FenceChipWidget,
  HrWidget,
  ImageWidget
} from '../src/lib/editor/livePreview/widgets';

/**
 * These exercise the rendering rules directly: the same builder the view
 * plugin uses, without needing a laid-out browser view.
 */
function build(doc: string, options: { editing?: boolean; cursor?: number } = {}): Built {
  let state = EditorState.create({
    doc,
    extensions: [markdownSupport(), editingField, documentDir.of('/docs')]
  });

  if (options.cursor !== undefined) {
    state = state.update({ selection: { anchor: options.cursor } }).state;
  }
  if (options.editing) {
    state = state.update({ effects: setEditing.of(true) }).state;
  }

  return buildInlineForRange(state, 0, doc.length);
}

/** Replaced (concealed or widget-substituted) ranges. */
function hidden(built: Built): [number, number][] {
  return built.atomics.map((r) => [r.from, r.to]);
}

/** Individual class tokens — a decoration may carry several at once. */
function classes(built: Built): string[] {
  return built.decorations.flatMap((r) => {
    const cls = (r.value.spec as { class?: string }).class;
    return cls ? cls.split(/\s+/) : [];
  });
}

function widgets(built: Built): unknown[] {
  return built.decorations
    .map((r) => (r.value.spec as { widget?: unknown }).widget)
    .filter(Boolean);
}

describe('headings', () => {
  it('conceals the hash marks and styles the line', () => {
    const built = build('# Title\n');
    expect(hidden(built)).toContainEqual([0, 2]); // "# " including the space
    expect(classes(built)).toContain('md-h1');
  });

  it('keeps the line styled at every level', () => {
    expect(classes(build('### Third\n'))).toContain('md-h3');
    expect(classes(build('###### Sixth\n'))).toContain('md-h6');
  });
});

describe('reveal on the active line', () => {
  const doc = '# Title\n\nsome **bold** text\n';

  it('hides syntax while the document is only being read', () => {
    expect(hidden(build(doc, { cursor: 0 }))).toContainEqual([0, 2]);
  });

  it('reveals the caret line once the user starts editing', () => {
    const built = build(doc, { editing: true, cursor: 2 });
    expect(hidden(built)).not.toContainEqual([0, 2]);
    expect(classes(built)).toContain('md-h1'); // styling stays, so nothing jumps
  });

  it('leaves other lines rendered while one line is revealed', () => {
    const built = build(doc, { editing: true, cursor: 2 });
    const boldFrom = doc.indexOf('**');
    expect(hidden(built)).toContainEqual([boldFrom, boldFrom + 2]);
  });
});

describe('inline emphasis', () => {
  it('marks and conceals bold, italic, strike and code', () => {
    expect(classes(build('**b**\n'))).toContain('md-bold');
    expect(classes(build('*i*\n'))).toContain('md-italic');
    expect(classes(build('~~s~~\n'))).toContain('md-strike');
    expect(classes(build('`c`\n'))).toContain('md-code');
    // Each marker pair is concealed.
    expect(hidden(build('**b**\n'))).toEqual(
      expect.arrayContaining([
        [0, 2],
        [3, 5]
      ])
    );
  });
});

describe('links', () => {
  it('shows only the label of an inline link', () => {
    const doc = '[label](https://x.dev)\n';
    const built = build(doc);
    expect(classes(built)).toContain('md-link');
    // The URL and both bracket groups are concealed, the label survives.
    const concealed = hidden(built);
    expect(concealed).toContainEqual([0, 1]);
    expect(concealed.some(([from, to]) => doc.slice(from, to).includes('https://x.dev'))).toBe(
      true
    );
  });

  it('never conceals a bare autolink, which is its own text', () => {
    const built = build('see https://x.dev now\n');
    expect(hidden(built)).toHaveLength(0);
  });
});

describe('block elements', () => {
  it('renders list bullets as a glyph', () => {
    const built = build('- item\n');
    expect(widgets(built).some((w) => w instanceof BulletWidget)).toBe(true);
  });

  it('keeps ordered list numbers visible', () => {
    const built = build('1. item\n');
    expect(classes(built)).toContain('md-li-num');
    expect(hidden(built)).toHaveLength(0);
  });

  it('renders task markers as checkboxes and strikes done items', () => {
    const done = build('- [x] done\n');
    const checkbox = widgets(done).find((w) => w instanceof CheckboxWidget) as CheckboxWidget;
    expect(checkbox?.checked).toBe(true);
    expect(classes(done)).toContain('md-task-done');

    const open = build('- [ ] todo\n');
    const unchecked = widgets(open).find((w) => w instanceof CheckboxWidget) as CheckboxWidget;
    expect(unchecked?.checked).toBe(false);
    expect(classes(open)).not.toContain('md-task-done');
  });

  it('styles quotes and conceals the marker', () => {
    const built = build('> quoted\n');
    expect(classes(built)).toContain('md-quote');
    expect(hidden(built)).toContainEqual([0, 2]);
  });

  it('replaces a horizontal rule with a drawn line', () => {
    expect(widgets(build('---\n\ntext\n')).some((w) => w instanceof HrWidget)).toBe(true);
  });

  it('gives fenced code a panel and a language chip', () => {
    const built = build('```ts\nconst a = 1;\n```\n');
    expect(classes(built)).toContain('md-codeblock-line');
    expect(classes(built)).toContain('md-codeblock-first');
    const chip = widgets(built).find((w) => w instanceof FenceChipWidget) as FenceChipWidget;
    expect(chip?.language).toBe('ts');
  });

  it('renders images and resolves them against the document folder', () => {
    const built = build('![alt](img/a.png)\n');
    const image = widgets(built).find((w) => w instanceof ImageWidget) as ImageWidget;
    expect(image?.alt).toBe('alt');
    expect(image?.url).toBe('img/a.png');
    expect(image?.baseDir).toBe('/docs');
  });
});

describe('raw HTML', () => {
  it('is shown as text, never rendered', () => {
    const built = build('<script>alert(1)</script>\n');
    expect(classes(built)).toContain('md-html');
    // Nothing is turned into a widget that could execute.
    expect(widgets(built)).toHaveLength(0);
  });
});
