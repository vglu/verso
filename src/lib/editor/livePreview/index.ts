import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import type { Tree } from '@lezer/common';
import {
  Facet,
  Prec,
  StateField,
  type EditorState,
  type Extension,
  type Range
} from '@codemirror/state';
import { editingField, setEditing } from './editing';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type PluginValue,
  type ViewUpdate,
  type WidgetType
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

export { editingField, setEditing };

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
const FORCE_PARSE_BUDGET_MS = 25;

/**
 * The best tree available for a whole-document scan.
 *
 * `allowForce` is false while the user is typing. Forcing the parse forward
 * there costs its full budget on every keystroke, synchronously, inside state
 * construction — measured at tens of milliseconds on a large file. The parse
 * catches up on its own a moment later and the field re-scans then, so the
 * only thing waiting buys is a stutter.
 */
function scanTree(state: EditorState, allowForce: boolean): Tree {
  if (allowForce && state.doc.length <= FORCE_PARSE_LIMIT_BYTES) {
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

/**
 * End of the whitespace run following a block marker.
 *
 * `#   Heading` is legal Markdown, and hiding only one of those spaces left
 * the rendered heading indented by the rest.
 */
function afterMarkerSpace(state: EditorState, from: number): number {
  const line = state.doc.lineAt(from);
  let to = from;
  while (to < line.to && /[ \t]/.test(state.doc.sliceString(to, to + 1))) to += 1;
  return to;
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

  // Ranges the block layer owns. Inline decorations inside them are either
  // thrown away (the block is drawn as a widget) or actively harmful (the
  // block is showing its source for editing, and concealing the markup there
  // means the pipes no longer line up with the text).
  const owned = renderedBlocks(state);
  const insideBlock = (pos: number): boolean =>
    owned.some((b) => pos >= b.from && pos < b.to);

  syntaxTree(state).iterate({
    from,
    to,
    enter: (node) => {
      if (insideBlock(node.from)) return false;
      return handleNode(node, state, active, dir, built, from, to);
    }
  });

  addInlineMath(state, active, built, from, to, insideBlock);

  return built;
}

/**
 * `$…$` formulas. Markdown has no math in its grammar, so these are found by
 * scanning the text — but a `$` in prose is usually money, not mathematics.
 *
 * The rule is KaTeX's own auto-render heuristic: an opening `$` must follow a
 * boundary and be followed by something that is not a space; a closing `$`
 * must follow something that is not a space and must not be followed by a
 * letter or digit. Without it "It costs $5 and $7 today" renders as a formula
 * that swallows the words between the two prices.
 */
function isMathOpen(prev: string, next: string): boolean {
  if (next === '' || /\s/.test(next)) return false;
  if (prev === '') return true;
  return /[\s(["'“«[{,;:—–-]/.test(prev);
}

function isMathClose(prev: string, next: string): boolean {
  if (prev === '' || /\s/.test(prev)) return false;
  return !/[0-9A-Za-zЀ-ӿ]/.test(next);
}

function addInlineMath(
  state: EditorState,
  active: ActiveContext,
  built: Built,
  from: number,
  to: number,
  insideBlock: (pos: number) => boolean = () => false
): void {
  const text = state.doc.sliceString(from, to);
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (ch === '\\') {
      i += 2; // an escaped character, including \$, is literal
      continue;
    }
    if (ch !== '$') {
      i += 1;
      continue;
    }
    if (text[i + 1] === '$') {
      i += 2; // display math is the block layer's business
      continue;
    }
    if (!isMathOpen(i === 0 ? '' : (text[i - 1] ?? ''), text[i + 1] ?? '')) {
      i += 1;
      continue;
    }

    // Look for a closing `$` before the line ends.
    let j = i + 1;
    let close = -1;
    while (j < text.length) {
      const cj = text[j];
      if (cj === '\\') {
        j += 2;
        continue;
      }
      if (cj === '\n') break;
      if (cj === '$') {
        if (isMathClose(text[j - 1] ?? '', text[j + 1] ?? '')) close = j;
        break;
      }
      j += 1;
    }

    if (close < 0) {
      i += 1;
      continue;
    }

    const start = from + i;
    const end = from + close + 1;
    const formula = text.slice(i + 1, close).trim();

    if (
      formula &&
      !insideBlock(start) &&
      !isLineActive(active, state.doc.lineAt(start).number) &&
      !isInsideCode(state, start) &&
      !overlapsExisting(built, start, end)
    ) {
      pushReplace(
        built,
        Decoration.replace({ widget: new MathWidget(formula, false) }),
        start,
        end
      );
    }

    i = close + 1;
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
    // Both lines carry the class: the underline is concealed, and without the
    // class its now-empty line rendered at body height as a phantom gap.
    decorateLines(
      built,
      state,
      `md-h${setext[1]}`,
      node.from,
      Math.min(node.to, visibleTo),
      (n, first, last) => (n === last && last > first ? 'md-setext-underline' : null)
    );
    return;
  }
  if (name === 'HeaderMark') {
    if (!lineActive(node.from)) {
      pushHide(built, node.from, afterMarkerSpace(state, node.to));
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
      // The chip carries where the language lives, so clicking it can select
      // the language rather than leaving it unreachable behind the widget.
      pushReplace(
        built,
        Decoration.replace({ widget: new FenceChipWidget(language, info ? info.from : node.to) }),
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
      // Read the destination and the alt text off the tree rather than
      // re-parsing with a regex: titles in single quotes, brackets inside the
      // alt text and angle-bracketed URLs with spaces are all legal, and all
      // of them defeated the pattern this used to use.
      const url = node.node.getChild('URL');
      const marks = node.node.getChildren('LinkMark');
      const altFrom = marks[0]?.to ?? node.from + 2;
      const altTo = marks[1]?.from ?? altFrom;

      if (url) {
        const target = state.doc.sliceString(url.from, url.to).replace(/^<|>$/g, '');
        const alt = altTo > altFrom ? state.doc.sliceString(altFrom, altTo) : '';
        pushReplace(
          built,
          Decoration.replace({ widget: new ImageWidget(target, alt, dir, node.from) }),
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
  if (name === 'Autolink') {
    // `<https://…>` is its own text; only the angle brackets go.
    pushMark(built, 'md-link', node.from, node.to);
    return;
  }
  if (name === 'LinkMark' || name === 'LinkTitle') {
    if (!lineActive(node.from)) pushHide(built, node.from, node.to);
    return;
  }
  if (name === 'LinkLabel') {
    // The `[ref]` half of `[text][ref]`. Left visible it leaks into the
    // rendered text as "text[ref]".
    const parent = node.node.parent?.name;
    if (parent === 'Link' && !lineActive(node.from)) pushHide(built, node.from, node.to);
    return;
  }
  if (name === 'URL') {
    const parent = node.node.parent?.name;
    // A bare autolink is the visible text — only hide the URL of `[a](b)`.
    if ((parent === 'Link' || parent === 'Image') && !lineActive(node.from)) {
      pushHide(built, node.from, node.to);
    } else if (!parent || parent === 'Paragraph') {
      pushMark(built, 'md-link', node.from, node.to);
    }
    return;
  }
  if (name === 'LinkReference') {
    // A `[ref]: https://…` definition line. Half-concealing it deleted the
    // colon and left the rest; it is metadata, so it stays as written.
    return false;
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
      pushHide(built, node.from, afterMarkerSpace(state, node.to));
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
    const startedEditing = update.transactions.some((tr) =>
      tr.effects.some((e) => e.is(setEditing))
    );

    if (
      update.docChanged ||
      update.selectionSet ||
      update.viewportChanged ||
      treeAdvanced ||
      startedEditing
    ) {
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

type BlockKind = 'table' | 'mermaid' | 'math' | 'image';

interface BlockRange {
  kind: BlockKind;
  from: number;
  to: number;
  /** For an image this is the destination; otherwise the block's body. */
  source: string;
  /** Source-only class applied while the block is being edited. */
  srcClass: string;
  /** Images only. */
  alt?: string;
}

interface BlockState {
  blocks: BlockRange[];
  decorations: DecorationSet;
}

function scanBlocks(state: EditorState, allowForce = true): BlockRange[] {
  if (state.doc.length > TABLE_SCAN_LIMIT_BYTES) return [];
  const found: BlockRange[] = [];
  const tree = scanTree(state, allowForce);

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

      // An image alone on its line is a block, not a word: it is the only
      // inline element big enough that replacing it with its own URL would
      // move the page. Handled here so it can show source and picture at once.
      if (node.name === 'Image') {
        const line = state.doc.lineAt(node.from);
        const alone = line.text.trim() === state.doc.sliceString(node.from, node.to).trim();
        if (!alone) return false;

        const url = node.node.getChild('URL');
        if (!url) return false;
        const marks = node.node.getChildren('LinkMark');
        const altFrom = marks[0]?.to ?? node.from + 2;
        const altTo = marks[1]?.from ?? altFrom;

        found.push({
          kind: 'image',
          from: line.from,
          to: line.to,
          source: state.doc.sliceString(url.from, url.to).replace(/^<|>$/g, ''),
          alt: altTo > altFrom ? state.doc.sliceString(altFrom, altTo) : '',
          srcClass: 'md-img-src'
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

/**
 * `$$` on its own line opens and closes a display formula.
 *
 * Walked with a line iterator rather than `doc.line(n)`: the indexed accessor
 * is a tree lookup each time, and on a large document that walk was the whole
 * per-keystroke cost of this layer.
 */
function scanDisplayMath(state: EditorState, tree: Tree): BlockRange[] {
  const found: BlockRange[] = [];
  let openLine = -1;
  let openFrom = 0;
  let openTo = 0;

  const iter = state.doc.iterLines();
  let n = 0;
  let from = 0;

  while (true) {
    const step = iter.next();
    if (step.done) break;
    n += 1;

    const raw = step.value;
    const to = from + raw.length;
    const line = { from, to, text: raw };
    from = to + 1; // past the newline
    const text = raw.trim();

    // `$$ E = mc^2 $$` on one line: neither layer claimed it before, so it
    // rendered as literal text.
    const oneLiner = /^\$\$(.+)\$\$$/.exec(text);
    if (oneLiner && openLine < 0 && !isInsideCode(state, line.from, tree)) {
      found.push({
        kind: 'math',
        from: line.from,
        to: line.to,
        source: (oneLiner[1] ?? '').trim(),
        srcClass: 'md-math-src'
      });
      continue;
    }

    if (text !== '$$') continue;
    if (isInsideCode(state, line.from, tree)) continue;

    if (openLine < 0) {
      openLine = n;
      openFrom = line.from;
      openTo = line.to;
      continue;
    }

    found.push({
      kind: 'math',
      from: openFrom,
      to: line.to,
      source: state.doc.sliceString(openTo + 1, line.from).trim(),
      srcClass: 'md-math-src'
    });
    openLine = -1;
  }

  return found;
}

/** The rendered result shown beneath a generated block while it is edited. */
function previewWidget(block: BlockRange, dir: string): WidgetType {
  switch (block.kind) {
    case 'mermaid':
      return new MermaidWidget(block.source);
    case 'image':
      return new ImageWidget(block.source, block.alt ?? '', dir);
    default:
      return new MathWidget(block.source, true);
  }
}

function blockWidget(block: BlockRange, dir: string): Decoration {
  switch (block.kind) {
    case 'table':
      return Decoration.replace({
        widget: new TableWidget(block.source, block.from),
        block: true
      });
    case 'mermaid':
      return Decoration.replace({
        widget: new MermaidWidget(block.source, block.from),
        block: true
      });
    case 'image':
      return Decoration.replace({
        widget: new ImageWidget(block.source, block.alt ?? '', dir, block.from),
        block: true
      });
    case 'math':
      return Decoration.replace({
        widget: new MathWidget(block.source, true, block.from),
        block: true
      });
  }
}

/**
 * Whether a block's source is a *description* of its content rather than the
 * content itself (ADR-003).
 *
 * `\int_{-\infty}^{\infty}` and `graph TD; A-->B` cannot be judged by reading
 * them, so while they are edited the rendered result stays on screen beside
 * the source. A table is the opposite case: the cell text *is* the content,
 * so showing both would only duplicate it.
 */
function isGenerated(kind: BlockKind): boolean {
  return kind === 'math' || kind === 'mermaid' || kind === 'image';
}

function blockDecorations(state: EditorState, blocks: BlockRange[]): DecorationSet {
  const active = computeActive(state, isFrozen(state));
  const dir = state.facet(documentDir);
  const ranges: Range<Decoration>[] = [];

  for (const block of blocks) {
    if (isRangeActive(active, block.from, block.to)) {
      // Being edited: show the source, styled so it still reads as a block.
      const first = state.doc.lineAt(block.from).number;
      const last = state.doc.lineAt(block.to).number;
      for (let n = first; n <= last; n++) {
        ranges.push(Decoration.line({ class: block.srcClass }).range(state.doc.line(n).from));
      }

      // …and, for a generated block, keep the result underneath it as a live
      // preview. Placing the widget after the block rather than over it means
      // the caret never causes the page to collapse.
      if (isGenerated(block.kind)) {
        ranges.push(
          Decoration.widget({
            widget: previewWidget(block, dir),
            block: true,
            side: 1
          }).range(block.to)
        );
      }
      continue;
    }
    ranges.push(blockWidget(block, dir).range(block.from, block.to));
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
    // The transaction that begins editing carries nothing else — no text
    // change, no selection. Without this the document stayed frozen until
    // some *later* transaction happened to rebuild it, which is why the first
    // click never revealed anything and the second one did.
    const startedEditing = tr.effects.some((e) => e.is(setEditing));

    if (!tr.docChanged && !tr.selection && !tr.reconfigured && !treeAdvanced && !startedEditing)
      return value;

    const blocks =
      tr.docChanged || treeAdvanced ? scanBlocks(tr.state, !tr.docChanged) : value.blocks;
    return { blocks, decorations: blockDecorations(tr.state, blocks) };
  },

  provide: (field) => [
    EditorView.decorations.from(field, (value) => value.decorations)
    // Deliberately NOT contributed to `atomicRanges`.
    //
    // An atomic block is one the caret steps over, which is right for a hidden
    // `**` marker and completely wrong for a table: pressing Down once would
    // leap the entire table, twenty rows at a time, and there would be no way
    // to walk into it at all. Left non-atomic, the caret enters the range, the
    // selection turns the block active on the same transaction, and its source
    // is showing by the time the frame is drawn — so Down steps into the table
    // and then through it line by line, as it does in every other editor.
  ]
});

/** Exposed for tests: which blocks the field would render. */
export function scanBlocksForTest(state: EditorState): BlockRange[] {
  return scanBlocks(state);
}

export type { BlockRange };

/**
 * The block ranges currently rendered as widgets.
 *
 * Vertical caret movement needs these: a replaced block has no visual lines
 * inside it, so Up and Down step straight over it unless something puts the
 * caret in deliberately.
 */
export function renderedBlocks(state: EditorState): BlockRange[] {
  return state.field(blockPreview, false)?.blocks ?? [];
}

/**
 * Flip the document into "editing" the moment the user touches it, and back
 * to a clean reading surface when focus leaves.
 */
/** Pending deferred reveal, so it can be cancelled if the view goes away. */
let revealTimer: ReturnType<typeof setTimeout> | null = null;

function cancelPendingReveal(): void {
  if (revealTimer !== null) {
    clearTimeout(revealTimer);
    revealTimer = null;
  }
}

const editingTracker = EditorView.domEventHandlers({
  mousedown: (_event, view) => {
    if (!view.state.field(editingField, false)) {
      cancelPendingReveal();
      // Deferred on purpose: revealing syntax re-flows the line, and doing
      // that mid-click would move the text out from under the pointer before
      // CodeMirror resolves the click into a caret position.
      revealTimer = setTimeout(() => {
        revealTimer = null;
        // The tab may have been closed, or the buffer replaced, in the
        // meantime — dispatching into a dead view throws, and into a fresh
        // one would open a document nobody has touched yet.
        if (!view.dom.isConnected) return;
        if (view.state.field(editingField, false)) return;
        view.dispatch({ effects: setEditing.of(true) });
      }, 0);
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
    cancelPendingReveal();
    if (view.state.field(editingField, false)) {
      view.dispatch({ effects: setEditing.of(false) });
    }
    return false;
  }
});

export function livePreview(): Extension {
  return [
    editingField,
    // Highest precedence so the tracker sees every key. Handlers run until
    // one claims the event; sitting below the keymap meant that any key the
    // keymap handled — every arrow, every shortcut — never started editing.
    Prec.highest(editingTracker),
    blockPreview,
    inlinePreview
  ];
}
