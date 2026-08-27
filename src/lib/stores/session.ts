/**
 * Session persistence: which files were open, where the caret was, how the
 * sidebar looked. Contract: docs/design/DATA-SAFETY.md §6.
 */
import { sessionLoad, sessionSave } from '../ipc/commands';
import type { SessionState } from '../ipc/types';
import { tabs } from './tabs.svelte';
import { workspace } from './workspace.svelte';

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function snapshotSession(): SessionState {
  const openTabs = tabs.tabs
    .filter((tab) => tab.path)
    .map((tab) => {
      const handle = tabs.handleOf(tab.id);
      const scroll = handle?.getScrollAnchor() ?? tab.scroll;
      return {
        path: tab.path!,
        cursor: handle?.getCursor().pos ?? tab.cursor,
        scrollPos: scroll.pos,
        scrollOffset: scroll.offset,
        pane: tab.pane
      };
    });

  // The active index refers to saved tabs only; untitled buffers are skipped.
  const activePath = tabs.active?.path ?? null;
  const activeIndex = activePath ? openTabs.findIndex((t) => t.path === activePath) : -1;

  return {
    tabs: openTabs,
    activeIndex,
    split: tabs.split,
    splitRatio: workspace.splitRatio,
    previewPane: tabs.previewPane,
    sidebar: {
      visible: workspace.sidebarVisible,
      panel: 'files',
      width: workspace.width,
      outlineVisible: workspace.outlineVisible,
      outlineWidth: workspace.outlineWidth
    },
    treeRoot: workspace.treeRoot
  };
}

export function scheduleSessionSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void sessionSave(snapshotSession()).catch((e) => console.warn('session save failed', e));
  }, 2000);
}

export async function flushSession(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  await sessionSave(snapshotSession()).catch((e) => console.warn('session flush failed', e));
}

export interface RestoreOptions {
  /**
   * Whether the restored session may choose the active tab.
   *
   * False when a document was double-clicked: that one is already open and is
   * the one the reader is waiting for, and the session must not pull the rug
   * out from under it a second later.
   */
  activate?: boolean;
}

export interface RestoreResult {
  opened: number;
  /**
   * The tab the session had active, whether or not we activated it.
   *
   * The caller needs this even when it asked us not to activate anything: if
   * the document it was opening turns out not to be openable, something has
   * to be on screen, and the reader's last document is the best answer.
   */
  activeIndex: number;
}

/** Restore a previous session. */
export async function restoreSession({
  activate = true
}: RestoreOptions = {}): Promise<RestoreResult> {
  const state = await sessionLoad().catch(() => null);
  if (!state) return { opened: 0, activeIndex: -1 };

  workspace.sidebarVisible = state.sidebar?.visible ?? true;
  workspace.outlineVisible = state.sidebar?.outlineVisible ?? true;
  if (state.sidebar?.width) workspace.setWidth(state.sidebar.width);
  if (state.sidebar?.outlineWidth) workspace.setOutlineWidth(state.sidebar.outlineWidth);

  // Tabs come back as paths, not as documents. Reading every file here cost an
  // IPC round trip, an encoding pass and a per-line ending scan each, before
  // the window was usable — and a single large file in the session slowed the
  // start for every other one. Each file is read when its tab is first shown.
  let opened = 0;
  for (const tab of state.tabs ?? []) {
    tabs.addRestored(
      tab.path,
      tab.cursor ?? 0,
      {
        // Sessions written before positions became anchors carry only a pixel
        // offset; there is nothing to resolve it against, so it is dropped
        // rather than applied to the wrong place.
        pos: tab.scrollPos ?? 0,
        offset: tab.scrollOffset ?? 0
      },
      // A session written before the window could be split has no panes in it,
      // and everything in it belongs on the left.
      state.split ? (tab.pane ?? 0) : 0
    );
    opened += 1;
  }

  // The page beside the text has no tabs of its own, so it has to be restored
  // before the check below, which asks whether the right half holds anything.
  if (state.previewPane === 1 && opened > 0) {
    tabs.split = true;
    tabs.previewPane = 1;
    tabs.focusedPane = 0;
    if (state.splitRatio) workspace.setSplitRatio(state.splitRatio);
  } else if (state.split && tabs.hasTabsIn(1)) {
    tabs.split = true;
    if (state.splitRatio) workspace.setSplitRatio(state.splitRatio);
    // Give each pane something to show. The active tab, below, then decides
    // which of the two had the keyboard.
    const right = tabs.entriesIn(1)[0];
    if (right) tabs.activate(right.index);
    const left = tabs.entriesIn(0)[0];
    if (left) tabs.activate(left.index);
  }

  const activeIndex = opened > 0 ? Math.min(Math.max(state.activeIndex, 0), opened - 1) : -1;
  if (activeIndex >= 0 && activate) tabs.activate(activeIndex);

  // The folder tree only follows the session when nothing else has set it —
  // a double-clicked document has already pointed it at its own folder.
  if (!workspace.treeRoot) {
    if (state.treeRoot) await workspace.setRoot(state.treeRoot).catch(() => undefined);
    else if (tabs.active?.path) await workspace.setRootFromFile(tabs.active.path);
  }

  return { opened, activeIndex };
}
