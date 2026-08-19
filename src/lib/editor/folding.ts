import {
  codeFolding,
  foldEffect,
  foldService,
  foldedRanges,
  syntaxTree,
  unfoldEffect
} from '@codemirror/language';
import type { EditorState, Extension } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view';
import type { DecorationSet, PluginValue, ViewUpdate } from '@codemirror/view';
import type { Range } from '@codemirror/state';
import type { Tree } from '@lezer/common';

/**
 * Folding a section away.
 *
 * A heading owns everything under it until the next heading of the same rank
 * or higher — that is what "a section" means to someone reading a document,
 * and it is the only unit worth folding here. Fenced code and lists come
 * along for the ride where they nest.
 *
 * Which lines are headings comes from the syntax tree rather than a pattern:
 * a `#` inside a fenced code block is text, and folding "the section" from
 * there would swallow the rest of the file.
 */

const HEADING = /^(?:ATXHeading|SetextHeading)([1-6])$/;

function headingLevelAt(tree: Tree, pos: number): number | null {
  let node = tree.resolveInner(pos, 1);
  while (node) {
    const match = HEADING.exec(node.name);
    if (match) return Number(match[1]);
    if (!node.parent) return null;
    node = node.parent;
  }
  return null;
}

/**
 * Where this section stops: the start of the next heading that outranks it,
 * or the end of the document.
 *
 * Walked over the document's top-level children. Headings live there, and
 * descending into every paragraph to find the next one would make this cost
 * the whole file.
 */
function sectionEnd(state: EditorState, tree: Tree, after: number, level: number): number {
  const cursor = tree.cursorAt(after, 1);
  while (cursor.parent()) {
    /* climb to the document node */
  }
  if (!cursor.firstChild()) return state.doc.length;

  do {
    if (cursor.from < after) continue;
    const match = HEADING.exec(cursor.name);
    if (match && Number(match[1]) <= level) return cursor.from;
  } while (cursor.nextSibling());

  return state.doc.length;
}

/**
 * Blank lines between sections belong to the gap, not to the fold.
 *
 * `to` is the start of the next heading, so the last line of the range is a
 * partial one — measuring it whole would pull that heading into the fold.
 */
function trimTrailingBlanks(state: EditorState, from: number, to: number): number {
  let end = to;
  while (end > from) {
    const line = state.doc.lineAt(end);
    const lineEnd = Math.min(line.to, end);
    if (state.doc.sliceString(line.from, lineEnd).trim().length > 0) return lineEnd;
    if (line.from <= from) break;
    end = line.from - 1;
  }
  return Math.max(from, end);
}

/**
 * The range a heading line folds away, or null when it has nothing under it.
 *
 * Also handles a list item with nested lines beneath it, which is the other
 * shape people expect to collapse.
 */
export function foldableSection(
  state: EditorState,
  lineStart: number,
  lineEnd: number
): { from: number; to: number } | null {
  const tree = syntaxTree(state);
  const level = headingLevelAt(tree, lineStart);

  if (level !== null) {
    const end = trimTrailingBlanks(state, lineEnd, sectionEnd(state, tree, lineEnd + 1, level));
    return end > lineEnd ? { from: lineEnd, to: end } : null;
  }

  // A list item folds when something is indented under it.
  const item = itemAt(tree, lineStart);
  if (item && item.to > lineEnd) {
    const end = trimTrailingBlanks(state, lineEnd, item.to);
    return end > lineEnd ? { from: lineEnd, to: end } : null;
  }

  return null;
}

function itemAt(tree: Tree, pos: number): { from: number; to: number } | null {
  let node = tree.resolveInner(pos, 1);
  while (node) {
    if (node.name === 'ListItem') return { from: node.from, to: node.to };
    if (!node.parent) return null;
    node = node.parent;
  }
  return null;
}

/** True when this exact range is currently folded away. */
function isFolded(state: EditorState, from: number, to: number): boolean {
  let folded = false;
  foldedRanges(state).between(from, to, (f, t) => {
    if (f === from && t === to) folded = true;
  });
  return folded;
}

/**
 * The chevron beside a foldable heading.
 *
 * Not a fold gutter: a gutter is a permanent column down the side of a
 * document that is meant to read like a page. This sits in the margin beside
 * the heading it belongs to, invisible until the pointer is on that line —
 * except when the section is folded, where it is the only sign that anything
 * is hidden, so it stays.
 */
class FoldChevron extends WidgetType {
  constructor(
    readonly line: number,
    readonly folded: boolean
  ) {
    super();
  }

  eq(other: FoldChevron): boolean {
    return other.line === this.line && other.folded === this.folded;
  }

  toDOM(view: EditorView): HTMLElement {
    const el = document.createElement('span');
    el.className = this.folded ? 'md-fold md-fold-closed' : 'md-fold';
    el.textContent = this.folded ? '▸' : '▾';
    el.title = this.folded ? 'Unfold section' : 'Fold section';
    el.setAttribute('aria-hidden', 'true');

    el.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleSectionAt(view, this.line);
    });

    return el;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/** Fold or unfold the section whose heading is on the line at `pos`. */
export function toggleSectionAt(view: EditorView, pos: number): boolean {
  const line = view.state.doc.lineAt(pos);
  const range = foldableSection(view.state, line.from, line.to);
  if (!range) return false;

  view.dispatch({
    effects: isFolded(view.state, range.from, range.to)
      ? unfoldEffect.of(range)
      : foldEffect.of(range)
  });
  return true;
}

class FoldMarkers implements PluginValue {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = build(view);
  }

  update(update: ViewUpdate): void {
    // A fold arrives as an effect and changes nothing else, so watching the
    // document and the viewport is not enough — the chevron would keep
    // pointing down over a section that is already closed.
    const folded = update.transactions.some((tr) =>
      tr.effects.some((e) => e.is(foldEffect) || e.is(unfoldEffect))
    );

    if (update.docChanged || update.viewportChanged || folded) {
      this.decorations = build(update.view);
    }
  }
}

function build(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const state = view.state;

  for (const visible of view.visibleRanges) {
    let pos = visible.from;
    while (pos <= visible.to) {
      const line = state.doc.lineAt(pos);
      const section = foldableSection(state, line.from, line.to);
      if (section) {
        ranges.push(
          Decoration.widget({
            widget: new FoldChevron(line.from, isFolded(state, section.from, section.to)),
            side: -1
          }).range(line.from)
        );
      }
      if (line.to >= state.doc.length) break;
      pos = line.to + 1;
    }
  }

  return Decoration.set(ranges, true);
}

const foldMarkers = ViewPlugin.fromClass(FoldMarkers, {
  decorations: (plugin) => plugin.decorations
});

export function markdownFolding(): Extension {
  return [
    codeFolding({
      placeholderText: '⋯',
      placeholderDOM: (_view, onclick) => {
        const el = document.createElement('span');
        el.className = 'md-fold-placeholder';
        el.textContent = '⋯';
        el.title = 'Unfold';
        el.setAttribute('role', 'button');
        el.addEventListener('click', onclick);
        return el;
      }
    }),
    foldService.of(foldableSection),
    foldMarkers
  ];
}
