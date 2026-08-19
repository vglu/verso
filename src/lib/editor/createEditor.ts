import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { EditorView, dropCursor } from '@codemirror/view';
import { bracketMatching, indentOnInput, syntaxTree } from '@codemirror/language';
import { highlightSelectionMatches, search } from '@codemirror/search';
import { createSearchPanel } from './searchPanel';
import { searchRail } from './searchRail';
import { markdownSupport } from './markdownLang';
import { editorTheme } from './cmTheme';
import { blocksRendered, documentDir, livePreview, readerMode } from './livePreview';
import { editingField, setEditing } from './livePreview/editing';
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
 * Where the reader is, expressed as a place in the text rather than a number
 * of pixels.
 *
 * A pixel offset is only meaningful while everything above it keeps the same
 * height — and in this editor it does not: images finish loading, diagrams
 * render, blocks open into source. Anchoring to a document position and the
 * distance from that line's top survives all of it.
 */
export interface ScrollAnchor {
  pos: number;
  offset: number;
}

/**
 * The only surface the app chrome uses to talk to the editor. Svelte
 * components never import CodeMirror directly (ARCHITECTURE §5).
 */
export interface EditorHandle {
  readonly view: EditorView;
  getContent(): string;
  setContent(content: string): void;
  focus(): void;
  destroy(): void;
  getOutline(): OutlineItem[];
  getActiveOutlineIndex(): number;
  revealPos(pos: number): void;
  getCursor(): CursorInfo;
  setCursor(pos: number): void;
  getStats(): DocStats;
  getScrollAnchor(): ScrollAnchor;
  setScrollAnchor(anchor: ScrollAnchor): void;
  setReadOnly(value: boolean): void;
  setReaderMode(value: boolean): void;
  isReaderMode(): boolean;
  /** False on a document too large to scan for tables, formulas and diagrams. */
  rendersBlocks(): boolean;
  setSourceMode(value: boolean): void;
  isSourceMode(): boolean;
  /** Declare that what follows is the user editing, not reading. */
  beginEditing(): void;
}

export interface CreateEditorOptions {
  parent: HTMLElement;
  doc: string;
  /** Directory of the document, used to resolve relative image paths. */
  dir: string;
  readOnly?: boolean;
  /** Start in plain Markdown source rather than live preview. */
  sourceMode?: boolean;
  /**
   * `userInitiated` is false when the change came from the app itself
   * (reloading a file from disk), so a reload never looks like an edit.
   */
  onChange?: (content: string, meta: { userInitiated: boolean }) => void;
  onSelectionChange?: () => void;
  /** The parser reached further into the document, so the outline may grow. */
  onStructureChange?: () => void;
  /** The reader scrolled; which section they are in may have changed. */
  onViewportChange?: () => void;
  onLinkClick?: (href: string, event: MouseEvent) => void;
  keymapHooks?: KeymapHooks;
}

export function createEditor(options: CreateEditorOptions): EditorHandle {
  const readOnlyComp = new Compartment();
  const readerComp = new Compartment();
  const previewComp = new Compartment();

  let readerOn = false;
  let sourceOn = options.sourceMode ?? false;

  const listener = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      const userInitiated = !update.transactions.some((tr) => tr.isUserEvent('input.reload'));
      options.onChange?.(update.state.doc.toString(), { userInitiated });
    }
    if (update.selectionSet) options.onSelectionChange?.();

    // The parser works through a long document in chunks, so headings below
    // the first screen do not exist yet when the outline is first built.
    // Without this the panel of a long file stays half empty until something
    // else happens to rebuild it.
    if (syntaxTree(update.state) !== syntaxTree(update.startState)) {
      options.onStructureChange?.();
    }
  });

  /**
   * Which section is on screen changes as the reader scrolls, and scrolling
   * produces no transaction at all — so it needs its own listener.
   */
  const onScroll = (): void => {
    if (scrollTimer !== null) return;
    scrollTimer = window.setTimeout(() => {
      scrollTimer = null;
      options.onViewportChange?.();
    }, 50);
  };
  let scrollTimer: number | null = null;

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

  /**
   * Rebuilt rather than captured once: recreating the state from a frozen
   * array would silently restore every compartment to its *initial* value, so
   * reader mode, read-only and source mode would quietly revert while the
   * handle still reported them as set.
   */
  const buildExtensions = (): Extension[] => [
    markdownSupport(),
    editorTheme(),
    // Live preview is one compartment so it can be switched off wholesale.
    // Source mode is not a degraded view — it is the document exactly as the
    // file holds it, which is the right tool whenever the rendering gets in
    // the way of the edit.
    previewComp.of(sourceOn ? [] : livePreview()),
    documentDir.of(options.dir),
    readerComp.of(readerMode.of(readerOn)),
    readOnlyComp.of(EditorState.readOnly.of(readerOn || (options.readOnly ?? false))),
    editorKeymap(options.keymapHooks ?? {}),
    EditorView.lineWrapping,
    // No `drawSelection()` on purpose. It paints the selection as its own
    // absolutely-positioned rectangles, and it computes those from line
    // geometry it cannot know for block widgets — a selection crossing a
    // rendered table or code panel came out as slabs of colour sitting on top
    // of the text. The browser's own selection knows the real layout of every
    // element we render, so it stays correct by construction.
    dropCursor(),
    bracketMatching(),
    indentOnInput(),
    highlightSelectionMatches(),
    search({ top: true, createPanel: createSearchPanel }),
    searchRail,
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
    state: EditorState.create({ doc: options.doc, extensions: buildExtensions() })
  });

  // Theme-dependent widgets (Mermaid) rebuild on a theme switch. Re-issuing
  // the current selection is enough to make the block field recompute.
  const onThemeChanged = (): void => {
    resetMermaid();
    view.dispatch({ selection: view.state.selection });
  };
  window.addEventListener(THEME_CHANGED_EVENT, onThemeChanged);
  view.scrollDOM.addEventListener('scroll', onScroll, { passive: true });

  return {
    view,

    getContent: () => view.state.doc.toString(),

    /**
     * Replace the buffer.
     *
     * `keepHistory` is a lie worth avoiding: replacing the whole document and
     * keeping the undo stack lets one Ctrl+Z restore text that no longer
     * matches the file this tab is now guarding — and the next save, passing
     * the freshly-advanced conflict check, would write it over a newer disk
     * version without a word. Content that came from somewhere other than the
     * user therefore starts a fresh history.
     */
    setContent(content) {
      if (content === view.state.doc.toString()) return;
      view.setState(EditorState.create({ doc: content, extensions: buildExtensions() }));
      options.onChange?.(content, { userInitiated: false });
    },

    focus: () => view.focus(),

    destroy: () => {
      window.removeEventListener(THEME_CHANGED_EVENT, onThemeChanged);
      view.scrollDOM.removeEventListener('scroll', onScroll);
      if (scrollTimer !== null) clearTimeout(scrollTimer);
      view.destroy();
    },

    getOutline: () => extractOutline(view.state),

    /**
     * The heading whose section fills the top of the screen.
     *
     * Measured a fifth of the way down rather than at the very top edge: a
     * heading scrolled to sit exactly at the boundary would otherwise flicker
     * between itself and the one before it.
     */
    getActiveOutlineIndex() {
      const items = extractOutline(view.state);
      if (items.length === 0) return -1;

      let anchor = view.visibleRanges[0]?.from ?? 0;
      try {
        const rect = view.scrollDOM.getBoundingClientRect();
        const probe = view.posAtCoords({ x: rect.left + 8, y: rect.top + rect.height * 0.2 });
        if (probe !== null) anchor = probe;
      } catch {
        /* no layout yet — the viewport start is a fine answer */
      }
      return activeOutlineIndex(items, anchor);
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

    getScrollAnchor: () => captureAnchor(view),

    setScrollAnchor(anchor) {
      restoreAnchor(view, anchor);
    },

    setReadOnly(value) {
      view.dispatch({ effects: readOnlyComp.reconfigure(EditorState.readOnly.of(value)) });
    },

    setReaderMode(value) {
      readerOn = value;
      view.dispatch({
        effects: [
          readerComp.reconfigure(readerMode.of(value)),
          // Reading means reading. Without this the caret is invisible but
          // the document is still editable — keystrokes, toolbar buttons and
          // task checkboxes all reached the file with nothing on screen to
          // show it had happened.
          readOnlyComp.reconfigure(EditorState.readOnly.of(value || (options.readOnly ?? false)))
        ]
      });
    },

    isReaderMode: () => readerOn,

    rendersBlocks: () => blocksRendered(view.state),

    setSourceMode(value) {
      if (value === sourceOn) return;
      sourceOn = value;
      view.dispatch({ effects: previewComp.reconfigure(value ? [] : livePreview()) });
      view.contentDOM.classList.toggle('md-source', value);
    },

    isSourceMode: () => sourceOn,

    beginEditing() {
      if (view.state.field(editingField, false)) return;
      view.dispatch({ effects: setEditing.of(true) });
    }
  };
}

/** The document position at the top of the screen, and how far above it. */
function captureAnchor(view: EditorView): ScrollAnchor {
  try {
    const top = view.scrollDOM.scrollTop;
    const pos = view.visibleRanges[0]?.from ?? 0;
    const block = view.lineBlockAt(pos);
    return { pos, offset: top - block.top };
  } catch {
    return { pos: 0, offset: 0 };
  }
}

/**
 * Put the reader back where they were.
 *
 * Deferred to a measure pass: at the moment a tab is restored the widgets
 * above have not been laid out yet, so resolving the position immediately
 * would land against heights that are about to change.
 */
function restoreAnchor(view: EditorView, anchor: ScrollAnchor): void {
  const pos = Math.max(0, Math.min(anchor.pos, view.state.doc.length));
  view.requestMeasure({
    read: (v) => {
      try {
        return v.lineBlockAt(pos).top + anchor.offset;
      } catch {
        return null;
      }
    },
    write: (top, v) => {
      if (top !== null) v.scrollDOM.scrollTop = top;
    }
  });
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
