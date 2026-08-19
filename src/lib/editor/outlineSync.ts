import type { OutlineItem } from './outline';

/**
 * Keeping the outline panel in step with the document in front of the reader.
 *
 * Rebuilding it is a tree walk, so it is debounced — but the debounce is what
 * makes this worth its own file. Every open document parses in the background
 * and asks for a refresh, and with one shared timer a document nobody is
 * looking at can cancel the pending refresh for the one they are, then decline
 * to do the work itself. The outline simply never arrives, and the panel says
 * the document has no headings while its heading is on screen.
 */

export interface OutlineSource {
  /** The document in front of the reader, if there is one. */
  activeId(): string | null;
  /** Its headings, or null if it has gone away since. */
  outlineOf(id: string): OutlineItem[] | null;
  /** Which of them the reader is currently inside. */
  activeIndexOf(id: string): number;
}

export interface OutlineSync {
  /** Ask for a refresh on behalf of one document. */
  schedule(id: string): void;
  /** Refresh now, skipping the debounce. */
  flush(): void;
  dispose(): void;
}

export function createOutlineSync(
  source: OutlineSource,
  apply: (items: OutlineItem[], activeIndex: number) => void,
  delay = 200
): OutlineSync {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const run = (): void => {
    timer = null;
    const id = source.activeId();
    if (!id) return;
    const items = source.outlineOf(id);
    if (!items) return;
    apply(items, source.activeIndexOf(id));
  };

  return {
    schedule(id: string): void {
      // A background document may not cancel the active one's refresh.
      if (source.activeId() !== id) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, delay);
    },

    flush(): void {
      if (timer) clearTimeout(timer);
      run();
    },

    dispose(): void {
      if (timer) clearTimeout(timer);
      timer = null;
    }
  };
}
