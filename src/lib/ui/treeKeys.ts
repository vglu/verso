/**
 * Keyboard movement inside the file tree.
 *
 * The tree is one stop on the Tab key, not one per file: with every row
 * tabbable, reaching the document from the sidebar of a large folder meant
 * pressing Tab a hundred times. Inside the tree the arrows do the work, which
 * is what the tree role has always promised.
 *
 * Written against the DOM rather than the store because the rows are rendered
 * by a recursive component: what is "the next row" is a question about what is
 * actually on screen, and the flattened list only exists there.
 */

export interface TreeKeyResult {
  /** The row that should now hold focus, if it changed. */
  focus?: HTMLElement;
  /** A directory the caller should expand or collapse. */
  toggle?: string;
  /** A file the caller should open. */
  open?: string;
  handled: boolean;
}

function rows(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('[role="treeitem"]')];
}

function currentIndex(list: HTMLElement[], active: Element | null): number {
  const index = list.findIndex((row) => row === active || row.contains(active));
  return index;
}

export function handleTreeKey(
  container: HTMLElement,
  event: KeyboardEvent,
  active: Element | null
): TreeKeyResult {
  const list = rows(container);
  if (list.length === 0) return { handled: false };

  const index = currentIndex(list, active);
  const row = list[Math.max(index, 0)];
  if (!row) return { handled: false };

  const isDir = row.dataset.dir === 'true';
  const expanded = row.getAttribute('aria-expanded') === 'true';
  const path = row.dataset.path ?? '';

  switch (event.key) {
    case 'ArrowDown':
      return { focus: list[Math.min(index + 1, list.length - 1)], handled: true };

    case 'ArrowUp':
      return { focus: list[Math.max(index - 1, 0)], handled: true };

    case 'Home':
      return { focus: list[0], handled: true };

    case 'End':
      return { focus: list[list.length - 1], handled: true };

    case 'ArrowRight':
      // Open a closed folder; step into an open one. On a file it does nothing
      // rather than jumping somewhere unrelated.
      if (isDir && !expanded) return { toggle: path, handled: true };
      if (isDir && expanded)
        return { focus: list[Math.min(index + 1, list.length - 1)], handled: true };
      return { handled: true };

    case 'ArrowLeft': {
      if (isDir && expanded) return { toggle: path, handled: true };
      // Otherwise go to the row this one sits under.
      const depth = Number(row.dataset.depth ?? '0');
      for (let i = index - 1; i >= 0; i--) {
        if (Number(list[i]?.dataset.depth ?? '0') < depth) return { focus: list[i], handled: true };
      }
      return { handled: true };
    }

    case 'Enter':
    case ' ':
      return isDir ? { toggle: path, handled: true } : { open: path, handled: true };

    default:
      return { handled: false };
  }
}
