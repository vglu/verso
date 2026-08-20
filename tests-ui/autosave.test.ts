import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Autosave is a promise to write, and this project's older promise is that it
 * never writes a byte nobody typed. Most of these tests are therefore about
 * when it must stay quiet.
 */
const saveFile = vi.fn(async () => ({ mtimeMs: Date.now() }));

vi.mock('../src/lib/ipc/commands', () => ({
  saveFile: (...args: unknown[]) => saveFile(...(args as [])),
  readFile: vi.fn(),
  statFile: vi.fn(async () => ({ mtimeMs: 0, exists: true })),
  draftSave: vi.fn(),
  draftGet: vi.fn(async () => null),
  draftDelete: vi.fn(),
  draftsList: vi.fn(async () => []),
  watchPaths: vi.fn(),
  settingsLoad: vi.fn(),
  settingsSave: vi.fn(),
  setMenuLabels: vi.fn(),
  pluginsLoad: vi.fn(async () => []),
  pluginsDir: vi.fn(async () => ''),
  revealInOs: vi.fn(),
  openExternal: vi.fn(),
  getStartupFiles: vi.fn(async () => []),
  readImageDataUri: vi.fn(),
  writeExport: vi.fn(),
  readTheme: vi.fn()
}));

const { tabs } = await import('../src/lib/stores/tabs.svelte');
const { settings } = await import('../src/lib/stores/settings.svelte');

/** A tab as it is after a file has been opened and then typed in. */
function openTab(path: string): string {
  const id = `doc-${path}`;
  tabs.tabs.push({
    id,
    path,
    fileName: path.split('/').pop() ?? path,
    dirPath: '/docs',
    content: 'before',
    baseMtimeMs: 1,
    encoding: 'utf-8',
    eol: 'lf',
    mixedEol: false,
    trailingNewline: true,
    dirty: false,
    loaded: true,
    readonly: false,
    readonlyReason: null,
    external: 'none',
    recovered: null,
    cursor: 0,
    scroll: { pos: 0, offset: 0 }
  });
  tabs.activeIndex = tabs.tabs.length - 1;
  return id;
}

describe('autosaving the file', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    saveFile.mockClear();
    tabs.tabs.length = 0;
    tabs.activeIndex = -1;
    settings.value = { ...settings.value, autosave: 'off', autosaveDelayMs: 1000 };
  });

  it('writes nothing at all when it is off', async () => {
    const id = openTab('/docs/a.md');
    tabs.setContent(id, 'after');
    await vi.advanceTimersByTimeAsync(5000);
    expect(saveFile).not.toHaveBeenCalled();
  });

  it('writes once the typing stops', async () => {
    settings.value = { ...settings.value, autosave: 'afterDelay' };
    const id = openTab('/docs/a.md');
    tabs.setContent(id, 'after');
    await vi.advanceTimersByTimeAsync(1100);
    expect(saveFile).toHaveBeenCalledTimes(1);
  });

  it('waits for the pause rather than writing on every keystroke', async () => {
    settings.value = { ...settings.value, autosave: 'afterDelay' };
    const id = openTab('/docs/a.md');
    for (const text of ['a', 'ab', 'abc', 'abcd']) {
      tabs.setContent(id, text);
      await vi.advanceTimersByTimeAsync(300);
    }
    expect(saveFile).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(saveFile).toHaveBeenCalledTimes(1);
  });

  it('leaves an untitled document alone', async () => {
    // Saving it would open a dialog, and a dialog nobody asked for is not an
    // autosave.
    settings.value = { ...settings.value, autosave: 'afterDelay' };
    const id = openTab('');
    const tab = tabs.tabs.find((x) => x.id === id)!;
    tab.path = null;
    tabs.setContent(id, 'after');
    await vi.advanceTimersByTimeAsync(3000);
    expect(saveFile).not.toHaveBeenCalled();
  });

  it('does not answer a conflict banner by overwriting the other program', async () => {
    settings.value = { ...settings.value, autosave: 'afterDelay' };
    const id = openTab('/docs/a.md');
    tabs.setContent(id, 'after');
    tabs.tabs.find((x) => x.id === id)!.external = 'modified';
    await vi.advanceTimersByTimeAsync(3000);
    expect(saveFile).not.toHaveBeenCalled();
  });

  it('writes everything dirty when the window loses focus', async () => {
    settings.value = { ...settings.value, autosave: 'onFocusChange' };
    const a = openTab('/docs/a.md');
    const b = openTab('/docs/b.md');
    tabs.setContent(a, 'one');
    tabs.setContent(b, 'two');
    await tabs.autosaveAll();
    expect(saveFile).toHaveBeenCalledTimes(2);
  });

  it('writes nothing on focus change when autosave is off', async () => {
    const id = openTab('/docs/a.md');
    tabs.setContent(id, 'after');
    await tabs.autosaveAll();
    expect(saveFile).not.toHaveBeenCalled();
  });
});
