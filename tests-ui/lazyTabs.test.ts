import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Restoring a session without reading the files.
 *
 * The risk this covers is not the speed — it is that a document's draft is
 * noticed at the moment its text first comes into memory. That moment used to
 * be "when the session is restored" and is now "when the tab is first shown",
 * and a draft missed there is unsaved work overwritten by the next save.
 */

const files = new Map<string, { content: string; mtimeMs: number }>();
const drafts = new Map<string, { content: string; savedAtMs: number }>();
const reads: string[] = [];
const deletedDrafts: string[] = [];

vi.mock('../src/lib/ipc/commands', () => ({
  readFile: vi.fn(async (path: string) => {
    const file = files.get(path);
    if (!file) throw { kind: 'NotFound', path };
    reads.push(path);
    return {
      content: file.content,
      meta: {
        path,
        docId: `doc-${path.replace(/[^a-z0-9]/gi, '')}`,
        fileName: path.split(/[\\/]/).pop()!,
        dirPath: path.replace(/[\\/][^\\/]+$/, ''),
        mtimeMs: file.mtimeMs,
        readonly: false,
        encoding: 'utf-8',
        eol: 'lf',
        mixedEol: false,
        trailingNewline: true
      }
    };
  }),
  saveFile: vi.fn(),
  statFile: vi.fn(async () => ({ exists: true, mtimeMs: 1 })),
  watchPaths: vi.fn(async () => undefined),
  draftSave: vi.fn(async () => undefined),
  draftGet: vi.fn(async (id: string) => drafts.get(id) ?? null),
  draftDelete: vi.fn(async (id: string) => {
    deletedDrafts.push(id);
  }),
  draftsList: vi.fn(async () => []),
  settingsLoad: vi.fn(async () => ({})),
  settingsSave: vi.fn(async () => undefined),
  setMenuLabels: vi.fn(async () => undefined),
  sessionLoad: vi.fn(async () => null),
  sessionSave: vi.fn(async () => undefined)
}));

vi.mock('../src/lib/ipc/dialogs', () => ({
  pickSaveTarget: vi.fn(async () => null),
  pickFile: vi.fn(async () => null),
  pickFolder: vi.fn(async () => null)
}));

const { tabs } = await import('../src/lib/stores/tabs.svelte');

beforeEach(() => {
  files.clear();
  drafts.clear();
  reads.length = 0;
  deletedDrafts.length = 0;
  tabs.tabs = [];
  tabs.activeIndex = -1;
});

afterEach(() => {
  tabs.tabs = [];
  tabs.activeIndex = -1;
});

const anchor = { pos: 0, offset: 0 };

describe('a tab restored from the last session', () => {
  it('exists without the file having been read', () => {
    files.set('C:/notes/a.md', { content: 'hello', mtimeMs: 100 });
    tabs.addRestored('C:/notes/a.md', 12, { pos: 40, offset: 3 });

    const tab = tabs.tabs[0]!;
    expect(tab.loaded).toBe(false);
    expect(tab.fileName).toBe('a.md');
    expect(tab.content).toBe('');
    expect(reads).toEqual([]);
  });

  it('keeps the place the reader left, so it survives a session with no reading at all', () => {
    files.set('C:/notes/a.md', { content: 'hello', mtimeMs: 100 });
    tabs.addRestored('C:/notes/a.md', 12, { pos: 40, offset: 3 });

    expect(tabs.tabs[0]).toMatchObject({ cursor: 12, scroll: { pos: 40, offset: 3 } });
  });

  it('does not restore the same file twice', () => {
    tabs.addRestored('C:/notes/a.md', 0, anchor);
    tabs.addRestored('C:/notes/a.md', 0, anchor);
    expect(tabs.tabs).toHaveLength(1);
  });
});

describe('reading it when it is finally opened', () => {
  it('fills in the document and keeps the restored position', async () => {
    files.set('C:/notes/a.md', { content: 'hello', mtimeMs: 100 });
    tabs.addRestored('C:/notes/a.md', 12, { pos: 40, offset: 3 });

    await tabs.ensureLoaded(tabs.tabs[0]!.id);

    expect(tabs.tabs[0]).toMatchObject({
      loaded: true,
      content: 'hello',
      cursor: 12,
      scroll: { pos: 40, offset: 3 }
    });
    expect(reads).toEqual(['C:/notes/a.md']);
  });

  it('reads the file once, however often it is asked', async () => {
    files.set('C:/notes/a.md', { content: 'hello', mtimeMs: 100 });
    tabs.addRestored('C:/notes/a.md', 0, anchor);

    await tabs.ensureLoaded(tabs.tabs[0]!.id);
    await tabs.ensureLoaded(tabs.tabs[0]!.id);

    expect(reads).toHaveLength(1);
  });

  it('applies a draft newer than the file, and says it did', async () => {
    // The whole point of the exercise: unsaved work must be noticed when the
    // text comes into memory, whenever that happens to be.
    files.set('C:/notes/a.md', { content: 'on disk', mtimeMs: 100 });
    drafts.set('doc-Cnotesamd', { content: 'unsaved typing', savedAtMs: 200 });
    tabs.addRestored('C:/notes/a.md', 0, anchor);

    await tabs.ensureLoaded(tabs.tabs[0]!.id);

    expect(tabs.tabs[0]).toMatchObject({
      content: 'unsaved typing',
      dirty: true,
      recovered: { savedAtMs: 200, onDisk: 'on disk' }
    });
  });

  it('ignores a draft older than the file', async () => {
    files.set('C:/notes/a.md', { content: 'on disk', mtimeMs: 300 });
    drafts.set('doc-Cnotesamd', { content: 'stale', savedAtMs: 200 });
    tabs.addRestored('C:/notes/a.md', 0, anchor);

    await tabs.ensureLoaded(tabs.tabs[0]!.id);

    expect(tabs.tabs[0]).toMatchObject({ content: 'on disk', dirty: false, recovered: null });
  });

  it('marks a file that is no longer there instead of dropping the tab', async () => {
    tabs.addRestored('C:/notes/gone.md', 0, anchor);

    const ok = await tabs.ensureLoaded(tabs.tabs[0]!.id);

    expect(ok).toBe(false);
    expect(tabs.tabs).toHaveLength(1);
    expect(tabs.tabs[0]).toMatchObject({ external: 'removed', loaded: true });
  });
});

describe('closing a tab that was never read', () => {
  it('leaves its draft alone — that text has not been seen, let alone refused', async () => {
    files.set('C:/notes/a.md', { content: 'on disk', mtimeMs: 100 });
    tabs.addRestored('C:/notes/a.md', 0, anchor);

    tabs.close(0);

    expect(deletedDrafts).toEqual([]);
  });

  it('discards the draft of a tab that was read and closed', async () => {
    files.set('C:/notes/a.md', { content: 'on disk', mtimeMs: 100 });
    tabs.addRestored('C:/notes/a.md', 0, anchor);
    await tabs.ensureLoaded(tabs.tabs[0]!.id);

    tabs.close(0);

    expect(deletedDrafts).toEqual(['doc-Cnotesamd']);
  });
});
