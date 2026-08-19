import { EditorSelection, type ChangeDesc, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { ScrollAnchor } from './createEditor';

/**
 * Where the caret has jumped from.
 *
 * Only non-local jumps go in — an outline click, a heading jump, a search
 * result. Arrow keys and scrolling never do, because "Back" meaning "one word
 * to the left" is what makes navigation history useless.
 */
interface Jump {
  pos: number;
  anchor: ScrollAnchor;
}

const MAX_ENTRIES = 64;

class JumpHistory {
  private back: Jump[] = [];
  private forward: Jump[] = [];

  private snapshot(view: EditorView): Jump {
    return {
      pos: view.state.selection.main.head,
      anchor: captureFrom(view)
    };
  }

  /** Record the position we are leaving, before moving somewhere far away. */
  push(view: EditorView): void {
    const entry = this.snapshot(view);

    const last = this.back[this.back.length - 1];
    // Two jumps from nearly the same place are one entry, not two.
    if (last && Math.abs(last.pos - entry.pos) < 2) return;

    this.back.push(entry);
    if (this.back.length > MAX_ENTRIES) this.back.shift();
    this.forward = [];
  }

  /** Undo the most recent push, when the jump it recorded did not happen. */
  cancelLast(view: EditorView): void {
    const last = this.back[this.back.length - 1];
    if (last && Math.abs(last.pos - view.state.selection.main.head) < 2) {
      this.back.pop();
    }
  }

  goBack(view: EditorView): boolean {
    const entry = this.back.pop();
    if (!entry) return false;
    this.forward.push(this.snapshot(view));
    this.restore(view, entry);
    return true;
  }

  goForward(view: EditorView): boolean {
    const entry = this.forward.pop();
    if (!entry) return false;
    this.back.push(this.snapshot(view));
    this.restore(view, entry);
    return true;
  }

  /**
   * Follow the text as it is edited.
   *
   * A stored offset means nothing once the document has changed around it —
   * without this, Back after a few edits lands the reader somewhere they have
   * never been.
   */
  mapThrough(changes: ChangeDesc): void {
    const map = (entry: Jump): Jump => ({
      pos: changes.mapPos(entry.pos),
      anchor: { pos: changes.mapPos(entry.anchor.pos), offset: entry.anchor.offset }
    });
    this.back = this.back.map(map);
    this.forward = this.forward.map(map);
  }

  private restore(view: EditorView, entry: Jump): void {
    const pos = Math.max(0, Math.min(entry.pos, view.state.doc.length));
    view.dispatch({ selection: EditorSelection.cursor(pos) });
    restoreTo(view, entry.anchor);
    view.focus();
  }
}

/** Duplicated deliberately: importing createEditor here would be circular. */
function captureFrom(view: EditorView): ScrollAnchor {
  try {
    const pos = view.visibleRanges[0]?.from ?? 0;
    return { pos, offset: view.scrollDOM.scrollTop - view.lineBlockAt(pos).top };
  } catch {
    return { pos: 0, offset: 0 };
  }
}

function restoreTo(view: EditorView, anchor: ScrollAnchor): void {
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

/** One history per editor view, so switching tabs does not mix them up. */
const histories = new WeakMap<EditorView, JumpHistory>();

function historyFor(view: EditorView): JumpHistory {
  let history = histories.get(view);
  if (!history) {
    history = new JumpHistory();
    histories.set(view, history);
  }
  return history;
}

export function pushJump(view: EditorView): void {
  historyFor(view).push(view);
}

/** Drop a push that turned out not to lead anywhere. */
export function cancelJump(view: EditorView): void {
  historyFor(view).cancelLast(view);
}

export function jumpBack(view: EditorView): boolean {
  return historyFor(view).goBack(view);
}

export function jumpForward(view: EditorView): boolean {
  return historyFor(view).goForward(view);
}

/**
 * Keeps recorded positions in step with the text.
 *
 * Shipped as an extension rather than left to whoever built the editor: a
 * history that silently stops tracking when someone forgets to wire it is
 * worse than none, because Back still answers — with the wrong place.
 */
export const jumpHistoryKeeper: Extension = EditorView.updateListener.of((update) => {
  if (!update.docChanged) return;
  histories.get(update.view)?.mapThrough(update.changes);
});
