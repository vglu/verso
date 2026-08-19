import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { EditorView, drawSelection, dropCursor, rectangularSelection } from '@codemirror/view';
import { bracketMatching, indentOnInput } from '@codemirror/language';
import { highlightSelectionMatches, search } from '@codemirror/search';
import { markdownSupport } from './markdownLang';
import { editorTheme } from './cmTheme';
import { documentDir, livePreview, readerMode } from './livePreview';
import { editorKeymap, type KeymapHooks } from './keymap';
import { activeOutlineIndex, extractOutline, type OutlineItem } from './outline';
import { resetMermaid, THEME_CHANGED_EVENT } from './livePreview/richWidgets';

export interface CursorInfo {
  line: number;
  col: number;
  pos: number;
}

export interface DocStats {
  words: number;
  chars: number;
}

/**
 * The only surface the app chrome uses to talk to the editor. Svelte
 * components never import CodeMirror directly (ARCHITECTURE §5).
 */
export interface EditorHandle {
  readonly view: EditorView;
  getContent(): string;
  setContent(content: string, keepHistory?: boolean): void;
  focus(): void;
  destroy(): void;
  getOutline(): OutlineItem[];
  getActiveOutlineIndex(): number;
  revealPos(pos: number): void;
  getCursor(): CursorInfo;
  setCursor(pos: number): void;
  getStats(): DocStats;
  getScrollTop(): number;
  setScrollTop(value: number): void;
  setReadOnly(value: boolean): void;
  setReaderMode(value: boolean): void;
  isReaderMode(): boolean;
}

export interface CreateEditorOptions {
  parent: HTMLElement;
  doc: string;
  /** Directory of the document, used to resolve relative image paths. */
  dir: string;
  readOnly?: boolean;
  /**
   * `userInitiated` is false when the change came from the app itself
   * (reloading a file from disk), so a reload never looks like an edit.
   */
  onChange?: (content: string, meta: { userInitiated: boolean }) => void;
  onSelectionChange?: () => void;
  onLinkClick?: (href: string, event: MouseEvent) => void;
  keymapHooks?: KeymapHooks;
}

export function createEditor(options: CreateEditorOptions): EditorHandle {
  const readOnlyComp = new Compartment();
  const readerComp = new Compartment();

  let readerOn = false;

  const listener = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      const userInitiated = !update.transactions.some((tr) => tr.isUserEvent('input.reload'));
      options.onChange?.(update.state.doc.toString(), { userInitiated });
    }
    if (update.selectionSet) options.onSelectionChange?.();
  });

  // Links are spans, not anchors — the document never contains live markup.
  const linkHandler = EditorView.domEventHandlers({
    mousedown: (event, view) => {
      const target = event.target as HTMLElement | null;
      const el = target?.closest('.md-link') as HTMLElement | null;
      if (!el) return false;

      const modifier = event.ctrlKey || event.metaKey;
      if (!modifier) return false;

      const href = el.dataset.href ?? hrefFromSource(view, el);
      if (!href) return false;

      event.preventDefault();
      options.onLinkClick?.(href, event);
      return true;
    }
  });

  const extensions: Extension[] = [
    markdownSupport(),
    editorTheme(),
    livePreview(),
    documentDir.of(options.dir),
    readerComp.of(readerMode.of(false)),
    readOnlyComp.of(EditorState.readOnly.of(options.readOnly ?? false)),
    editorKeymap(options.keymapHooks ?? {}),
    EditorView.lineWrapping,
    drawSelection(),
    dropCursor(),
    rectangularSelection(),
    bracketMatching(),
    indentOnInput(),
    highlightSelectionMatches(),
    search({ top: true }),
    EditorState.allowMultipleSelections.of(true),
    EditorView.contentAttributes.of({
      class: 'md-doc',
      spellcheck: 'false',
      autocorrect: 'off',
      autocapitalize: 'off'
    }),
    listener,
    linkHandler
  ];

  const view = new EditorView({
    parent: options.parent,
    state: EditorState.create({ doc: options.doc, extensions })
  });

  // Theme-dependent widgets (Mermaid) rebuild on a theme switch. Re-issuing
  // the current selection is enough to make the block field recompute.
  const onThemeChanged = (): void => {
    resetMermaid();
    view.dispatch({ selection: view.state.selection });
  };
  window.addEventListener(THEME_CHANGED_EVENT, onThemeChanged);

  return {
    view,

    getContent: () => view.state.doc.toString(),

    setContent(content, keepHistory = false) {
      if (content === view.state.doc.toString()) return;
      const selection = view.state.selection.main;
      const anchor = Math.min(selection.anchor, content.length);

      if (keepHistory) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: content },
          selection: { anchor },
          userEvent: 'input.reload'
        });
        return;
      }

      // A fresh document starts a fresh history: undo must never walk back
      // into a different file's content.
      view.setState(EditorState.create({ doc: content, extensions }));
    },

    focus: () => view.focus(),

    destroy: () => {
      window.removeEventListener(THEME_CHANGED_EVENT, onThemeChanged);
      view.destroy();
    },

    getOutline: () => extractOutline(view.state),

    getActiveOutlineIndex() {
      const items = extractOutline(view.state);
      const topLine = view.visibleRanges[0]?.from ?? 0;
      return activeOutlineIndex(items, topLine);
    },

    revealPos(pos) {
      const clamped = Math.max(0, Math.min(pos, view.state.doc.length));
      view.dispatch({
        selection: { anchor: clamped },
        effects: EditorView.scrollIntoView(clamped, { y: 'start', yMargin: 24 })
      });
      view.focus();
    },

    getCursor() {
      const pos = view.state.selection.main.head;
      const line = view.state.doc.lineAt(pos);
      return { line: line.number, col: pos - line.from + 1, pos };
    },

    setCursor(pos) {
      const clamped = Math.max(0, Math.min(pos, view.state.doc.length));
      view.dispatch({ selection: { anchor: clamped } });
    },

    getStats: () => computeStats(view.state.doc.toString()),

    getScrollTop: () => view.scrollDOM.scrollTop,

    setScrollTop(value) {
      view.scrollDOM.scrollTop = value;
    },

    setReadOnly(value) {
      view.dispatch({ effects: readOnlyComp.reconfigure(EditorState.readOnly.of(value)) });
    },

    setReaderMode(value) {
      readerOn = value;
      view.dispatch({ effects: readerComp.reconfigure(readerMode.of(value)) });
    },

    isReaderMode: () => readerOn
  };
}

/** Word/char counts for the status strip. */
export function computeStats(text: string): DocStats {
  const trimmed = text.trim();
  const words = trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
  return { words, chars: text.length };
}

/** Recover a link target when the click landed on rendered (concealed) text. */
function hrefFromSource(view: EditorView, el: HTMLElement): string | null {
  const pos = view.posAtDOM(el);
  const line = view.state.doc.lineAt(pos);
  const text = line.text;
  const offset = pos - line.from;

  const pattern = /\[([^\]]*)\]\(\s*<?([^)\s>]*)>?(?:\s+"[^"]*")?\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (offset >= match.index && offset <= match.index + match[0].length) {
      return match[2] ?? null;
    }
  }

  const bare = /https?:\/\/\S+/g;
  while ((match = bare.exec(text)) !== null) {
    if (offset >= match.index && offset <= match.index + match[0].length) {
      return match[0];
    }
  }
  return null;
}
