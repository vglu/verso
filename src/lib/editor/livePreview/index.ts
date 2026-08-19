import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import type { Tree } from '@lezer/common';
import {
  Facet,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
  type Range
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type PluginValue,
  type ViewUpdate
} from '@codemirror/view';
import { computeActive, isLineActive, isRangeActive, type ActiveContext } from './active';
import {
  BulletWidget,
  CheckboxWidget,
  FenceChipWidget,
  HrWidget,
  ImageWidget,
  TableWidget
} from './widgets';
import { MathWidget, MermaidWidget } from './richWidgets';

/**
 * Live preview: Markdown renders in place, and the raw syntax comes back on
 * whatever line the caret touches.
 *
 * Two layers, because CodeMirror requires it: block-level replacements
 * (tables span line breaks) must come from a state field, while everything
 * inline is built by a view plugin limited to the visible viewport.
 * See docs/design/EDITOR-CORE.md §3.
 */

/** Directory of the current document — resolves relative image sources. */
export const documentDir = Facet.define<string, string>({
  combine: (values) => values[0] ?? ''
});

/** Reader mode: never reveal syntax, whatever the selection does. */
export const readerMode = Facet.define<boolean, boolean>({
  combine: (values) => values.some((v) => v)
});

export const setEditing = StateEffect.define<boolean>();

/**
 * True once the user actually works in this document (clicked or typed).
 *
 * A freshly opened file is a *reading* surface: nothing should be revealed,
 * even though the caret technically sits on line 1. Programmatic focus alone
 * does not count — only real interaction flips this.
 */
export const editingField = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setEditing)) return effect.value;
    }
    return value;
  }
});

function isFrozen(state: EditorState): boolean {
  return state.facet(readerMode) || !state.field(editingField, false);
}

/**
 * Above this size we stop scanning for blocks on every edit; the scan is
 * whole-document and would show up as typing lag. Inline rendering, which is
 * viewport-bound, keeps working.
 */
const TABLE_SCAN_LIMIT_BYTES = 2 * 1024 * 1024;

/**
 * Documents up to this size are parsed to the end before scanning for blocks.
 *
 * This is not a nicety. CodeMirror parses lazily, so `syntaxTree(state)` covers
 * only as much as has been worked through so far — a few thousand characters
 * on a fresh document. A table below that point is simply absent from the
 * tree, and a whole-document scan finds nothing while inline decorations,
 * which never look past the viewport, keep working perfectly. That asymmetry
 * is what made a real 12 KB document render its emphasis and its code spans
 * but show its table as raw pipes.
 */
const FORCE_PARSE_LIMIT_BYTES = 512 * 1024;

/** Milliseconds the forced parse may spend before we settle for what exists. */
const FORCE_PARSE_BUDGET_MS = 60;

/**
 * The best tree available for a whole-document scan: complete for ordinary
 * documents, whatever the parser has reached for very large ones (where the
 * field re-scans as the parse advances).
 */
function scanTree(state: EditorState): Tree {
  if (state.doc.length <= FORCE_PARSE_LIMIT_BYTES) {
    const complete = ensureSyntaxTree(state, state.doc.length, FORCE_PARSE_BUDGET_MS);
    if (complete) return complete;
  }
  return syntaxTree(state);
}

const HIDDEN = Decoration.replace({});

export interface Built {
  decorations: Range<Decoration>[];
  atomics: Range<Decoration>[];
}

function pushReplace(built: Built, deco: Decoration, from: number, to: number): void {
  if (to <= from) return;
  const range = deco.range(from, to);
  built.decorations.push(range);
  built.atomics.push(range);
}

function pushHide(built: Built, from: number, to: number): void {
  pushReplace(built, HIDDEN, from, to);
}

function pushMark(built: Built, cls: string, from: number, to: number): void {
  if (to <= from) return;
  built.decorations.push(Decoration.mark({ class: cls }).range(from, to));
}

function pushLine(built: Built, cls: string, linePos: number): void {
  built.decorations.push(Decoration.line({ class: cls }).range(linePos));
}

/** Line classes for a block, clamped to the range we are actually drawing. */
function decorateLines(
  built: Built,
  state: EditorState,
  cls: string,
  from: number,
  to: number,
  extra?: (lineNumber: number, first: number, last: number) => string | null
): void {
  const first = state.doc.lineAt(from).number;
  const last = state.doc.lineAt(to).number;
  for (let n = first; n <= last; n++) {
    const line = state.doc.line(n);
    const suffix = extra?.(n, first, last);
    pushLine(built, suffix ? `${cls} ${suffix}` : cls, line.from);
  }
}

// ---------------------------------------------------------------------------
// Inline layer (view plugin, viewport-bound)
// ---------------------------------------------------------------------------

/**
 * Build the inline decorations for one span of the document.
 * Exported so the rendering rules can be tested without a laid-out view.
 */
export function buildInlineForRange(state: EditorState, from: number, to: number): Built {
  const active = computeActive(state, isFrozen(state));
  const dir = state.facet(documentDir);
  const built: Built = { decorations: [], atomics: [] };

  syntaxTree(state).iterate({
    from,
    to,
    enter: (node) => handleNode(node, state, active, dir, built, from, to)
  });

  addInlineMath(state, active, built, from, to);

  return built;
}

/**
 * `$…$` formulas. Markdown has no math in its grammar, so these are found by
 * scanning the visible text — but only outside code, where a `$` is just a `$`.
 */
const INLINE_MATH = /(?<!\$)\$([^$\n]+?)\$(?!\$)/g;

function addInlineMath(
  state: EditorState,
  active: ActiveContext,
  built: Built,
  from: number,
  to: number
): void {
  const text = state.doc.sliceString(from, to);
  INLINE_MATH.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = INLINE_MATH.exec(text)) !== null) {
    const start = from + match.index;
    const end = start + match[0].length;
    const formula = match[1]?.trim();
    if (!formula) continue;
    if (isLineActive(active, state.doc.lineAt(start).number)) continue;
    if (isInsideCode(state, start)) continue;
    if (overlapsExisting(built, start, end)) continue;

    pushReplace(built, Decoration.replace({ widget: new MathWidget(formula, false) }), start, end);
  }
}

function isInsideCode(state: EditorState, pos: number, tree = syntaxTree(state)): boolean {
  let node = tree.resolveInner(pos, 1);
  while (node) {
    if (/Code/.test(node.name)) return true;
    if (!node.parent) return false;
    node = node.parent;
  }
  return false;
}

function overlapsExisting(built: Built, from: number, to: number): boolean {
  return built.atomics.some((range) => range.from < to && range.to > from);
}

function buildInline(view: EditorView): Built {
  const built: Built = { decorations: [], atomics: [] };

  for (const visible of view.visibleRanges) {
    const part = buildInlineForRange(view.state, visible.from, visible.to);
    built.decorations.push(...part.decorations);
    built.atomics.push(...part.atomics);
  }

  return built;
}

type NodeRef = Parameters<
  NonNullable<Parameters<ReturnType<typeof syntaxTree>['iterate']>[0]['enter']>
>[0];

function handleNode(
  node: NodeRef,
  state: EditorState,
  active: ActiveContext,
  dir: string,
  built: Built,
  visibleFrom: number,
  visibleTo: number
): boolean | void {
  const name = node.name;
  const lineNumberAt = (pos: number): number => state.doc.lineAt(pos).number;
  const lineActive = (pos: number): boolean => isLineActive(active, lineNumberAt(pos));

  // — Headings —
  const atx = /^ATXHeading([1-6])$/.exec(name);
  if (atx) {
    pushLine(built, `md-h${atx[1]}`, state.doc.lineAt(node.from).from);
    return;
  }
  const setext = /^SetextHeading([12])$/.exec(name);
  if (setext) {
    pushLine(built, `md-h${setext[1]}`, state.doc.lineAt(node.from).from);
    return;
  }
  if (name === 'HeaderMark') {
    if (!lineActive(node.from)) {
      // Swallow the space after `#` too, so the text starts at the margin.
      let to = node.to;
      if (state.doc.sliceString(to, to + 1) === ' ') to += 1;
      pushHide(built, node.from, to);
    }
    return;
  }

  // — Inline emphasis —
  if (name === 'StrongEmphasis') {
    pushMark(built, 'md-bold', node.from, node.to);
    return;
  }
  if (name === 'Emphasis') {
    pushMark(built, 'md-italic', node.from, node.to);
    return;
  }
  if (name === 'Strikethrough') {
    pushMark(built, 'md-strike', node.from, node.to);
    return;
  }
  if (name === 'InlineCode') {
    pushMark(built, 'md-code', node.from, node.to);
    return;
  }
  if (name === 'EmphasisMark' || name === 'StrikethroughMark') {
    if (!lineActive(node.from)) pushHide(built, node.from, node.to);
    return;
  }

  // — Fenced code —
  if (name === 'FencedCode') {
    decorateLines(
      built,
      state,
      'md-codeblock-line',
      Math.max(node.from, visibleFrom),
      Math.min(node.to, visibleTo),
      (n) => {
        const first = state.doc.lineAt(node.from).number;
        const last = state.doc.lineAt(node.to).number;
        if (n === first) return 'md-codeblock-first';
        if (n === last) return 'md-codeblock-last';
        return null;
      }
    );
    return;
  }
  if (name === 'CodeMark') {
    const parent = node.node.parent;
    if (parent?.name === 'FencedCode' && node.from === parent.from && !lineActive(node.from)) {
      const info = parent.getChild('CodeInfo');
      const language = info ? state.doc.sliceString(info.from, info.to) : '';
      pushReplace(
        built,
        Decoration.replace({ widget: new FenceChipWidget(language) }),
        node.from,
        node.to
      );
      return;
    }
    if (!lineActive(node.from)) pushHide(built, node.from, node.to);
    return;
  }
  if (name === 'CodeInfo') {
    // The language already shows in the chip.
    if (!lineActive(node.from)) pushHide(built, node.from, node.to);
    return;
  }

  // — Links and images —
  if (name === 'Image') {
    if (!lineActive(node.from)) {
      const text = state.doc.sliceString(node.from, node.to);
      const m = /^!\[([^\]]*)\]\(\s*<?([^)\s>]*)>?(?:\s+"[^"]*")?\s*\)$/.exec(text);
      if (m) {
        pushReplace(
          built,
          Decoration.replace({ widget: new ImageWidget(m[2] ?? '', m[1] ?? '', dir) }),
          node.from,
          node.to
        );
      }
    }
    return false; // children are part of the syntax we just handled
  }
  if (name === 'Link') {
    pushMark(built, 'md-link', node.from, node.to);
    return;
  }
  if (name === 'LinkMark' || name === 'LinkTitle') {
    if (!lineActive(node.from)) pushHide(built, node.from, node.to);
    return;
  }
  if (name === 'URL') {
    const parent = node.node.parent?.name;
    // A bare autolink is the visible text — only hide the URL of `[a](b)`.
    if ((parent === 'Link' || parent === 'Image') && !lineActive(node.from)) {
      pushHide(built, node.from, node.to);
    }
    return;
  }

  // — Lists —
  if (name === 'ListMark') {
    const listKind = node.node.parent?.parent?.name;
    if (listKind === 'OrderedList') {
      pushMark(built, 'md-li-num', node.from, node.to);
      return;
    }
    if (!lineActive(node.from)) {
      pushReplace(built, Decoration.replace({ widget: new BulletWidget() }), node.from, node.to);
    }
    return;
  }
  if (name === 'TaskMarker') {
    const text = state.doc.sliceString(node.from, node.to);
    const checked = /[xX]/.test(text);
    if (!lineActive(node.from)) {
      pushReplace(
        built,
        Decoration.replace({ widget: new CheckboxWidget(checked) }),
        node.from,
        node.to
      );
    }
    if (checked) {
      const item = node.node.parent;
      if (item) pushMark(built, 'md-task-done', node.to, Math.min(item.to, visibleTo));
    }
    return;
  }

  // — Quotes —
  if (name === 'Blockquote') {
    decorateLines(
      built,
      state,
      'md-quote',
      Math.max(node.from, visibleFrom),
      Math.min(node.to, visibleTo)
    );
    return;
  }
  if (name === 'QuoteMark') {
    if (!lineActive(node.from)) {
      let to = node.to;
      if (state.doc.sliceString(to, to + 1) === ' ') to += 1;
      pushHide(built, node.from, to);
    }
    return;
  }

  // — Rules —
  if (name === 'HorizontalRule') {
    if (!lineActive(node.from)) {
      pushReplace(built, Decoration.replace({ widget: new HrWidget() }), node.from, node.to);
    }
    return false;
  }

  // — Raw HTML is shown as text, never rendered —
  if (name === 'HTMLBlock' || name === 'HTMLTag') {
    pushMark(built, 'md-html', node.from, Math.min(node.to, visibleTo));
    return false;
  }
}

class InlinePreviewPlugin implements PluginValue {
  decorations: DecorationSet;
  atomics: DecorationSet;

  constructor(view: EditorView) {
    const built = buildInline(view);
    this.decorations = Decoration.set(built.decorations, true);
    this.atomics = Decoration.set(built.atomics, true);
  }

  update(update: ViewUpdate): void {
    // `treeAdvanced` matters as much as the rest: until the parser reaches a
    // region there are no nodes there to decorate, and nothing else would
    // prompt a rebuild once it gets there.
    const treeAdvanced = syntaxTree(update.state) !== syntaxTree(update.startState);

    if (update.docChanged || update.selectionSet || update.viewportChanged || treeAdvanced) {
      const built = buildInline(update.view);
      this.decorations = Decoration.set(built.decorations, true);
      this.atomics = Decoration.set(built.atomics, true);
    }
  }
}

const inlinePreview = ViewPlugin.fromClass(InlinePreviewPlugin, {
  decorations: (plugin) => plugin.decorations,
  provide: (plugin) =>
    EditorView.atomicRanges.of((view) => view.plugin(plugin)?.atomics ?? Decoration.none)
});

// ---------------------------------------------------------------------------
// Block layer (state field — tables span line breaks)
// ---------------------------------------------------------------------------

type BlockKind = 'table' | 'mermaid' | 'math';

interface BlockRange {
  kind: BlockKind;
  from: number;
  to: number;
  source: string;
  /** Source-only class applied while the block is being edited. */
  srcClass: string;
}

interface BlockState {
  blocks: BlockRange[];
  decorations: DecorationSet;
}

function scanBlocks(state: EditorState): BlockRange[] {
  if (state.doc.length > TABLE_SCAN_LIMIT_BYTES) return [];
  const found: BlockRange[] = [];
  const tree = scanTree(state);

  tree.iterate({
    enter: (node) => {
      if (node.name === 'Table') {
        found.push({
          kind: 'table',
          from: node.from,
          to: node.to,
          source: state.doc.sliceString(node.from, node.to),
          srcClass: 'md-table-src'
        });
        return false;
      }

      if (node.name === 'FencedCode') {
        const info = node.node.getChild('CodeInfo');
        const language = info ? state.doc.sliceString(info.from, info.to).trim() : '';
        if (language.toLowerCase() !== 'mermaid') return false;

        const body = node.node.getChild('CodeText');
        found.push({
          kind: 'mermaid',
          from: node.from,
          to: node.to,
          source: body ? state.doc.sliceString(body.from, body.to) : '',
          srcClass: 'md-codeblock-line'
        });
        return false;
      }

      return undefined;
    }
  });

  found.push(...scanDisplayMath(state, tree));
  found.sort((a, b) => a.from - b.from);
  return found;
}

/** `$$` on its own line opens and closes a display formula. */
function scanDisplayMath(state: EditorState, tree: Tree): BlockRange[] {
  const found: BlockRange[] = [];
  let openLine = -1;

  for (let n = 1; n <= state.doc.lines; n++) {
    const line = state.doc.line(n);
    if (line.text.trim() !== '$$') continue;
    if (isInsideCode(state, line.from, tree)) continue;

    if (openLine < 0) {
      openLine = n;
      continue;
    }

    const open = state.doc.line(openLine);
    found.push({
      kind: 'math',
      from: open.from,
      to: line.to,
      source: state.doc.sliceString(open.to + 1, line.from).trim(),
      srcClass: 'md-math-src'
    });
    openLine = -1;
  }

  return found;
}

function blockWidget(block: BlockRange): Decoration {
  switch (block.kind) {
    case 'table':
      return Decoration.replace({
        widget: new TableWidget(block.source, block.from),
        block: true
      });
    case 'mermaid':
      return Decoration.replace({ widget: new MermaidWidget(block.source), block: true });
    case 'math':
      return Decoration.replace({ widget: new MathWidget(block.source, true), block: true });
  }
}

function blockDecorations(state: EditorState, blocks: BlockRange[]): DecorationSet {
  const active = computeActive(state, isFrozen(state));
  const ranges: Range<Decoration>[] = [];

  for (const block of blocks) {
    if (isRangeActive(active, block.from, block.to)) {
      // Being edited: show the source, styled so it still reads as a block.
      const first = state.doc.lineAt(block.from).number;
      const last = state.doc.lineAt(block.to).number;
      for (let n = first; n <= last; n++) {
        ranges.push(Decoration.line({ class: block.srcClass }).range(state.doc.line(n).from));
      }
      continue;
    }
    ranges.push(blockWidget(block).range(block.from, block.to));
  }

  return Decoration.set(ranges, true);
}

const blockPreview = StateField.define<BlockState>({
  create(state) {
    const blocks = scanBlocks(state);
    return { blocks, decorations: blockDecorations(state, blocks) };
  },

  update(value, tr) {
    // The parser works through a document in chunks, so a block further down
    // simply does not exist in the tree yet when this field is first created.
    // Watching for the tree to advance is therefore not an optimisation — it
    // is the only reason blocks below the first parsed region ever appear.
    const treeAdvanced = syntaxTree(tr.state) !== syntaxTree(tr.startState);

    if (!tr.docChanged && !tr.selection && !tr.reconfigured && !treeAdvanced) return value;

    const blocks = tr.docChanged || treeAdvanced ? scanBlocks(tr.state) : value.blocks;
    return { blocks, decorations: blockDecorations(tr.state, blocks) };
  },

  provide: (field) => [
    EditorView.decorations.from(field, (value) => value.decorations),
    EditorView.atomicRanges.of((view) => view.state.field(field).decorations)
  ]
});

/** Exposed for tests: which blocks the field would render. */
export function scanBlocksForTest(state: EditorState): BlockRange[] {
  return scanBlocks(state);
}

/**
 * Flip the document into "editing" the moment the user touches it, and back
 * to a clean reading surface when focus leaves.
 */
const editingTracker = EditorView.domEventHandlers({
  mousedown: (_event, view) => {
    if (!view.state.field(editingField, false)) {
      // Deferred on purpose: revealing syntax re-flows the line, and doing
      // that mid-click would move the text out from under the pointer before
      // CodeMirror resolves the click into a caret position.
      setTimeout(() => view.dispatch({ effects: setEditing.of(true) }), 0);
    }
    return false;
  },
  keydown: (_event, view) => {
    if (!view.state.field(editingField, false)) {
      view.dispatch({ effects: setEditing.of(true) });
    }
    return false;
  },
  blur: (_event, view) => {
    if (view.state.field(editingField, false)) {
      view.dispatch({ effects: setEditing.of(false) });
    }
    return false;
  }
});

export function livePreview(): Extension {
  return [editingField, editingTracker, blockPreview, inlinePreview];
}
