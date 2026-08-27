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
  /** The text has grown a character the file's own encoding cannot hold. */
  | { kind: 'EncodingLoss'; path: string; encoding: string; character: string }
  | { kind: 'Io'; message: string };

export function isAppError(e: unknown): e is AppError {
  return typeof e === 'object' && e !== null && 'kind' in e;
}

// ---- files ----
export type Encoding =
  | 'utf-8'
  | 'utf-8-bom'
  | 'utf-16-le'
  | 'utf-16-be'
  // The 8-bit encodings everything written before UTF-8 won is in. A file
  // opened in one of them is saved back in it, byte for byte.
  | 'windows-1251'
  | 'ibm866'
  | 'koi8-r'
  | 'koi8-u'
  | 'iso-8859-5'
  | 'windows-1252';
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
  /** Which half of a split window it was in. */
  pane?: 0 | 1;
}

export interface SessionState {
  tabs: SessionTab[];
  activeIndex: number;
  /** Whether the window was showing two panes. */
  split?: boolean;
  splitRatio?: number;
  /** Which half, if either, was showing the rendered page rather than text. */
  previewPane?: 0 | 1 | null;
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
/**
 * When to write a document to disk without being asked.
 *
 * The names are the ones VS Code uses, because that is where people will have
 * met the idea. `off` is the default: this program's first promise is that it
 * never writes a byte you did not type, and writing on a timer is a decision
 * the reader should make on purpose.
 */
export type AutosaveSetting = 'off' | 'afterDelay' | 'onFocusChange';
export type LangSetting = 'system' | 'uk' | 'en';

export interface Settings {
  theme: ThemeSetting;
  uiLang: LangSetting;
  autosaveDraftMs: number;
  /** When to save the file itself (drafts are separate and always on). */
  autosave: AutosaveSetting;
  /** How long after the last keystroke `afterDelay` waits, in milliseconds. */
  autosaveDelayMs: number;
  restoreSession: boolean;
  editorFontSize: number;
  /** The widest the text column may become; it grows to this, not at this. */
  editorMaxWidth: number;
  /**
   * Window zoom, as a factor. Separate from the font size on purpose: that is
   * how a document is set, this is how large everything on screen is.
   */
  zoom: number;
  fontFamily: string;
  showStatusStrip: boolean;
  showToolbar: boolean;
  /**
   * Underline misspelled words. Off by default: the webview's checker knows
   * nothing about Markdown, so it underlines fenced code and link targets
   * too, and a page of red is worse than no checking at all for someone who
   * is reading rather than writing.
   */
  spellcheck: boolean;
  /** `live` renders Markdown in place; `source` shows the file as written. */
  editorMode: 'live' | 'source';
  /**
   * Path to a user's own theme — one CSS file that overrides design tokens
   * (docs/themes.md). Null means the built-in light and dark themes.
   */
  themeFile: string | null;
  /**
   * Plugins the reader has turned on, by id. Installing a plugin is putting a
   * folder in place; running its code is this list, and nothing else.
   */
  enabledPlugins: string[];
  recentFiles: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  uiLang: 'system',
  autosaveDraftMs: 800,
  autosave: 'off',
  autosaveDelayMs: 1000,
  restoreSession: true,
  editorFontSize: 16,
  editorMaxWidth: 1400,
  zoom: 1,
  fontFamily: 'default',
  showStatusStrip: true,
  showToolbar: true,
  spellcheck: false,
  editorMode: 'live',
  themeFile: null,
  enabledPlugins: [],
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
  | 'toggleSplit'
  | 'toggleSourceAndPreview'
  | 'find'
  | 'goToHeading'
  | 'goToLine'
  | 'foldAll'
  | 'unfoldAll'
  | 'formatDocument'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomReset'
  | 'exportHtml'
  | 'print'
  | 'about';

export interface MenuActionPayload {
  id: MenuActionId;
}
