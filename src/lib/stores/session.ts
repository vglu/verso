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
        scrollOffset: scroll.offset
      };
    });

  // The active index refers to saved tabs only; untitled buffers are skipped.
  const activePath = tabs.active?.path ?? null;
  const activeIndex = activePath ? openTabs.findIndex((t) => t.path === activePath) : -1;

  return {
    tabs: openTabs,
    activeIndex,
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

/** Restore a previous session. Returns true if anything was reopened. */
export async function restoreSession({ activate = true }: RestoreOptions = {}): Promise<boolean> {
  const state = await sessionLoad().catch(() => null);
  if (!state) return false;

  workspace.sidebarVisible = state.sidebar?.visible ?? true;
  workspace.outlineVisible = state.sidebar?.outlineVisible ?? true;
  if (state.sidebar?.width) workspace.setWidth(state.sidebar.width);
  if (state.sidebar?.outlineWidth) workspace.setOutlineWidth(state.sidebar.outlineWidth);

  let opened = 0;
  for (const tab of state.tabs ?? []) {
    const ok = await tabs.openPath(tab.path, { activate: false });
    if (!ok) continue;
    const index = tabs.indexOfPath(tab.path);
    const restored = tabs.tabs[index];
    if (restored) {
      restored.cursor = tab.cursor ?? 0;
      // Sessions written before positions became anchors carry only a pixel
      // offset; there is nothing to resolve it against, so it is dropped
      // rather than applied to the wrong place.
      restored.scroll = {
        pos: tab.scrollPos ?? 0,
        offset: tab.scrollOffset ?? 0
      };
    }
    opened += 1;
  }

  if (opened > 0 && activate) {
    const index = Math.min(Math.max(state.activeIndex, 0), tabs.tabs.length - 1);
    tabs.activate(index);
  }

  // The folder tree only follows the session when nothing else has set it —
  // a double-clicked document has already pointed it at its own folder.
  if (!workspace.treeRoot) {
    if (state.treeRoot) await workspace.setRoot(state.treeRoot).catch(() => undefined);
    else if (tabs.active?.path) await workspace.setRootFromFile(tabs.active.path);
  }

  return opened > 0;
}
