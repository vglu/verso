import { describe, it } from 'vitest';
import { EditorState, EditorSelection } from '@codemirror/state';
import { markdownSupport } from '../src/lib/editor/markdownLang';
import {
  buildInlineForRange,
  documentDir,
  editingField,
  setEditing
} from '../src/lib/editor/livePreview';
import { createEditor } from '../src/lib/editor/createEditor';

function stateOf(doc: string, sel = 0): EditorState {
  const s = EditorState.create({
    doc,
    extensions: [markdownSupport(), editingField, documentDir.of('/docs')],
    selection: EditorSelection.cursor(sel)
  });
  return s.update({ effects: setEditing.of(true) }).state;
}

/** Text as the reader sees it: source minus everything a replace decoration hides. */
function rendered(doc: string, sel = 0): string {
  const st = stateOf(doc, sel);
  const built = buildInlineForRange(st, 0, st.doc.length);
  const hides = built.decorations
    .filter((r) => {
      const spec = (r.value as unknown as { spec: Record<string, unknown> }).spec;
      return 'widget' in spec || Object.keys(spec).length === 0;
    })
    .map((r) => {
      const spec = (r.value as unknown as { spec: Record<string, unknown> }).spec;
      const w = spec.widget ? `«${(spec.widget as object).constructor.name}»` : '';
      return { from: r.from, to: r.to, w };
    })
    .sort((a, b) => a.from - b.from);

  let out = '';
  let pos = 0;
  for (const h of hides) {
    if (h.from < pos) continue;
    out += doc.slice(pos, h.from) + h.w;
    pos = h.to;
  }
  out += doc.slice(pos);
  return JSON.stringify(out);
}

const PAD = 'x\n\n';

describe('probe2', () => {
  it('prices', () => {
    console.log('PRICES:', rendered(PAD + 'It costs $5 and $7 today.\n'));
    console.log('MIXED :', rendered(PAD + 'Pay $9.99 now, or $19.99 later.\n'));
  });

  it('images', () => {
    console.log('TITLE-IMG :', rendered(PAD + "![a](b.png 'the title')\n"));
    console.log('DQ-IMG    :', rendered(PAD + '![a](b.png "the title")\n'));
    console.log('NESTED-IMG:', rendered(PAD + '![a [b] c](x.png)\n'));
    console.log('SPACE-URL :', rendered(PAD + '![a](<my file.png>)\n'));
    console.log('PLAIN-IMG :', rendered(PAD + '![a](b.png)\n'));
  });

  it('links', () => {
    console.log('REF-LINK  :', rendered(PAD + '[text][ref]\n'));
    console.log('REF-DEF   :', rendered(PAD + '[ref]: https://example.com\n'));
    console.log('SHORTCUT  :', rendered(PAD + '[ref]\n\n[ref]: https://example.com\n'));
    console.log('AUTOLINK  :', rendered(PAD + '<https://example.com>\n'));
    console.log('INLINE    :', rendered(PAD + '[t](https://example.com)\n'));
  });

  it('heading whitespace + setext', () => {
    console.log('HEADING-WS:', rendered(PAD + '#   spaced\n'));
    console.log('QUOTE-WS  :', rendered(PAD + '>   quoted\n'));
    console.log('SETEXT    :', rendered(PAD + 'Heading\n=======\n'));
  });

  it('view with a table inside a blockquote', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    try {
      const h = createEditor({
        parent,
        doc: 'intro\n\n> | a | b |\n> | - | - |\n> | 1 | 2 |\n\nend\n',
        dir: '/docs'
      });
      console.log('BQ-VIEW-OK:', parent.textContent?.slice(0, 200));
      h.destroy();
    } catch (e) {
      console.log('BQ-VIEW-THREW:', String(e));
    }
  });

  it('view with a table inside a list item', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    try {
      const h = createEditor({
        parent,
        doc: '- item\n\n  | a | b |\n  | - | - |\n  | 1 | 2 |\n\nend\n',
        dir: '/docs'
      });
      console.log('LI-VIEW-OK:', parent.textContent?.slice(0, 200));
      h.destroy();
    } catch (e) {
      console.log('LI-VIEW-THREW:', String(e));
    }
  });
});
