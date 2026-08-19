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
      return {
        path: tab.path!,
        cursor: handle?.getCursor().pos ?? tab.cursor,
        scrollTop: handle?.getScrollTop() ?? tab.scrollTop
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
      panel: workspace.panel,
      width: workspace.width
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

/** Restore a previous session. Returns true if anything was reopened. */
export async function restoreSession(): Promise<boolean> {
  const state = await sessionLoad().catch(() => null);
  if (!state) return false;

  workspace.sidebarVisible = state.sidebar?.visible ?? true;
  workspace.panel = state.sidebar?.panel === 'outline' ? 'outline' : 'files';
  if (state.sidebar?.width) workspace.setWidth(state.sidebar.width);

  let opened = 0;
  for (const tab of state.tabs ?? []) {
    const ok = await tabs.openPath(tab.path, { activate: false });
    if (!ok) continue;
    const index = tabs.indexOfPath(tab.path);
    const restored = tabs.tabs[index];
    if (restored) {
      restored.cursor = tab.cursor ?? 0;
      restored.scrollTop = tab.scrollTop ?? 0;
    }
    opened += 1;
  }

  if (opened > 0) {
    const index = Math.min(Math.max(state.activeIndex, 0), tabs.tabs.length - 1);
    tabs.activate(index);
  }

  if (state.treeRoot) {
    await workspace.setRoot(state.treeRoot).catch(() => undefined);
  } else if (tabs.active?.path) {
    await workspace.setRootFromFile(tabs.active.path);
  }

  return opened > 0;
}
