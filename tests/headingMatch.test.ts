import { describe, expect, it } from 'vitest';
import { filterHeadings, matchHeading, splitByRanges } from '../src/lib/editor/headingMatch';
import type { OutlineItem } from '../src/lib/editor/outline';

const outline: OutlineItem[] = [
  { level: 1, text: 'Data safety', from: 0 },
  { level: 2, text: 'Drafts', from: 100 },
  { level: 2, text: 'Everything we know about drafts', from: 200 },
  { level: 2, text: 'Атомарная запись', from: 300 },
  { level: 3, text: 'Conflicts with the outside world', from: 400 }
];

describe('what counts as a match', () => {
  it('matches on a fragment of a word', () => {
    expect(matchHeading('draf', 'Drafts')).toEqual([[0, 4]]);
  });

  it('ignores case', () => {
    expect(matchHeading('DRAFTS', 'Drafts')).toEqual([[0, 6]]);
  });

  it('requires every term, in any order', () => {
    expect(matchHeading('world conflicts', 'Conflicts with the outside world')).toEqual([
      [0, 9],
      [27, 32]
    ]);
    expect(matchHeading('world missing', 'Conflicts with the outside world')).toBeNull();
  });

  it('does not match letters merely scattered through the text', () => {
    // Subsequence matching would call this a hit; it is not what anyone meant.
    expect(matchHeading('dsf', 'Data safety first')).toBeNull();
  });

  it('treats an empty query as matching everything, with nothing highlighted', () => {
    expect(matchHeading('   ', 'Drafts')).toEqual([]);
  });

  it('works on Cyrillic', () => {
    expect(matchHeading('запись', 'Атомарная запись')).toEqual([[10, 16]]);
  });

  it('merges overlapping terms into one range', () => {
    expect(matchHeading('draft rafts', 'Drafts')).toEqual([[0, 6]]);
  });
});

describe('which heading comes first', () => {
  it('puts the heading the query starts with above one that merely contains it', () => {
    const [first] = filterHeadings(outline, 'draft');
    expect(first?.item.text).toBe('Drafts');
  });

  it('keeps document order when the matches are equally good', () => {
    const all = filterHeadings(outline, '');
    expect(all.map((m) => m.item.text)).toEqual(outline.map((i) => i.text));
  });

  it('remembers where each heading sat in the full outline', () => {
    const [match] = filterHeadings(outline, 'атом');
    expect(match?.index).toBe(3);
  });

  it('returns nothing when nothing matches', () => {
    expect(filterHeadings(outline, 'zzz')).toEqual([]);
  });
});

describe('highlighting the part that matched', () => {
  it('splits the text into hit and miss pieces, in order', () => {
    expect(splitByRanges('Drafts', [[0, 4]])).toEqual([
      { text: 'Draf', hit: true },
      { text: 'ts', hit: false }
    ]);
  });

  it('leaves the text whole when nothing was highlighted', () => {
    expect(splitByRanges('Drafts', [])).toEqual([{ text: 'Drafts', hit: false }]);
  });

  it('handles a match in the middle', () => {
    expect(splitByRanges('Атомарная запись', [[10, 16]])).toEqual([
      { text: 'Атомарная ', hit: false },
      { text: 'запись', hit: true }
    ]);
  });
});
