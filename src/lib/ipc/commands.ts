/**
 * Typed wrappers around Tauri commands. This is the ONLY module allowed to
 * contain raw command name strings (guarded: no `invoke(` outside lib/ipc).
 * Contract: docs/design/IPC-CONTRACT.md §2.
 */
import { invoke } from '@tauri-apps/api/core';
import type {
  Draft,
  DraftInfo,
  OpenedFile,
  SaveMeta,
  SaveResult,
  SessionState,
  Settings,
  StatResult,
  TreeEntry
} from './types';

// ---- files ----
export const readFile = (path: string): Promise<OpenedFile> => invoke('read_file', { path });

export const saveFile = (
  path: string,
  content: string,
  baseMtimeMs: number | null,
  meta: SaveMeta
): Promise<SaveResult> => invoke('save_file', { path, content, baseMtimeMs, meta });

export const statFile = (path: string): Promise<StatResult> => invoke('stat_file', { path });

// ---- tree ----
export const listDir = (path: string): Promise<TreeEntry[]> => invoke('list_dir', { path });

export const resolveTreeRoot = (filePath: string): Promise<string> =>
  invoke('resolve_tree_root', { filePath });

export const watchPaths = (paths: string[]): Promise<void> => invoke('watch_paths', { paths });

/**
 * Give the native menu its labels.
 *
 * The menu is built in Rust but translated here: one dictionary, in the place
 * where every other string in the application lives.
 */
export const setMenuLabels = (labels: Record<string, string>): Promise<void> =>
  invoke('set_menu_labels', { labels });

// ---- drafts ----
export const draftSave = (
  docId: string,
  path: string,
  baseMtimeMs: number,
  content: string
): Promise<void> => invoke('draft_save', { docId, path, baseMtimeMs, content });

export const draftGet = (docId: string): Promise<Draft | null> => invoke('draft_get', { docId });

export const draftDelete = (docId: string): Promise<void> => invoke('draft_delete', { docId });

export const draftsList = (): Promise<DraftInfo[]> => invoke('drafts_list');

// ---- session ----
export const sessionLoad = (): Promise<SessionState | null> => invoke('session_load');

export const sessionSave = (state: SessionState): Promise<void> =>
  invoke('session_save', { state });

// ---- settings ----
export const settingsLoad = (): Promise<Settings> => invoke('settings_load');

export const settingsSave = (settings: Settings): Promise<void> =>
  invoke('settings_save', { settings });

// ---- shell ----
export const revealInOs = (path: string): Promise<void> => invoke('reveal_in_os', { path });

export const openExternal = (url: string): Promise<void> => invoke('open_external', { url });

export const getStartupFiles = (): Promise<string[]> => invoke('get_startup_files');
