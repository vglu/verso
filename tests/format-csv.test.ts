import { describe, expect, it } from 'vitest';
import { csvToMarkdownTable, detectDelimiter, parseCsv } from '../src/lib/format/csv';
import { jsonFormatter, jsonMinifier } from '../src/lib/format/json';
import { runFormatter } from '../src/lib/format/types';
import type { FormatContext } from '../src/lib/format/types';

const ctx = (ext: string, indent = 2): FormatContext => ({
  fileName: `file.${ext}`,
  ext,
  selection: null,
  indent
});

describe('reading CSV', () => {
  it('keeps a separator that is inside quotes', () => {
    expect(parseCsv('a,"b,c",d')).toEqual([['a', 'b,c', 'd']]);
  });

  it('keeps a line break that is inside quotes', () => {
    expect(parseCsv('a,"line one\nline two",c')).toEqual([['a', 'line one\nline two', 'c']]);
  });

  it('reads a doubled quote as one quote', () => {
    expect(parseCsv('a,"she said ""no""",c')).toEqual([['a', 'she said "no"', 'c']]);
  });

  it('treats CRLF as one break, and a trailing newline as no row', () => {
    expect(parseCsv('a,b\r\nc,d\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd']
    ]);
  });

  it('finds the separator that divides every line the same way', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
    expect(detectDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t');
    // Commas in prose are not a column separator: they do not line up.
    expect(detectDelimiter('name;note\nAda;born in London, England')).toBe(';');
  });
});

describe('CSV becomes a table', () => {
  it('makes a Markdown table with an alignment row and padded columns', () => {
    const result = runFormatter(
      csvToMarkdownTable,
      'name,role\nAda,engineer\nGrace,admiral\n',
      ctx('csv')
    );
    expect(result?.text).toBe(
      [
        '| name  | role     |',
        '| ----- | -------- |',
        '| Ada   | engineer |',
        '| Grace | admiral  |',
        ''
      ].join('\n')
    );
  });

  it('escapes a pipe so one cell cannot become two', () => {
    const result = runFormatter(csvToMarkdownTable, 'a,b\nleft|right,x\n', ctx('csv'));
    expect(result?.text).toContain('left\\|right');
  });

  it('flattens a line break inside a cell, which a table cannot hold', () => {
    const result = runFormatter(csvToMarkdownTable, 'a,b\n"one\ntwo",x\n', ctx('csv'));
    expect(result?.text).toContain('one two');
    expect(result?.text.split('\n').filter((l) => l.startsWith('|'))).toHaveLength(3);
  });

  it('declines a single column: that is a list, not a table', () => {
    expect(runFormatter(csvToMarkdownTable, 'one\ntwo\nthree\n', ctx('csv'))).toBeNull();
  });

  it('pads a ragged row instead of shifting the columns along', () => {
    const result = runFormatter(csvToMarkdownTable, 'a,b,c\n1,2\n', ctx('csv'));
    const rows = result!.text.trim().split('\n');
    expect(rows[2]).toBe('| 1   | 2   |     |');
  });
});

describe('JSON', () => {
  it('lays out with the reader’s indent', () => {
    const result = runFormatter(jsonFormatter, '{"b":1,"a":[2,3]}', ctx('json', 2));
    expect(result?.text).toBe('{\n  "b": 1,\n  "a": [\n    2,\n    3\n  ]\n}');
  });

  it('leaves a broken document exactly as it is', () => {
    // Better an unformatted file than a "fixed" one missing what it could
    // not parse.
    expect(runFormatter(jsonFormatter, '{"a": 1,,}', ctx('json'))).toBeNull();
  });

  it('does not touch a document that is already formatted', () => {
    const already = '{\n  "a": 1\n}';
    expect(runFormatter(jsonFormatter, already, ctx('json'))).toBeNull();
  });

  it('keeps the trailing newline question the file’s own', () => {
    expect(runFormatter(jsonFormatter, '{"a":1}\n', ctx('json'))?.text.endsWith('}\n')).toBe(true);
    expect(runFormatter(jsonFormatter, '{"a":1}', ctx('json'))?.text.endsWith('}')).toBe(true);
  });

  it('minifies', () => {
    expect(runFormatter(jsonMinifier, '{\n  "a": 1\n}', ctx('json'))?.text).toBe('{"a":1}');
  });
});
