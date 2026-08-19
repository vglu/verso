import { afterEach, describe, expect, it } from 'vitest';
import { handleTreeKey } from '../src/lib/ui/treeKeys';

afterEach(() => {
  document.body.innerHTML = '';
});

/**
 * The tree is one stop on the Tab key. Everything below is what the arrows
 * have to do instead.
 */
function treeOf(
  rows: { path: string; depth: number; dir?: boolean; open?: boolean }[]
): HTMLElement {
  const tree = document.createElement('div');
  tree.setAttribute('role', 'tree');
  for (const row of rows) {
    const el = document.createElement('div');
    el.setAttribute('role', 'treeitem');
    el.tabIndex = -1;
    el.dataset.path = row.path;
    el.dataset.depth = String(row.depth);
    if (row.dir) {
      el.dataset.dir = 'true';
      el.setAttribute('aria-expanded', row.open ? 'true' : 'false');
    }
    tree.appendChild(el);
  }
  document.body.appendChild(tree);
  return tree;
}

const layout = [
  { path: 'notes', depth: 0, dir: true, open: true },
  { path: 'notes/a.md', depth: 1 },
  { path: 'notes/b.md', depth: 1 },
  { path: 'archive', depth: 0, dir: true, open: false }
];

function key(name: string): KeyboardEvent {
  return new KeyboardEvent('keydown', { key: name });
}

function rowAt(tree: HTMLElement, index: number): HTMLElement {
  return tree.querySelectorAll<HTMLElement>('[role="treeitem"]')[index]!;
}

describe('moving through the tree', () => {
  it('goes down and up one row at a time', () => {
    const tree = treeOf(layout);
    expect(handleTreeKey(tree, key('ArrowDown'), rowAt(tree, 0)).focus).toBe(rowAt(tree, 1));
    expect(handleTreeKey(tree, key('ArrowUp'), rowAt(tree, 2)).focus).toBe(rowAt(tree, 1));
  });

  it('stops at the ends rather than wrapping', () => {
    const tree = treeOf(layout);
    expect(handleTreeKey(tree, key('ArrowUp'), rowAt(tree, 0)).focus).toBe(rowAt(tree, 0));
    expect(handleTreeKey(tree, key('ArrowDown'), rowAt(tree, 3)).focus).toBe(rowAt(tree, 3));
  });

  it('jumps to the first and last rows', () => {
    const tree = treeOf(layout);
    expect(handleTreeKey(tree, key('Home'), rowAt(tree, 2)).focus).toBe(rowAt(tree, 0));
    expect(handleTreeKey(tree, key('End'), rowAt(tree, 0)).focus).toBe(rowAt(tree, 3));
  });
});

describe('opening and closing folders', () => {
  it('opens a closed folder with Right', () => {
    const tree = treeOf(layout);
    expect(handleTreeKey(tree, key('ArrowRight'), rowAt(tree, 3)).toggle).toBe('archive');
  });

  it('steps into an open folder with Right', () => {
    const tree = treeOf(layout);
    const result = handleTreeKey(tree, key('ArrowRight'), rowAt(tree, 0));
    expect(result.toggle).toBeUndefined();
    expect(result.focus).toBe(rowAt(tree, 1));
  });

  it('closes an open folder with Left', () => {
    const tree = treeOf(layout);
    expect(handleTreeKey(tree, key('ArrowLeft'), rowAt(tree, 0)).toggle).toBe('notes');
  });

  it('goes out to the parent from a file', () => {
    const tree = treeOf(layout);
    expect(handleTreeKey(tree, key('ArrowLeft'), rowAt(tree, 2)).focus).toBe(rowAt(tree, 0));
  });

  it('does nothing sideways on a file at the top level', () => {
    const tree = treeOf([{ path: 'lone.md', depth: 0 }]);
    const result = handleTreeKey(tree, key('ArrowLeft'), rowAt(tree, 0));
    expect(result).toMatchObject({ handled: true });
    expect(result.focus).toBeUndefined();
  });
});

describe('acting on a row', () => {
  it('opens a file with Enter', () => {
    const tree = treeOf(layout);
    expect(handleTreeKey(tree, key('Enter'), rowAt(tree, 1)).open).toBe('notes/a.md');
  });

  it('toggles a folder with Enter instead of opening it as a file', () => {
    const tree = treeOf(layout);
    const result = handleTreeKey(tree, key('Enter'), rowAt(tree, 0));
    expect(result.toggle).toBe('notes');
    expect(result.open).toBeUndefined();
  });

  it('leaves keys it does not own alone', () => {
    const tree = treeOf(layout);
    expect(handleTreeKey(tree, key('a'), rowAt(tree, 0)).handled).toBe(false);
  });

  it('lands on the first row when nothing inside has focus yet', () => {
    const tree = treeOf(layout);
    expect(handleTreeKey(tree, key('ArrowDown'), null).focus).toBe(rowAt(tree, 0));
  });

  it('has nothing to do in an empty tree', () => {
    expect(handleTreeKey(treeOf([]), key('ArrowDown'), null).handled).toBe(false);
  });
});
