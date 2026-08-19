import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDraftQueue, type DraftSnapshot } from '../src/lib/stores/draftQueue';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

interface Written {
  id: string;
  path: string;
  content: string;
}

function harness(docs: Record<string, DraftSnapshot>, delay = 500) {
  const written: Written[] = [];
  const queue = createDraftQueue({
    snapshot: (id) => docs[id] ?? null,
    write: async (id, path, _mtime, content) => {
      written.push({ id, path, content });
    },
    delay: () => delay
  });
  return { queue, written };
}

const dirty = (content: string, path: string | null = 'C:/notes/a.md'): DraftSnapshot => ({
  path,
  baseMtimeMs: 1,
  content,
  dirty: true
});

describe('drafts are written per document', () => {
  it('writes one draft after the typing stops', async () => {
    const { queue, written } = harness({ a: dirty('hello') });
    queue.schedule('a');
    queue.schedule('a');
    queue.schedule('a');
    await vi.runAllTimersAsync();

    expect(written).toHaveLength(1);
    expect(written[0]?.content).toBe('hello');
  });

  it('does not let one document postpone another', async () => {
    const { queue, written } = harness({ a: dirty('one'), b: dirty('two', 'C:/notes/b.md') });
    queue.schedule('a');
    queue.schedule('b');
    await vi.runAllTimersAsync();

    expect(written.map((w) => w.id).sort()).toEqual(['a', 'b']);
  });

  it('protects a document that has never been saved', async () => {
    // It exists nowhere but in memory, so it is the one with the most to lose.
    const { queue, written } = harness({ fresh: dirty('typed but never saved', null) });
    queue.schedule('fresh');
    await vi.runAllTimersAsync();

    expect(written[0]).toMatchObject({ path: '', content: 'typed but never saved' });
  });
});

describe('a saved document leaves no draft behind', () => {
  it('drops the queued write when the buffer and the file agree', async () => {
    // The bug: the timer fired after the save, put the draft back, and the
    // next launch offered to recover text that was already in the file.
    const { queue, written } = harness({ a: dirty('hello') });
    queue.schedule('a');
    queue.cancel('a');
    await vi.runAllTimersAsync();

    expect(written).toHaveLength(0);
    expect(queue.pending()).toBe(0);
  });

  it('writes nothing for a document with no unsaved changes', async () => {
    const { queue, written } = harness({ a: { ...dirty('hello'), dirty: false } });
    queue.schedule('a');
    await vi.runAllTimersAsync();

    expect(written).toHaveLength(0);
  });

  it('writes nothing for a document that was closed while queued', async () => {
    const { queue, written } = harness({ a: dirty('hello') });
    queue.schedule('a');
    queue.schedule('gone');
    await vi.runAllTimersAsync();

    expect(written.map((w) => w.id)).toEqual(['a']);
  });
});

describe('closing the window', () => {
  it('writes everything still queued, without waiting for the debounce', async () => {
    const { queue, written } = harness({ a: dirty('one'), b: dirty('two', null) });
    queue.schedule('a');
    queue.schedule('b');
    await queue.flush();

    expect(written).toHaveLength(2);
    expect(queue.pending()).toBe(0);
  });

  it('does not write the same draft twice', async () => {
    const { queue, written } = harness({ a: dirty('one') });
    queue.schedule('a');
    await queue.flush();
    await vi.runAllTimersAsync();

    expect(written).toHaveLength(1);
  });
});

describe('when autosave is switched off', () => {
  it('queues nothing at all', async () => {
    const { queue, written } = harness({ a: dirty('hello') }, 0);
    queue.schedule('a');
    await vi.runAllTimersAsync();

    expect(written).toHaveLength(0);
  });
});
