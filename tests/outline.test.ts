import { describe, expect, it } from 'vitest';
import { parseFully } from './support/tree';
import { EditorState } from '@codemirror/state';
import { activeOutlineIndex, cleanHeadingText, extractOutline } from '../src/lib/editor/outline';
import { markdownSupport } from '../src/lib/editor/markdownLang';
import { computeStats } from '../src/lib/editor/createEditor';

/**
 * Parsing is time-sliced, so a fresh state carries only as much tree as the
 * parser got through — on a loaded machine that can be the first block alone,
 * and the assertions below turn flaky rather than false. In the application
 * the outline is rebuilt as the parse advances (`onStructureChange`); here we
 * simply wait for it.
 */
function stateOf(doc: string): EditorState {
  return parseFully(EditorState.create({ doc, extensions: [markdownSupport()] }));
}

describe('cleanHeadingText', () => {
  it('strips heading and inline syntax', () => {
    expect(cleanHeadingText('## **Bold** heading')).toBe('Bold heading');
    expect(cleanHeadingText('### `code` and [link](https://x.dev)')).toBe('code and link');
    expect(cleanHeadingText('# Closed form ###')).toBe('Closed form');
  });
});

describe('extractOutline', () => {
  it('finds headings with their levels and positions', () => {
    const items = extractOutline(stateOf('# One\n\ntext\n\n## Two\n\n### Three\n'));
    expect(items.map((i) => [i.level, i.text])).toEqual([
      [1, 'One'],
      [2, 'Two'],
      [3, 'Three']
    ]);
    expect(items[0]!.from).toBeLessThan(items[1]!.from);
  });

  it('ignores a hash inside a fenced code block', () => {
    const items = extractOutline(stateOf('# Real\n\n```sh\n# not a heading\n```\n'));
    expect(items).toHaveLength(1);
    expect(items[0]!.text).toBe('Real');
  });

  it('returns nothing for a document without headings', () => {
    expect(extractOutline(stateOf('just text\n\nmore text'))).toEqual([]);
  });
});

describe('activeOutlineIndex', () => {
  const items = [
    { level: 1, text: 'a', from: 0 },
    { level: 2, text: 'b', from: 50 },
    { level: 2, text: 'c', from: 100 }
  ];

  it('picks the last heading at or above the position', () => {
    expect(activeOutlineIndex(items, 0)).toBe(0);
    expect(activeOutlineIndex(items, 60)).toBe(1);
    expect(activeOutlineIndex(items, 400)).toBe(2);
  });

  it('returns -1 before the first heading', () => {
    expect(activeOutlineIndex([{ level: 1, text: 'a', from: 10 }], 5)).toBe(-1);
  });
});

describe('computeStats', () => {
  it('counts words and characters', () => {
    expect(computeStats('one two  three')).toEqual({ words: 3, chars: 14 });
  });

  it('reports zero words for whitespace only', () => {
    expect(computeStats('   \n  ')).toEqual({ words: 0, chars: 6 });
  });
});
