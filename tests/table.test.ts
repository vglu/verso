import { describe, expect, it } from 'vitest';
import { isDelimiterRow, parseTable, splitRow } from '../src/lib/editor/livePreview/table';

describe('splitRow', () => {
  it('drops the border pipes', () => {
    expect(splitRow('| a | b |')).toEqual(['a', 'b']);
  });

  it('handles rows without border pipes', () => {
    expect(splitRow('a | b')).toEqual(['a', 'b']);
  });

  it('keeps genuinely empty cells', () => {
    expect(splitRow('|  | b |')).toEqual(['', 'b']);
  });

  it('does not split on an escaped pipe', () => {
    expect(splitRow('| a \\| b | c |')).toEqual(['a \\| b', 'c']);
  });

  it('does not split inside inline code', () => {
    expect(splitRow('| `a | b` | c |')).toEqual(['`a | b`', 'c']);
  });
});

describe('isDelimiterRow', () => {
  it('accepts the alignment forms', () => {
    expect(isDelimiterRow('| --- | :-: | ---: | :--- |')).toBe(true);
    expect(isDelimiterRow('|-|-|')).toBe(true);
  });

  it('rejects content rows', () => {
    expect(isDelimiterRow('| a | b |')).toBe(false);
    expect(isDelimiterRow('| --- | x |')).toBe(false);
  });
});

describe('parseTable', () => {
  const source = [
    '| Name | Size | Note |',
    '| --- | :---: | ---: |',
    '| a | 1 | ok |',
    '| b | 2 | |'
  ].join('\n');

  it('extracts header, alignment and rows', () => {
    const table = parseTable(source)!;
    expect(table.header).toEqual(['Name', 'Size', 'Note']);
    expect(table.align).toEqual([null, 'center', 'right']);
    expect(table.rows).toEqual([
      ['a', '1', 'ok'],
      ['b', '2', '']
    ]);
  });

  it('pads short rows so the table stays rectangular', () => {
    const table = parseTable('| a | b | c |\n| - | - | - |\n| 1 |')!;
    expect(table.rows[0]).toEqual(['1', '', '']);
  });

  it('returns null without a delimiter row', () => {
    expect(parseTable('| a | b |\n| 1 | 2 |')).toBeNull();
    expect(parseTable('| a |')).toBeNull();
  });
});
