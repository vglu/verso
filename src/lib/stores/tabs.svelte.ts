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
import type { EditorHandle, ScrollAnchor } from '../editor/createEditor';
import { settings } from './settings.svelte';
import { baseName, dirName } from '../editor/pathUtil';
import { createDraftQueue } from './draftQueue';
import { t } from './i18n';

export type ExternalState = 'none' | 'modified' | 'removed';

/**
 * Which half of the window a document is in.
 *
 * There is one list of open documents, not two: everything that acts on a
 * document — saving, watching, drafts, reloading — is indifferent to where it
 * is being shown, and splitting that list in two would have meant splitting
 * all of it. A pane is a property of a tab, and the second pane exists only
 * while `split` is true.
 */
export type PaneId = 0 | 1;

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
  /**
   * Whether the file behind this tab has actually been read.
   *
   * A restored session is a list of paths, not a list of documents: reading
   * all of them before the window settles costs an IPC round trip, an encoding
   * pass and a per-line ending scan each, for documents nobody has looked at
   * yet. A tab is read the first time it is shown.
   */
  loaded: boolean;
  readonly: boolean;
  readonlyReason: string | null;
  external: ExternalState;
  /** Set when the buffer came from a recovered draft rather than the file. */
  recovered: { savedAtMs: number; onDisk: string } | null;
  cursor: number;
  /** Where the reader was, as a place in the text rather than a pixel count. */
  scroll: ScrollAnchor;
  pane: PaneId;
}

/**
 * Editor handles live outside reactive state on purpose (see file header).
 *
 * A `SvelteMap` — what the lint rule asks for — would put every CodeMirror
 * view behind a reactive proxy and re-run whatever read it on each edit. These
 * are imperative handles: nothing renders from them, they are looked up and
 * called. The plain Map is the point.
 */
// eslint-disable-next-line svelte/prefer-svelte-reactivity
const handles = new Map<string, EditorHandle>();

let untitledCounter = 0;
let unreadCounter = 0;

function tabFromMeta(meta: FileMeta, content: string, pane: PaneId): Tab {
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
    loaded: true,
    readonly: meta.readonly,
    readonlyReason: meta.readonly ? 'permissions' : null,
    external: 'none',
    recovered: null,
    cursor: 0,
    scroll: { pos: 0, offset: 0 },
    pane
  };
}

class TabsStore {
  tabs = $state<Tab[]>([]);

  /** Whether the second pane is on screen. */
  split = $state(false);
  /**
   * The half showing a rendered page instead of an editor, if any.
   *
   * ADR-005: the preview is a page, not a second editor. One document is one
   * buffer and one editor — the reader writes on the left and looks on the
   * right, and there is never a question about which caret is the real one.
   */
  previewPane = $state<PaneId | null>(null);
  /** The pane the keyboard, the toolbar and the outline belong to. */
  focusedPane = $state<PaneId>(0);
  /**
   * What each pane is showing, by tab id rather than by index.
   *
   * Indexes shift under every close and every move; an id does not. The
   * active *index* is still what the rest of the store speaks, so it is
   * derived from this — one place where the two representations meet.
   */
  private currentIds = $state<[string | null, string | null]>([null, null]);
  /** Set while a save is in flight, so the UI can show progress. */
  saving = $state(false);
  lastError = $state<string | null>(null);

  /** Draft writes and their debounce; the rules are in draftQueue.ts. */
  private drafts = createDraftQueue({
    snapshot: (id) => {
      const tab = this.tabs.find((t) => t.id === id);
      if (!tab) return null;
      return {
        path: tab.path,
        baseMtimeMs: tab.baseMtimeMs,
        content: tab.content,
        dirty: tab.dirty
      };
    },
    write: draftSave,
    delay: () => settings.value.autosaveDraftMs
  });

  /** mtimes we produced ourselves — used to ignore our own watch events. */
  private selfWrites = new Map<string, number>();

  get activeIndex(): number {
    const id = this.currentIds[this.focusedPane];
    return id === null ? -1 : this.tabs.findIndex((tab) => tab.id === id);
  }

  /**
   * Setting it moves the focus as well: activating a tab is how a reader says
   * which half of the window they are working in.
   */
  set activeIndex(index: number) {
    const tab = this.tabs[index];
    if (!tab) {
      this.currentIds[this.focusedPane] = null;
      return;
    }
    this.focusedPane = tab.pane;
    this.currentIds[tab.pane] = tab.id;
  }

  get active(): Tab | null {
    return this.tabs[this.activeIndex] ?? null;
  }

  get hasTabs(): boolean {
    return this.tabs.length > 0;
  }

  // ---- panes ----

  /** The tabs of one pane, each with its index in the flat list. */
  entriesIn(pane: PaneId): Array<{ tab: Tab; index: number }> {
    const out: Array<{ tab: Tab; index: number }> = [];
    this.tabs.forEach((tab, index) => {
      if (tab.pane === pane) out.push({ tab, index });
    });
    return out;
  }

  hasTabsIn(pane: PaneId): boolean {
    return this.tabs.some((tab) => tab.pane === pane);
  }

  /** The tab a pane is showing — its own, whether or not the pane has focus. */
  activeIndexIn(pane: PaneId): number {
    const id = this.currentIds[pane];
    return id === null ? -1 : this.tabs.findIndex((tab) => tab.id === id);
  }

  focusPane(pane: PaneId): void {
    if (!this.split && pane === 1) return;
    // A page cannot be typed into, so it never takes the keyboard: clicking
    // the preview must not leave the next keystroke with nowhere to go.
    if (this.previewPane === pane) return;
    this.focusedPane = pane;
  }

  /**
   * Show the document beside its own rendering, or stop.
   *
   * Turning it on splits the window and gives the right half to the page. The
   * left half keeps the document and the caret; what the reader asked for was
   * "source and preview on one screen", and the source is where the writing
   * happens.
   */
  toggleSourceAndPreview(): void {
    if (this.previewPane !== null) {
      this.previewPane = null;
      if (!this.hasTabsIn(1)) this.unsplit();
      return;
    }

    this.split = true;
    this.previewPane = 1;
    this.focusedPane = 0;
  }

  /**
   * Open the second pane, or fold it back into the first.
   *
   * Opening it takes the current document across when there is another one to
   * leave behind: splitting a window to look at one file twice is not what the
   * gesture means, and a pane that opens empty next to your only document is a
   * pane you then have to fill.
   */
  toggleSplit(): void {
    if (this.split) {
      this.unsplit();
      return;
    }

    const staying = this.tabs.filter((tab) => tab.pane === 0);
    const moving =
      staying.length > 1 ? this.tabs.findIndex((t) => t.id === this.currentIds[0]) : -1;

    this.split = true;
    this.focusedPane = 1;
    this.currentIds[1] = null;
    if (moving >= 0) this.moveToPane(moving, 1);
  }

  /** Everything back into one pane, keeping whatever was in front. */
  unsplit(): void {
    this.previewPane = null;
    const keep = this.currentIds[this.focusedPane] ?? this.currentIds[0] ?? this.currentIds[1];
    for (const tab of this.tabs) tab.pane = 0;
    this.currentIds = [keep, null];
    this.split = false;
    this.focusedPane = 0;
  }

  /** Send one document to the other half of the window. */
  moveToPane(index: number, pane: PaneId): void {
    const tab = this.tabs[index];
    if (!tab || tab.pane === pane) return;

    const from = tab.pane;
    tab.pane = pane;
    if (pane === 1) this.split = true;
    if (this.currentIds[from] === tab.id) this.currentIds[from] = this.neighbourIn(from, index);
    this.currentIds[pane] = tab.id;
    this.focusedPane = pane;
  }

  /**
   * A document's id changes twice in its life: when a restored tab is finally
   * read, and when an untitled buffer is saved to a path. Both replace a
   * provisional id with the real one — and a pane remembers what it is
   * showing by id, so both have to be followed here or the pane goes blank
   * while the document is right there.
   */
  private retargetPanes(oldId: string, newId: string): void {
    if (oldId === newId) return;
    for (const pane of [0, 1] as PaneId[]) {
      if (this.currentIds[pane] === oldId) this.currentIds[pane] = newId;
    }
  }

  /** The tab a pane should fall back to once one of its own is gone. */
  private neighbourIn(pane: PaneId, hole: number): string | null {
    const entries = this.entriesIn(pane).filter((entry) => entry.index !== hole);
    if (entries.length === 0) return null;
    const after = entries.find((entry) => entry.index >= hole);
    return (after ?? entries[entries.length - 1]!).tab.id;
  }

  /**
   * A pane that has just lost its last document gives the window back.
   *
   * Only after a close: moving a document out of a pane deliberately leaves
   * an empty one, which is how a reader makes room for the next file.
   */
  private collapseEmptyPane(): void {
    if (!this.split) return;
    if (this.hasTabsIn(0) && this.hasTabsIn(1)) return;
    this.unsplit();
  }

  handleOf(id: string): EditorHandle | null {
    return handles.get(id) ?? null;
  }

  /**
   * Turn spell checking on or off, everywhere at once.
   *
   * Lives here rather than in the settings store because this is the side
   * that knows the open editors — and because a settings store that reached
   * back into the tabs would close a circle between the two.
   *
   * Applied to editors that are already open as well as ones opened later: a
   * setting that only takes effect in new tabs is a setting people report as
   * broken.
   */
  setSpellcheck(on: boolean): void {
    settings.update({ spellcheck: on });
    for (const tab of this.tabs) handles.get(tab.id)?.setSpellcheck(on);
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
      const tab = tabFromMeta(opened.meta, opened.content, this.focusedPane);
      await this.applyDraft(tab, opened.content, opened.meta.mtimeMs);

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

  /**
   * A draft newer than the file means the app died with unsaved text in it.
   *
   * Shared by opening a file and by loading a restored tab, because both are
   * the moment a document's text first comes into memory — and that is the
   * moment the draft has to be noticed, or it is silently overwritten later.
   */
  private async applyDraft(tab: Tab, onDisk: string, mtimeMs: number): Promise<void> {
    const draft = await draftGet(tab.id).catch(() => null);
    if (!draft || draft.content === onDisk || draft.savedAtMs <= mtimeMs) return;

    tab.content = draft.content;
    tab.dirty = true;
    // Say so. Opening a file and being handed different text without a word is
    // the one thing an editor must never do, however well meant.
    tab.recovered = { savedAtMs: draft.savedAtMs, onDisk };
    // Re-persist it right away. Recovered text is still unsaved text, and until
    // it is written again it exists only in memory — a second crash, or a
    // cleanup pass that judges the draft stale, would take it for good.
    this.scheduleDraft(tab);
  }

  /**
   * A tab from a previous session: its path, and nothing else yet.
   *
   * The file is read when the tab is first shown. Restoring twelve documents
   * eagerly meant twelve IPC round trips, twelve encoding passes and twelve
   * per-line ending scans before the window was usable — all for documents
   * behind tabs nobody had chosen.
   */
  addRestored(path: string, cursor: number, scroll: ScrollAnchor, pane: PaneId = 0): void {
    if (this.indexOfPath(path) >= 0) return;

    unreadCounter += 1;
    this.tabs.push({
      // Provisional, and deliberately opaque: the real document id comes from
      // the file when it is read. It must not be built out of the path —
      // document ids end up in draft file names, and a path in one is a path
      // in a file name. Nothing is keyed by this until the file is read: a tab
      // with no content has no editor, and so no handle to move.
      id: `unread-${unreadCounter}`,
      path,
      fileName: baseName(path),
      dirPath: dirName(path),
      content: '',
      baseMtimeMs: null,
      encoding: 'utf-8',
      eol: 'lf',
      mixedEol: false,
      trailingNewline: true,
      dirty: false,
      loaded: false,
      readonly: false,
      readonlyReason: null,
      external: 'none',
      recovered: null,
      cursor,
      scroll,
      pane
    });
  }

  /**
   * Read the file behind a restored tab, if it has not been read yet.
   *
   * Returns false when the file could not be read — the tab stays, marked as
   * missing, rather than vanishing without explanation.
   */
  async ensureLoaded(id: string): Promise<boolean> {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab) return false;
    if (tab.loaded) return true;
    if (!tab.path) return true;

    const path = tab.path;
    try {
      const opened = await readFile(path);
      const cursor = tab.cursor;
      const scroll = tab.scroll;
      const provisionalId = tab.id;

      Object.assign(tab, tabFromMeta(opened.meta, opened.content, tab.pane));
      this.retargetPanes(provisionalId, tab.id);
      tab.cursor = cursor;
      tab.scroll = scroll;
      await this.applyDraft(tab, opened.content, opened.meta.mtimeMs);

      void this.syncWatchList();
      return true;
    } catch (error) {
      tab.loaded = true; // do not retry on every render
      tab.external = 'removed';
      this.reportError(error, path);
      return false;
    }
  }

  /**
   * A new, empty document. Nothing is written to disk until the first save:
   * a file created the moment someone presses Ctrl+N would leave a trail of
   * empty files behind every time they changed their mind.
   *
   * `dirPath` is where the save dialog will open, so "new file here" in the
   * tree lands in the folder the reader pointed at.
   */
  openUntitled(dirPath = '', id?: string, content = ''): string {
    untitledCounter += 1;
    const tabId = id ?? `untitled-${untitledCounter}-${Date.now()}`;
    this.tabs.push({
      id: tabId,
      path: null,
      fileName: this.nextUntitledName(),
      dirPath,
      content,
      baseMtimeMs: null,
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
      scroll: { pos: 0, offset: 0 },
      pane: this.focusedPane
    });
    this.activateLast();
    return tabId;
  }

  /** `Untitled.md`, then `Untitled 2.md`: two tabs must not share a name. */
  private nextUntitledName(): string {
    const taken = new Set(this.tabs.filter((t) => !t.path).map((t) => t.fileName));
    if (!taken.has('Untitled.md')) return 'Untitled.md';
    for (let n = 2; ; n++) {
      const name = `Untitled ${n}.md`;
      if (!taken.has(name)) return name;
    }
  }

  activate(index: number): void {
    if (index < 0 || index >= this.tabs.length) return;
    const current = this.active;
    if (current) {
      const handle = handles.get(current.id);
      if (handle) {
        current.cursor = handle.getCursor().pos;
        current.scroll = handle.getScrollAnchor();
      }
      // Leaving a document counts as a focus change: this is what
      // `onFocusChange` means in the editor people know it from.
      if (settings.value.autosave === 'onFocusChange' && current.dirty) {
        const from = this.tabs.indexOf(current);
        if (from >= 0) void this.save(from);
      }
    }
    this.activeIndex = index;
  }

  activateLast(): void {
    this.activate(this.tabs.length - 1);
  }

  /** Next or previous document — within the pane being worked in. */
  activateNext(delta: number): void {
    const entries = this.entriesIn(this.focusedPane);
    if (entries.length === 0) return;
    const at = entries.findIndex((entry) => entry.tab.id === this.currentIds[this.focusedPane]);
    const next = entries[(at + delta + entries.length) % entries.length]!;
    this.activate(next.index);
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
    this.scheduleAutosave(tab);
  }

  /**
   * Autosave, when the reader has asked for it.
   *
   * The timer is per tab and restarts on every keystroke, so a document is
   * written once the typing stops rather than in the middle of a word. A file
   * that has never been saved is left alone: `save` would open a dialog, and a
   * dialog nobody asked for is not an autosave.
   *
   * Drafts are unaffected either way — they are the crash net, and they are
   * always on. This is about the file itself.
   */
  private autosaveTimers = new Map<string, ReturnType<typeof setTimeout>>();

  private scheduleAutosave(tab: Tab): void {
    if (settings.value.autosave !== 'afterDelay' || !tab.path || tab.readonly) return;

    const existing = this.autosaveTimers.get(tab.id);
    if (existing) clearTimeout(existing);

    const delay = Math.max(200, settings.value.autosaveDelayMs);
    this.autosaveTimers.set(
      tab.id,
      setTimeout(() => {
        this.autosaveTimers.delete(tab.id);
        const index = this.tabs.findIndex((x) => x.id === tab.id);
        // Not while a conflict is on screen: the banner is a question, and
        // answering it by writing over the other program's version is exactly
        // what it exists to prevent.
        if (index < 0 || !this.tabs[index]?.dirty || this.tabs[index]?.external !== 'none') return;
        void this.save(index);
      }, delay)
    );
  }

  /**
   * Write every dirty document now — for `onFocusChange`, and for anything
   * else that means "the reader has stepped away".
   */
  async autosaveAll(): Promise<void> {
    if (settings.value.autosave === 'off') return;
    for (let i = 0; i < this.tabs.length; i++) {
      const tab = this.tabs[i];
      if (!tab?.dirty || !tab.path || tab.readonly || tab.external !== 'none') continue;
      await this.save(i);
    }
  }

  /** Queue a draft write for this tab's current buffer. */
  private scheduleDraft(tab: Tab): void {
    this.drafts.schedule(tab.id);
  }

  /** Drop a queued draft write — the buffer and the file now agree. */
  private cancelDraft(id: string): void {
    this.drafts.cancel(id);
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
      this.cancelDraft(tab.id);
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
      this.cancelDraft(oldId);
      // Re-read so the tab picks up the canonical path and fresh identity.
      const opened = await readFile(target);
      const handle = handles.get(oldId);

      Object.assign(tab, tabFromMeta(opened.meta, tab.content, tab.pane));
      this.retargetPanes(oldId, tab.id);
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

    this.cancelDraft(tab.id);
    // A tab whose file was never read has no draft of its own, and its id is
    // provisional. Any draft on disk belongs to text the reader has not seen,
    // so it stays and is offered at the next launch.
    if (discardDraft && tab.loaded) void draftDelete(tab.id).catch(() => undefined);

    // Whichever panes were showing it need something else to show, and they
    // look for it among their own tabs — closing a file on the left must not
    // reach across and change what is on the right.
    const orphaned = ([0, 1] as PaneId[]).filter((pane) => this.currentIds[pane] === tab.id);

    // The editor instance is torn down by the host element unmounting.
    this.tabs.splice(index, 1);
    for (const pane of orphaned) this.currentIds[pane] = this.neighbourIn(pane, index);
    this.collapseEmptyPane();
    void this.syncWatchList();
  }

  /**
   * Close several tabs at once.
   *
   * Right to left: closing shifts every index after it, and walking backwards
   * is the only order in which the indexes the caller worked out stay true.
   * Tabs with unsaved changes are left alone and returned, so the caller can
   * ask about them one at a time rather than deciding on the reader's behalf.
   */
  closeMany(indexes: number[]): number[] {
    const dirty: number[] = [];
    for (const index of [...indexes].sort((a, b) => b - a)) {
      const tab = this.tabs[index];
      if (!tab) continue;
      if (tab.dirty) {
        dirty.push(index);
        continue;
      }
      this.close(index);
    }
    return dirty;
  }

  /** Indexes of every tab except one — "close the others". */
  othersThan(index: number): number[] {
    return this.tabs.map((_, i) => i).filter((i) => i !== index);
  }

  /** Indexes to the right of one — "close those to the right". */
  rightOf(index: number): number[] {
    return this.tabs.map((_, i) => i).filter((i) => i > index);
  }

  // ---- external changes ----

  async reloadFromDisk(index: number): Promise<void> {
    const tab = this.tabs[index];
    if (!tab?.path) return;
    // Nothing to reload into: the file has not been read yet, and it will be
    // read fresh the moment this tab is opened.
    if (!tab.loaded) return;
    try {
      const opened = await readFile(tab.path);
      const handle = handles.get(tab.id);
      const cursor = handle?.getCursor().pos ?? 0;
      // A file changing on disk is not a reason to lose the reader's place.
      const scroll = handle?.getScrollAnchor() ?? tab.scroll;

      tab.content = opened.content;
      tab.baseMtimeMs = opened.meta.mtimeMs;
      tab.encoding = opened.meta.encoding;
      tab.eol = opened.meta.eol;
      tab.trailingNewline = opened.meta.trailingNewline;
      tab.dirty = false;
      tab.external = 'none';

      handle?.setContent(opened.content);
      handle?.setCursor(Math.min(cursor, opened.content.length));
      handle?.setScrollAnchor({
        pos: Math.min(scroll.pos, opened.content.length),
        offset: scroll.offset
      });
      this.cancelDraft(tab.id);
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
    // An unread tab has nothing to conflict with; it takes the file as it
    // finds it when someone opens it.
    if (!tab.loaded) return;

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
      if (!tab.path || !tab.loaded || tab.external !== 'none') continue;
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
    this.cancelDraft(tab.id);
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

  /**
   * Paths to watch besides the open files — the folder the tree is showing.
   *
   * Kept here rather than passed in at each call: every `syncWatchList()` from
   * opening, closing or saving replaces the whole list, so a root supplied
   * once at startup was dropped the first time a tab changed. The tree then
   * stopped noticing files appearing and disappearing, for the rest of the
   * session, silently.
   */
  private watchExtras: string[] = [];

  setWatchExtras(paths: string[]): void {
    this.watchExtras = paths.filter(Boolean);
    void this.syncWatchList();
  }

  /** Tell the backend which paths to observe (open files + their folders). */
  async syncWatchList(extra: string[] = []): Promise<void> {
    const paths = this.tabs
      .map((t) => t.path)
      .filter((p): p is string => Boolean(p))
      .concat(this.watchExtras, extra);
    await watchPaths([...new Set(paths)]).catch((e) => console.warn('watch failed', e));
  }

  /** Flush pending drafts — called before the window closes. */
  async flushDrafts(): Promise<void> {
    await this.drafts.flush();
  }

  private reportError(error: unknown, path: string | null): void {
    const message = describeError(error, path);
    this.lastError = message;
    console.error('[verso]', message, error);
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
    case 'EncodingLoss':
      // Naming the character matters: it is usually one pasted symbol, and
      // knowing which one is the difference between "save as UTF-8" and
      // hunting through the document.
      return t('error.encodingLoss', { character: e.character, encoding: e.encoding });
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
