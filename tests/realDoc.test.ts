import { describe, expect, it } from 'vitest';
import { parseFully } from './support/tree';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EditorState } from '@codemirror/state';
import { markdownSupport } from '../src/lib/editor/markdownLang';
import { documentDir, editingField, scanBlocksForTest } from '../src/lib/editor/livePreview';

/**
 * A real document from the user's machine, not a hand-made fixture.
 *
 * The table in this file sits well past the first screen. CodeMirror parses a
 * document in chunks, so at the moment the editor state is created the tree
 * does not reach that far — which is exactly the case a small fixture cannot
 * reproduce, and exactly the case where the table used to never render.
 */
const source = readFileSync(join(process.cwd(), 'tests/fixtures/real-doc.md'), 'utf8');

function stateOf(doc: string): EditorState {
  return EditorState.create({
    doc,
    extensions: [markdownSupport(), editingField, documentDir.of('/docs')]
  });
}

describe('a real 12 KB document', () => {
  it('contains a GFM table far below the first screen', () => {
    const tableLine = source.split('\n').findIndex((l) => l.trim() === '|---|---|');
    expect(tableLine).toBeGreaterThan(80);
  });

  it('finds that table once the document is fully parsed', () => {
    // Force the parser all the way to the end, the way scrolling eventually does.
    const state = parseFully(stateOf(source));

    const blocks = scanBlocksForTest(state);
    const tables = blocks.filter((b) => b.kind === 'table');

    expect(tables.length).toBeGreaterThan(0);
    expect(tables[0]!.source).toContain('header.currency');
  });

  it('parses the table into header, alignment and every row', async () => {
    const { parseTable } = await import('../src/lib/editor/livePreview/table');
    const state = parseFully(stateOf(source));

    const table = scanBlocksForTest(state).find((b) => b.kind === 'table')!;
    const parsed = parseTable(table.source)!;

    expect(parsed.header).toHaveLength(2);
    expect(parsed.rows.length).toBeGreaterThanOrEqual(19);
    expect(parsed.rows.some((r) => r[0]?.includes('totals.totalVat'))).toBe(true);
  });
});
