/**
 * Debounced draft writes, one queue for every open document.
 *
 * Drafts are what stands between a crash and someone's typing, so the rules
 * live here rather than being spread through the tab store:
 *
 * - a write is queued per document, not globally: one document's typing must
 *   not postpone another's draft;
 * - a document with no path yet gets drafts too — it exists nowhere but in
 *   memory, so it is the one with the most to lose;
 * - anything that makes the buffer and the file agree cancels the queued
 *   write. A timer left running fires after the save and puts the draft back,
 *   and the next launch offers to recover text that is already in the file.
 *
 * Contract: docs/design/DATA-SAFETY.md §4.
 */

export interface DraftSnapshot {
  path: string | null;
  baseMtimeMs: number | null;
  content: string;
  dirty: boolean;
}

export interface DraftQueueOptions {
  /** The document as it stands right now, or null if it has been closed. */
  snapshot: (id: string) => DraftSnapshot | null;
  write: (id: string, path: string, baseMtimeMs: number, content: string) => Promise<void>;
  /** Read at fire time: the setting can change while a write is queued. */
  delay: () => number;
}

export interface DraftQueue {
  schedule(id: string): void;
  cancel(id: string): void;
  /** Write every queued draft now — called before the window closes. */
  flush(): Promise<void>;
  pending(): number;
}

export function createDraftQueue(options: DraftQueueOptions): DraftQueue {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const writeNow = async (id: string): Promise<void> => {
    const doc = options.snapshot(id);
    if (!doc?.dirty) return;
    try {
      await options.write(id, doc.path ?? '', doc.baseMtimeMs ?? 0, doc.content);
    } catch (error) {
      console.warn('draft save failed', error);
    }
  };

  const cancel = (id: string): void => {
    const timer = timers.get(id);
    if (timer) clearTimeout(timer);
    timers.delete(id);
  };

  return {
    schedule(id: string): void {
      if (options.delay() <= 0) return;
      cancel(id);
      timers.set(
        id,
        setTimeout(() => {
          timers.delete(id);
          void writeNow(id);
        }, options.delay())
      );
    },

    cancel,

    async flush(): Promise<void> {
      const ids = [...timers.keys()];
      for (const id of ids) cancel(id);
      for (const id of ids) await writeNow(id);
    },

    pending: () => timers.size
  };
}
