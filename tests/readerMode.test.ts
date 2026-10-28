import { describe, expect, it } from 'vitest';
import { EditorSelection } from '@codemirror/state';
import { createEditor } from '../src/lib/editor/createEditor';
import { isReaderMode } from '../src/lib/editor/livePreview/editing';
import { TableWidget } from '../src/lib/editor/livePreview/widgets';
import { MathWidget } from '../src/lib/editor/livePreview/richWidgets';

function setup(doc: string) {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return createEditor({ parent, doc, dir: '/docs', fileName: 'note.md' });
}

describe('Reading Mode', () => {
  it('is on by default and freezes reveal', () => {
    const handle = setup('| a | b |\n| - | - |\n| 1 | 2 |\n');
    expect(handle.isReaderMode()).toBe(true);
    expect(isReaderMode(handle.view.state)).toBe(true);
    expect(handle.view.state.readOnly).toBe(true);
    handle.destroy();
  });

  it('lets a table ignore mouse events so cell text can be selected', () => {
    const handle = setup('| a | b |\n| - | - |\n| 1 | 2 |\n');
    const table = new TableWidget('| a | b |\n| - | - |\n| 1 | 2 |', 0);
    const event = new MouseEvent('mousedown', { bubbles: true });
    Object.defineProperty(event, 'target', {
      value: handle.view.contentDOM.appendChild(document.createElement('td'))
    });
    expect(table.ignoreEvent(event)).toBe(true);
    handle.destroy();
  });

  it('stops ignoring table clicks once reading mode is off', () => {
    const handle = setup('| a | b |\n| - | - |\n| 1 | 2 |\n');
    handle.setReaderMode(false);
    const table = new TableWidget('| a | b |\n| - | - |\n| 1 | 2 |', 0);
    const cell = document.createElement('td');
    handle.view.contentDOM.appendChild(cell);
    const event = new MouseEvent('mousedown', { bubbles: true });
    Object.defineProperty(event, 'target', { value: cell });
    expect(table.ignoreEvent(event)).toBe(false);
    handle.destroy();
  });

  it('keeps a formula selectable while reading', () => {
    const handle = setup('$$x$$\n');
    const math = new MathWidget('x', true, 0);
    const host = document.createElement('div');
    handle.view.contentDOM.appendChild(host);
    const event = new MouseEvent('mousedown', { bubbles: true });
    Object.defineProperty(event, 'target', { value: host });
    expect(math.ignoreEvent(event)).toBe(true);
    handle.destroy();
  });

  it('does not flip into editing from a click while reading', () => {
    const handle = setup('hello\n');
    handle.view.dispatch({ selection: EditorSelection.cursor(0) });
    // Simulate what the editing tracker would do: a click while reading must
    // leave the document frozen so the next Ctrl+E still opens a clean page.
    expect(isReaderMode(handle.view.state)).toBe(true);
    handle.destroy();
  });
});
