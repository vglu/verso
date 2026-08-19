/**
 * Open documents. This store owns everything about a tab except the editor
 * itself: CodeMirror instances are kept in a plain Map outside the reactive
 * state, because wrapping an EditorView in a Svelte proxy breaks it.
 */
import {
  draftDelete,
  draftGet,
  draftSave,
  readFile,
  saveFile,
  statFile,
  watchPaths
} from '../ipc/commands';
import { isAppError, type AppError, type Encoding, type Eol, type FileMeta } from '../ipc/types';
import { pickSaveTarget } from '../ipc/dialogs';
import type { EditorHandle } from '../editor/createEditor';
import { settings } from './settings.svelte';
import { baseName, dirName } from '../editor/pathUtil';

export type ExternalState = 'none' | 'modified' | 'removed';

export interface Tab {
  id: string;
  path: string | null;
  fileName: string;
  dirPath: string;
  content: string;
  baseMtimeMs: number | null;
  encoding: Encoding;
  eol: Eol;
  mixedEol: boolean;
  trailingNewline: boolean;
  dirty: boolean;
  readonly: boolean;
  readonlyReason: string | null;
  external: ExternalState;
  /** Set when the buffer came from a recovered draft rather than the file. */
  recovered: { savedAtMs: number; onDisk: string } | null;
  cursor: number;
  scrollTop: number;
}

/** Editor handles live outside reactive state on purpose (see file header). */
const handles = new Map<string, EditorHandle>();

let untitledCounter = 0;

function tabFromMeta(meta: FileMeta, content: string): Tab {
  return {
    id: meta.docId,
    path: meta.path,
    fileName: meta.fileName,
    dirPath: meta.dirPath,
    content,
    baseMtimeMs: meta.mtimeMs,
    encoding: meta.encoding,
    eol: meta.eol,
    mixedEol: meta.mixedEol,
    trailingNewline: meta.trailingNewline,
    dirty: false,
    readonly: meta.readonly,
    readonlyReason: meta.readonly ? 'permissions' : null,
    external: 'none',
    recovered: null,
    cursor: 0,
    scrollTop: 0
  };
}

class TabsStore {
  tabs = $state<Tab[]>([]);
  activeIndex = $state(-1);
  /** Set while a save is in flight, so the UI can show progress. */
  saving = $state(false);
  lastError = $state<string | null>(null);

  private draftTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** mtimes we produced ourselves — used to ignore our own watch events. */
  private selfWrites = new Map<string, number>();

  get active(): Tab | null {
    return this.tabs[this.activeIndex] ?? null;
  }

  get hasTabs(): boolean {
    return this.tabs.length > 0;
  }

  handleOf(id: string): EditorHandle | null {
    return handles.get(id) ?? null;
  }

  registerHandle(id: string, handle: EditorHandle): void {
    handles.get(id)?.destroy();
    handles.set(id, handle);
  }

  /**
   * Called when the host element unmounts. The view layer owns the editor's
   * lifetime — closing a tab removes the element, which lands here.
   */
  unregisterHandle(id: string): void {
    handles.get(id)?.destroy();
    handles.delete(id);
  }

  indexOfPath(path: string): number {
    const target = normalizePath(path);
    return this.tabs.findIndex((t) => t.path && normalizePath(t.path) === target);
  }

  // ---- opening ----

  async openPath(path: string, options: { activate?: boolean } = {}): Promise<boolean> {
    const existing = this.indexOfPath(path);
    if (existing >= 0) {
      this.activate(existing);
      return true;
    }

    try {
      const opened = await readFile(path);
      const tab = tabFromMeta(opened.meta, opened.content);

      // A newer draft means the app died with unsaved text in this file.
      const draft = await draftGet(tab.id).catch(() => null);
      if (draft && draft.content !== opened.content && draft.savedAtMs > opened.meta.mtimeMs) {
        tab.content = draft.content;
        tab.dirty = true;
        // Say so. Opening a file and being handed different text without a
        // word is the one thing an editor must never do, however well meant.
        tab.recovered = { savedAtMs: draft.savedAtMs, onDisk: opened.content };
        // Re-persist it right away. Recovered text is still unsaved text, and
        // until it is written again it exists only in memory — a second crash,
        // or a cleanup pass that judges the draft stale, would take it for good.
        this.scheduleDraft(tab);
      }

      this.tabs.push(tab);
      if (options.activate !== false) this.activateLast();
      settings.pushRecent(tab.path!);
      void this.syncWatchList();
      return true;
    } catch (error) {
      this.reportError(error, path);
      return false;
    }
  }

  openUntitled(): void {
    untitledCounter += 1;
    this.tabs.push({
      id: `untitled-${untitledCounter}-${Date.now()}`,
      path: null,
      fileName: 'Untitled.md',
      dirPath: '',
      content: '',
      baseMtimeMs: null,
      encoding: 'utf-8',
      eol: 'lf',
      mixedEol: false,
      trailingNewline: true,
      dirty: false,
      readonly: false,
      readonlyReason: null,
      external: 'none',
      recovered: null,
      cursor: 0,
      scrollTop: 0
    });
    this.activateLast();
  }

  activate(index: number): void {
    if (index < 0 || index >= this.tabs.length) return;
    const current = this.active;
    if (current) {
      const handle = handles.get(current.id);
      if (handle) {
        current.cursor = handle.getCursor().pos;
        current.scrollTop = handle.getScrollTop();
      }
    }
    this.activeIndex = index;
  }

  activateLast(): void {
    this.activate(this.tabs.length - 1);
  }

  activateNext(delta: number): void {
    if (this.tabs.length === 0) return;
    const next = (this.activeIndex + delta + this.tabs.length) % this.tabs.length;
    this.activate(next);
  }

  // ---- editing ----

  /**
   * Mirror the editor's content into the tab. `userInitiated: false` is used
   * when the app itself rewrote the buffer (a reload from disk) — that must
   * not mark the tab as having unsaved changes.
   */
  setContent(id: string, content: string, userInitiated = true): void {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab) return;
    tab.content = content;
    if (!userInitiated) return;
    tab.dirty = true;
    this.scheduleDraft(tab);
  }

  /**
   * Queue a draft write for this tab's current buffer. Debounced, so typing
   * costs one write per pause rather than one per keystroke.
   */
  private scheduleDraft(tab: Tab): void {
    if (!tab.path || settings.value.autosaveDraftMs <= 0) return;

    const existing = this.draftTimers.get(tab.id);
    if (existing) clearTimeout(existing);

    this.draftTimers.set(
      tab.id,
      setTimeout(() => {
        this.draftTimers.delete(tab.id);
        if (!tab.dirty || !tab.path) return;
        void draftSave(tab.id, tab.path, tab.baseMtimeMs ?? 0, tab.content).catch((e) =>
          console.warn('draft save failed', e)
        );
      }, settings.value.autosaveDraftMs)
    );
  }

  // ---- saving ----

  async save(index = this.activeIndex, force = false): Promise<boolean> {
    const tab = this.tabs[index];
    if (!tab) return false;
    if (tab.readonly && tab.readonlyReason !== null) return this.saveAs(index);
    if (!tab.path) return this.saveAs(index);

    this.saving = true;
    try {
      const result = await saveFile(tab.path, tab.content, force ? null : tab.baseMtimeMs, {
        encoding: tab.encoding,
        eol: tab.eol,
        trailingNewline: tab.trailingNewline
      });

      tab.baseMtimeMs = result.mtimeMs;
      tab.dirty = false;
      tab.external = 'none';
      tab.recovered = null; // the draft is now the file
      this.selfWrites.set(normalizePath(tab.path), result.mtimeMs);
      await draftDelete(tab.id).catch(() => undefined);
      return true;
    } catch (error) {
      if (isAppError(error) && error.kind === 'ExternalModified') {
        tab.external = 'modified';
        return false;
      }
      this.reportError(error, tab.path);
      return false;
    } finally {
      this.saving = false;
    }
  }

  async saveAs(index = this.activeIndex): Promise<boolean> {
    const tab = this.tabs[index];
    if (!tab) return false;

    const target = await pickSaveTarget(tab.fileName, tab.dirPath || null);
    if (!target) return false;

    this.saving = true;
    try {
      const result = await saveFile(target, tab.content, null, {
        encoding: tab.encoding,
        eol: tab.eol,
        trailingNewline: tab.trailingNewline
      });

      const oldId = tab.id;
      // Re-read so the tab picks up the canonical path and fresh identity.
      const opened = await readFile(target);
      const handle = handles.get(oldId);

      Object.assign(tab, tabFromMeta(opened.meta, tab.content));
      tab.dirty = false;
      tab.baseMtimeMs = result.mtimeMs;

      if (handle && oldId !== tab.id) {
        handles.delete(oldId);
        handles.set(tab.id, handle);
      }
      await draftDelete(oldId).catch(() => undefined);
      settings.pushRecent(tab.path!);
      void this.syncWatchList();
      return true;
    } catch (error) {
      this.reportError(error, target);
      return false;
    } finally {
      this.saving = false;
    }
  }

  // ---- closing ----

  /** Removes the tab. Callers handle the "unsaved changes" prompt first. */
  close(index: number, { discardDraft = true }: { discardDraft?: boolean } = {}): void {
    const tab = this.tabs[index];
    if (!tab) return;

    const timer = this.draftTimers.get(tab.id);
    if (timer) {
      clearTimeout(timer);
      this.draftTimers.delete(tab.id);
    }
    if (discardDraft) void draftDelete(tab.id).catch(() => undefined);

    // The editor instance is torn down by the host element unmounting.
    this.tabs.splice(index, 1);
    if (this.tabs.length === 0) {
      this.activeIndex = -1;
    } else if (this.activeIndex >= this.tabs.length) {
      this.activeIndex = this.tabs.length - 1;
    }
    void this.syncWatchList();
  }

  // ---- external changes ----

  async reloadFromDisk(index: number): Promise<void> {
    const tab = this.tabs[index];
    if (!tab?.path) return;
    try {
      const opened = await readFile(tab.path);
      const handle = handles.get(tab.id);
      const cursor = handle?.getCursor().pos ?? 0;

      tab.content = opened.content;
      tab.baseMtimeMs = opened.meta.mtimeMs;
      tab.encoding = opened.meta.encoding;
      tab.eol = opened.meta.eol;
      tab.trailingNewline = opened.meta.trailingNewline;
      tab.dirty = false;
      tab.external = 'none';

      handle?.setContent(opened.content);
      handle?.setCursor(Math.min(cursor, opened.content.length));
      await draftDelete(tab.id).catch(() => undefined);
    } catch (error) {
      this.reportError(error, tab.path);
    }
  }

  /** Called for every `fs:changed` event. */
  async onExternalChange(path: string, kind: 'modified' | 'removed' | 'renamed'): Promise<void> {
    const index = this.indexOfPath(path);
    if (index < 0) return;
    const tab = this.tabs[index]!;

    if (kind === 'removed' || kind === 'renamed') {
      // Confirm before alarming the user: a rename-based save looks like a
      // delete for a moment, and the file is usually right back.
      const stat = await statFile(tab.path!).catch(() => null);
      if (stat?.exists) return;
      tab.external = 'removed';
      return;
    }

    const stat = await statFile(tab.path!).catch(() => null);
    if (!stat?.exists) return;

    // Ignore the event our own save just produced.
    const mine = this.selfWrites.get(normalizePath(tab.path!));
    if (mine !== undefined && Math.abs(stat.mtimeMs - mine) < 2000) return;
    if (tab.baseMtimeMs !== null && stat.mtimeMs <= tab.baseMtimeMs) return;

    if (tab.dirty) {
      tab.external = 'modified';
    } else {
      await this.reloadFromDisk(index);
    }
  }

  /** Re-check every open file — cheap safety net when the window regains focus. */
  async recheckAll(): Promise<void> {
    for (let i = 0; i < this.tabs.length; i++) {
      const tab = this.tabs[i]!;
      if (!tab.path || tab.external !== 'none') continue;
      const stat = await statFile(tab.path).catch(() => null);
      if (!stat) continue;
      if (!stat.exists) {
        tab.external = 'removed';
        continue;
      }
      if (tab.baseMtimeMs !== null && stat.mtimeMs > tab.baseMtimeMs) {
        const mine = this.selfWrites.get(normalizePath(tab.path));
        if (mine !== undefined && Math.abs(stat.mtimeMs - mine) < 2000) continue;
        if (tab.dirty) tab.external = 'modified';
        else await this.reloadFromDisk(i);
      }
    }
  }

  /**
   * "Keep my version": acknowledge what is on disk and carry on from here.
   *
   * The guard is re-armed against the current state of the file rather than
   * switched off. Disabling it left the tab permanently unguarded, so a
   * *later*, unrelated change by another program would be overwritten without
   * a word.
   */
  /** Drop recovered text and go back to what the file on disk holds. */
  discardRecovered(index: number): void {
    const tab = this.tabs[index];
    if (!tab?.recovered) return;

    const onDisk = tab.recovered.onDisk;
    tab.recovered = null;
    tab.content = onDisk;
    tab.dirty = false;
    handles.get(tab.id)?.setContent(onDisk);
    void draftDelete(tab.id).catch(() => undefined);
  }

  /** Keep the recovered text; it becomes an ordinary unsaved change. */
  acceptRecovered(index: number): void {
    const tab = this.tabs[index];
    if (tab) tab.recovered = null;
  }

  async keepMine(index: number): Promise<void> {
    const tab = this.tabs[index];
    if (!tab) return;
    tab.external = 'none';

    if (!tab.path) {
      tab.baseMtimeMs = null;
      return;
    }
    const stat = await statFile(tab.path).catch(() => null);
    tab.baseMtimeMs = stat?.exists ? stat.mtimeMs : null;
  }

  /** Tell the backend which paths to observe (open files + their folders). */
  async syncWatchList(extra: string[] = []): Promise<void> {
    const paths = this.tabs
      .map((t) => t.path)
      .filter((p): p is string => Boolean(p))
      .concat(extra);
    await watchPaths(paths).catch((e) => console.warn('watch failed', e));
  }

  /** Flush pending drafts — called before the window closes. */
  async flushDrafts(): Promise<void> {
    for (const [id, timer] of this.draftTimers) {
      clearTimeout(timer);
      this.draftTimers.delete(id);
      const tab = this.tabs.find((t) => t.id === id);
      if (tab?.dirty && tab.path) {
        await draftSave(tab.id, tab.path, tab.baseMtimeMs ?? 0, tab.content).catch(() => undefined);
      }
    }
  }

  private reportError(error: unknown, path: string | null): void {
    const message = describeError(error, path);
    this.lastError = message;
    console.error('[mdviewer]', message, error);
  }
}

function describeError(error: unknown, path: string | null): string {
  if (!isAppError(error)) return String(error);
  const e = error as AppError;
  switch (e.kind) {
    case 'NotFound':
      return `File not found: ${e.path}`;
    case 'PermissionDenied':
      return `Permission denied: ${e.path}`;
    case 'IsBinary':
      return `Not a text file: ${e.path}`;
    case 'UnsupportedEncoding':
      return `Unsupported encoding (${e.detected}): ${e.path}`;
    case 'ExternalModified':
      return `File changed on disk: ${e.path}`;
    default:
      return e.message || `Failed to open ${path ?? 'file'}`;
  }
}

/** Windows paths are case-insensitive; comparisons must be too. */
function normalizePath(p: string): string {
  const unified = p.replace(/\\/g, '/');
  return /^[a-zA-Z]:/.test(unified) ? unified.toLowerCase() : unified;
}

export const tabs = new TabsStore();
export { baseName, dirName };
