import { describe, expect, it } from 'vitest';
import { createEditor } from '../src/lib/editor/createEditor';

interface Change {
  content: string;
  userInitiated: boolean;
}

function setup(doc: string) {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const changes: Change[] = [];

  const handle = createEditor({
    parent,
    doc,
    dir: '/docs',
    onChange: (content, meta) => changes.push({ content, userInitiated: meta.userInitiated })
  });

  return { handle, changes };
}

describe('EditorHandle change reporting', () => {
  it('reports typing as user-initiated', () => {
    const { handle, changes } = setup('a');
    handle.view.dispatch({ changes: { from: 1, insert: 'b' }, userEvent: 'input.type' });

    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual({ content: 'ab', userInitiated: true });
    handle.destroy();
  });

  it('does not report a reload as a user edit', () => {
    // Regression: reloading a file after an external change used to mark the
    // tab dirty, because the app's own write looked like typing.
    const { handle, changes } = setup('old content');
    handle.setContent('new content from disk', true);

    expect(changes).toHaveLength(1);
    expect(changes[0]!.userInitiated).toBe(false);
    expect(handle.getContent()).toBe('new content from disk');
    handle.destroy();
  });

  it('ignores a no-op setContent', () => {
    const { handle, changes } = setup('same');
    handle.setContent('same', true);
    expect(changes).toHaveLength(0);
    handle.destroy();
  });
});

describe('EditorHandle basics', () => {
  it('reports cursor position as line and column', () => {
    const { handle } = setup('one\ntwo\nthree');
    handle.setCursor(6); // second line, third column
    const cursor = handle.getCursor();
    expect(cursor.line).toBe(2);
    expect(cursor.col).toBe(3);
    handle.destroy();
  });

  it('clamps a cursor beyond the end of the document', () => {
    const { handle } = setup('short');
    handle.setCursor(9999);
    expect(handle.getCursor().pos).toBe(5);
    handle.destroy();
  });

  it('exposes the outline of the open document', () => {
    const { handle } = setup('# One\n\n## Two\n');
    expect(handle.getOutline().map((i) => i.text)).toEqual(['One', 'Two']);
    handle.destroy();
  });

  it('toggles reader mode', () => {
    const { handle } = setup('# One\n');
    expect(handle.isReaderMode()).toBe(false);
    handle.setReaderMode(true);
    expect(handle.isReaderMode()).toBe(true);
    handle.destroy();
  });
});
