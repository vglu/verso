/**
 * IPC data contract — mirror of the Rust structs (serde camelCase).
 * Source of truth: docs/design/IPC-CONTRACT.md §1. Change the doc first.
 */

// ---- errors ----
export type AppError =
  | { kind: 'NotFound'; path: string }
  | { kind: 'PermissionDenied'; path: string }
  | { kind: 'ExternalModified'; path: string; diskMtimeMs: number }
  | { kind: 'UnsupportedEncoding'; path: string; detected: string }
  | { kind: 'IsBinary'; path: string }
  | { kind: 'Io'; message: string };

export function isAppError(e: unknown): e is AppError {
  return typeof e === 'object' && e !== null && 'kind' in e;
}

// ---- files ----
export type Encoding = 'utf-8' | 'utf-8-bom' | 'utf-16-le' | 'utf-16-be';
export type Eol = 'lf' | 'crlf';

export interface FileMeta {
  path: string;
  docId: string;
  fileName: string;
  dirPath: string;
  mtimeMs: number;
  readonly: boolean;
  encoding: Encoding;
  eol: Eol;
  /** The file mixes line endings; unchanged lines keep their own on save. */
  mixedEol: boolean;
  trailingNewline: boolean;
  sizeBytes: number;
}

export interface OpenedFile {
  meta: FileMeta;
  content: string;
}

export interface SaveResult {
  mtimeMs: number;
}

export interface SaveMeta {
  encoding: Encoding;
  eol: Eol;
  trailingNewline: boolean;
}

export interface StatResult {
  mtimeMs: number;
  exists: boolean;
}

// ---- tree ----
export interface TreeEntry {
  name: string;
  path: string;
  isDir: boolean;
  hasChildren: boolean;
}

// ---- drafts ----
export interface Draft {
  docId: string;
  path: string;
  baseMtimeMs: number;
  savedAtMs: number;
  content: string;
}

export interface DraftInfo {
  docId: string;
  path: string;
  baseMtimeMs: number;
  savedAtMs: number;
}

// ---- session ----
export interface SessionTab {
  path: string;
  cursor: number;
  /** Written by versions that stored a raw pixel offset; read for migration. */
  scrollTop?: number;
  /** The place in the text the reader was at, and how far above it. */
  scrollPos?: number;
  scrollOffset?: number;
}

export interface SessionState {
  tabs: SessionTab[];
  activeIndex: number;
  sidebar: {
    visible: boolean;
    /** Kept for sessions written before the outline moved to its own panel. */
    panel: 'files' | 'outline';
    width: number;
    outlineVisible?: boolean;
    outlineWidth?: number;
  };
  treeRoot: string | null;
}

// ---- settings ----
export type ThemeSetting = 'light' | 'dark' | 'system';
export type LangSetting = 'system' | 'ru' | 'en';

export interface Settings {
  theme: ThemeSetting;
  uiLang: LangSetting;
  autosaveDraftMs: number;
  restoreSession: boolean;
  editorFontSize: number;
  editorMaxWidth: number;
  fontFamily: string;
  showStatusStrip: boolean;
  showToolbar: boolean;
  /** `live` renders Markdown in place; `source` shows the file as written. */
  editorMode: 'live' | 'source';
  recentFiles: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  uiLang: 'system',
  autosaveDraftMs: 800,
  restoreSession: true,
  editorFontSize: 16,
  editorMaxWidth: 760,
  fontFamily: 'default',
  showStatusStrip: true,
  showToolbar: true,
  editorMode: 'live',
  recentFiles: []
};

// ---- events ----
export interface OpenFilePayload {
  paths: string[];
}

export type FsChangeKind = 'modified' | 'removed' | 'renamed';

export interface FsChangedPayload {
  path: string;
  kind: FsChangeKind;
}

export type MenuActionId =
  | 'newFile'
  | 'open'
  | 'openFolder'
  | 'save'
  | 'saveAs'
  | 'closeTab'
  | 'settings'
  | 'toggleSidebar'
  | 'toggleOutline'
  | 'find'
  | 'about';

export interface MenuActionPayload {
  id: MenuActionId;
}
