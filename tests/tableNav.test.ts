import { describe, expect, it } from 'vitest';
import { parseFully } from './support/tree';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdownSupport } from '../src/lib/editor/markdownLang';
import {
  blankRowLike,
  cellStep,
  exitTable,
  nextTableCell,
  prevTableCell,
  tableRegionAt
} from '../src/lib/editor/tableNav';
import { insertTable } from '../src/lib/editor/format';

const fixture = readFileSync(join(process.cwd(), 'tests/fixtures/ragged-tables.md'), 'utf8');

function stateOf(doc: string, pos = 0): EditorState {
  return parseFully(
    EditorState.create({
      doc,
      selection: EditorSelection.cursor(pos),
      extensions: [markdownSupport()]
    })
  );
}

function viewOf(doc: string, pos: number): EditorView {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return new EditorView({ parent, state: stateOf(doc, pos) });
}

/** Every distinct table in the fixture, by the offset of its first line. */
function allRegionStarts(doc: string): number[] {
  const state = stateOf(doc);
  const starts: number[] = [];
  for (let n = 1; n <= state.doc.lines; n++) {
    const line = state.doc.line(n);
    const region = tableRegionAt(state, line.from);
    if (region && !starts.includes(region.from)) starts.push(region.from);
  }
  return starts;
}

describe('the fixture is the point', () => {
  it('finds every table people actually write', () => {
    const starts = allRegionStarts(fixture);
    // Tidy, edited, no outer pipes, leading pipe only, ragged, escaped,
    // indented, tabbed, trailing whitespace.
    expect(starts.length).toBe(9);
  });

  it('does not mistake prose containing a pipe for a table', () => {
    const doc = 'a | b\n\nnot a table\n';
    expect(tableRegionAt(stateOf(doc), 0)).toBeNull();
  });
});

describe('navigating a table changes not one byte', () => {
  it('walks every cell of every table and leaves the file identical', () => {
    for (const start of allRegionStarts(fixture)) {
      const view = viewOf(fixture, start);
      const region = tableRegionAt(view.state, start)!;
      const cells = region.rows.reduce((n, r) => n + r.cells.length, 0);

      // Stop one short of the end: the last Tab is meant to add a row.
      for (let i = 0; i < cells - 1; i++) nextTableCell(view);
      expect(view.state.doc.toString()).toBe(fixture);

      for (let i = 0; i < cells + 4; i++) prevTableCell(view);
      expect(view.state.doc.toString()).toBe(fixture);

      exitTable(view);
      expect(view.state.doc.toString()).toBe(fixture);
      view.destroy();
    }
  });

  it('selects the cell it lands on, so typing replaces it', () => {
    const doc = '| Name  | Role      |\n| ----- | --------- |\n| Ann   | Reviewer  |\n';
    const view = viewOf(doc, 2);
    nextTableCell(view);

    const { from, to } = view.state.selection.main;
    expect(view.state.doc.sliceString(from, to)).toBe('Role');
    view.destroy();
  });

  it('crosses the delimiter row rather than stopping in it', () => {
    const doc = '| a | b |\n| - | - |\n| 1 | 2 |\n';
    const view = viewOf(doc, 2);
    nextTableCell(view); // b
    nextTableCell(view); // 1, not "-"

    const { from, to } = view.state.selection.main;
    expect(view.state.doc.sliceString(from, to)).toBe('1');
    view.destroy();
  });

  it('steps back out of the top-left cell without wrapping', () => {
    const doc = '| a | b |\n| - | - |\n| 1 | 2 |\n';
    const state = stateOf(doc, 2);
    const region = tableRegionAt(state, 2)!;
    expect(cellStep(region, 2, -1)).toBeNull();
  });
});

describe('a new row copies the shape of the one above it, verbatim', () => {
  it('keeps every pipe in the same column', () => {
    expect(blankRowLike('| Ann   | Reviewer  | 2019  |')).toBe('|       |           |       |');
    expect(blankRowLike('Ann | Reviewer | 2019')).toBe('    |          |     ');
    expect(blankRowLike('  | 1 | 2 |')).toBe('  |   |   |');
  });

  it('leaves a pipe inside inline code alone', () => {
    expect(blankRowLike('|Cy|`code | with a pipe`|2024|')).toBe('|  |                    |    |');
  });

  it('appends a row when Tab is pressed in the last cell', () => {
    const doc = '| a | b |\n| - | - |\n| 1 | 2 |\n';
    const view = viewOf(doc, doc.indexOf('| 1 | 2 |') + 6);
    nextTableCell(view);

    expect(view.state.doc.toString()).toBe('| a | b |\n| - | - |\n| 1 | 2 |\n|   |   |\n');
    // And the caret waits one space into the first cell, so typing gives
    // `| x |` rather than `|x  |`.
    expect(view.state.selection.main.head).toBe(doc.length + 2);
    view.destroy();
  });

  it('does not append a row when there is more table below', () => {
    const doc = '| a | b |\n| - | - |\n| 1 | 2 |\n| 3 | 4 |\n';
    const view = viewOf(doc, doc.indexOf('| 1 | 2 |') + 6);
    nextTableCell(view);
    expect(view.state.doc.toString()).toBe(doc);
    view.destroy();
  });
});

describe('a table from the toolbar is one you can immediately type in', () => {
  it('arrives aligned, selected, and navigable with Tab', () => {
    const view = viewOf('', 0);
    insertTable(view);

    const [header, divider, first] = view.state.doc.toString().split('\n');
    expect(header).toBe('| Column 1 | Column 2 | Column 3 |');
    expect(divider).toBe('| -------- | -------- | -------- |');
    expect(first).toBe('|          |          |          |');

    const sel = view.state.selection.main;
    expect(view.state.doc.sliceString(sel.from, sel.to)).toBe('Column 1');

    nextTableCell(view);
    const next = view.state.selection.main;
    expect(view.state.doc.sliceString(next.from, next.to)).toBe('Column 2');
    view.destroy();
  });
});

describe('leaving the table', () => {
  it('puts the caret after the table so it renders again', () => {
    const doc = '| a | b |\n| - | - |\n| 1 | 2 |\n\nafter\n';
    const view = viewOf(doc, 2);
    exitTable(view);

    const region = tableRegionAt(stateOf(doc), 0)!;
    expect(view.state.selection.main.head).toBeGreaterThan(region.to);
    view.destroy();
  });

  it('reports it did nothing when the caret is not in a table', () => {
    const view = viewOf('just prose\n', 3);
    expect(exitTable(view)).toBe(false);
    view.destroy();
  });
});
