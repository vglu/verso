import { describe, expect, it } from 'vitest';
import { undo } from '@codemirror/commands';
import { createEditor } from '../src/lib/editor/createEditor';

/**
 * The promises the product makes about the user's text. Each of these
 * guarded a way to lose work silently.
 */
function setup(doc: string) {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  return createEditor({ parent, doc, dir: '/docs' });
}

describe('reader mode', () => {
  it('is actually read-only', () => {
    // The caret is hidden in reader mode, so an edit that still went through
    // would reach the file with nothing on screen to show it happened.
    const handle = setup('original');
    handle.setReaderMode(true);

    expect(handle.view.state.readOnly).toBe(true);
    handle.destroy();
  });

  it('lets editing resume when it is switched off', () => {
    const handle = setup('original');
    handle.setReaderMode(true);
    handle.setReaderMode(false);

    expect(handle.view.state.readOnly).toBe(false);
    handle.destroy();
  });

  it('does not switch a genuinely read-only file back to editable', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const handle = createEditor({ parent, doc: 'locked', dir: '/docs', readOnly: true });

    handle.setReaderMode(true);
    handle.setReaderMode(false);

    expect(handle.view.state.readOnly).toBe(true);
    handle.destroy();
  });
});

describe('replacing the buffer from outside', () => {
  it('cannot be undone back to the previous file content', () => {
    // Otherwise one Ctrl+Z restores text that no longer matches the file this
    // tab now guards, and the next save writes it over a newer disk version.
    const handle = setup('first version');
    handle.view.dispatch({ changes: { from: 5, insert: ' edited' }, userEvent: 'input.type' });

    handle.setContent('version from disk');
    undo(handle.view);

    expect(handle.getContent()).toBe('version from disk');
    handle.destroy();
  });

  it('keeps the modes that were set before it', () => {
    // Recreating the state used to restore every compartment to its initial
    // value, so reader and source mode reverted while the handle still
    // reported them as on.
    const handle = setup('text');
    handle.setSourceMode(true);
    handle.setReaderMode(true);

    handle.setContent('replaced');

    expect(handle.isSourceMode()).toBe(true);
    expect(handle.isReaderMode()).toBe(true);
    expect(handle.view.state.readOnly).toBe(true);
    handle.destroy();
  });

  it('reports the change as not user-initiated', () => {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const seen: boolean[] = [];
    const handle = createEditor({
      parent,
      doc: 'a',
      dir: '/docs',
      onChange: (_content, meta) => seen.push(meta.userInitiated)
    });

    handle.setContent('b');

    expect(seen).toEqual([false]);
    handle.destroy();
  });
});
