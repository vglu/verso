import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Two documents side by side.
 *
 * The risk here is not the layout — it is the bookkeeping underneath it. One
 * list of open documents now answers two questions at once ("what is in this
 * pane" and "what is in front"), and the ways that goes wrong are all quiet:
 * closing a file on the left changing what is on the right, a pane left
 * pointing at a document that no longer exists, a split that will not fold
 * back. None of those show up in a screenshot.
 */

vi.mock('../src/lib/ipc/commands', () => ({
  readFile: vi.fn(),
  saveFile: vi.fn(),
  statFile: vi.fn(async () => ({ exists: true, mtimeMs: 1 })),
  watchPaths: vi.fn(async () => undefined),
  draftSave: vi.fn(async () => undefined),
  draftGet: vi.fn(async () => null),
  draftDelete: vi.fn(async () => undefined),
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

/** Three untitled documents, all in the left pane, the last one in front. */
function openThree(): void {
  tabs.openUntitled('', 'a', 'first');
  tabs.openUntitled('', 'b', 'second');
  tabs.openUntitled('', 'c', 'third');
}

const idsIn = (pane: 0 | 1): string[] => tabs.entriesIn(pane).map((entry) => entry.tab.id);

beforeEach(() => {
  tabs.tabs = [];
  tabs.unsplit();
});

afterEach(() => {
  tabs.tabs = [];
  tabs.unsplit();
});

describe('splitting the window', () => {
  it('takes the document in front across, and leaves the rest behind', () => {
    openThree();
    tabs.activate(1); // "b" is in front

    tabs.toggleSplit();

    expect(tabs.split).toBe(true);
    expect(idsIn(0)).toEqual(['a', 'c']);
    expect(idsIn(1)).toEqual(['b']);
    expect(tabs.focusedPane).toBe(1);
    expect(tabs.active?.id).toBe('b');
  });

  it('opens empty next to a single document rather than emptying the window', () => {
    tabs.openUntitled('', 'only', 'x');

    tabs.toggleSplit();

    expect(tabs.split).toBe(true);
    expect(idsIn(0)).toEqual(['only']);
    expect(idsIn(1)).toEqual([]);
    // The empty pane has the focus, so the next file opened lands in it.
    expect(tabs.focusedPane).toBe(1);
  });

  it('a document opened while the second pane has the focus lands in it', () => {
    tabs.openUntitled('', 'left', 'x');
    tabs.toggleSplit();

    tabs.openUntitled('', 'right', 'y');

    expect(idsIn(0)).toEqual(['left']);
    expect(idsIn(1)).toEqual(['right']);
  });

  it('folds back into one pane, keeping what was in front', () => {
    openThree();
    tabs.activate(1);
    tabs.toggleSplit(); // "b" goes right

    tabs.toggleSplit();

    expect(tabs.split).toBe(false);
    expect(idsIn(0)).toEqual(['a', 'b', 'c']);
    expect(tabs.active?.id).toBe('b');
    expect(tabs.focusedPane).toBe(0);
  });
});

describe('each pane keeps its own document', () => {
  it('closing on one side does not change what the other is showing', () => {
    openThree();
    tabs.activate(2);
    tabs.toggleSplit(); // "c" to the right; "a" and "b" on the left
    tabs.activate(tabs.tabs.findIndex((t) => t.id === 'b'));

    tabs.close(tabs.tabs.findIndex((t) => t.id === 'b'));

    expect(tabs.activeIndexIn(1)).toBe(tabs.tabs.findIndex((t) => t.id === 'c'));
    expect(idsIn(1)).toEqual(['c']);
    // The left pane fell back to its own remaining document, not to the right one.
    expect(tabs.tabs[tabs.activeIndexIn(0)]?.id).toBe('a');
  });

  it('the pane in front is the one whose tab was activated', () => {
    openThree();
    tabs.activate(2);
    tabs.toggleSplit();

    tabs.activate(0);
    expect(tabs.focusedPane).toBe(0);
    expect(tabs.active?.id).toBe('a');

    tabs.activate(tabs.tabs.findIndex((t) => t.id === 'c'));
    expect(tabs.focusedPane).toBe(1);
  });

  it('walking with Ctrl+Tab stays inside the pane being worked in', () => {
    openThree();
    tabs.activate(2);
    tabs.toggleSplit(); // right: c — left: a, b
    tabs.activate(0); // left pane, "a"

    tabs.activateNext(1);
    expect(tabs.active?.id).toBe('b');
    tabs.activateNext(1);
    expect(tabs.active?.id).toBe('a'); // wrapped, never reaching "c"
  });
});

describe('a document whose id changes on the way in', () => {
  it('stays on screen when a restored tab is finally read', async () => {
    const commands = await import('../src/lib/ipc/commands');
    vi.mocked(commands.readFile).mockResolvedValue({
      content: '# read at last',
      meta: {
        path: 'C:/notes/late.md',
        // The real id, replacing the provisional one the tab was given.
        docId: 'doc-late',
        fileName: 'late.md',
        dirPath: 'C:/notes',
        mtimeMs: 1,
        readonly: false,
        encoding: 'utf-8',
        eol: 'lf',
        mixedEol: false,
        trailingNewline: true
      }
    } as never);

    tabs.openUntitled('', 'left', 'x');
    tabs.toggleSplit();
    tabs.addRestored('C:/notes/late.md', 0, { pos: 0, offset: 0 }, 1);
    const index = tabs.tabs.findIndex((tab) => tab.path === 'C:/notes/late.md');
    tabs.activate(index);
    expect(tabs.tabs[index]!.id).toMatch(/^unread-/);

    await tabs.ensureLoaded(tabs.tabs[index]!.id);

    // The pane was pointing at the provisional id; it has to follow.
    expect(tabs.tabs[index]!.id).toBe('doc-late');
    expect(tabs.activeIndexIn(1)).toBe(index);
  });
});

describe('the split closes itself when a pane runs out', () => {
  it('the last document of a pane closing gives the window back', () => {
    openThree();
    tabs.activate(2);
    tabs.toggleSplit(); // right: c

    tabs.close(tabs.tabs.findIndex((t) => t.id === 'c'));

    expect(tabs.split).toBe(false);
    expect(idsIn(0)).toEqual(['a', 'b']);
  });

  it('moving the last one out does not, because that is how a pane is filled', () => {
    tabs.openUntitled('', 'only', 'x');
    tabs.toggleSplit();
    tabs.moveToPane(0, 1);

    expect(tabs.split).toBe(true);
    expect(idsIn(0)).toEqual([]);
    expect(idsIn(1)).toEqual(['only']);
  });
});
