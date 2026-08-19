import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

/**
 * Where the caret has jumped from.
 *
 * Only non-local jumps go in — an outline click, a heading jump, a search
 * result. Arrow keys and scrolling never do, because "Back" meaning "one word
 * to the left" is what makes navigation history useless.
 */
interface Jump {
  pos: number;
  scrollTop: number;
}

const MAX_ENTRIES = 64;

class JumpHistory {
  private back: Jump[] = [];
  private forward: Jump[] = [];

  /** Record the position we are leaving, before moving somewhere far away. */
  push(view: EditorView): void {
    const entry = {
      pos: view.state.selection.main.head,
      scrollTop: view.scrollDOM.scrollTop
    };

    const last = this.back[this.back.length - 1];
    // Two jumps from nearly the same place are one entry, not two.
    if (last && Math.abs(last.pos - entry.pos) < 2) return;

    this.back.push(entry);
    if (this.back.length > MAX_ENTRIES) this.back.shift();
    this.forward = [];
  }

  goBack(view: EditorView): boolean {
    const entry = this.back.pop();
    if (!entry) return false;
    this.forward.push({
      pos: view.state.selection.main.head,
      scrollTop: view.scrollDOM.scrollTop
    });
    this.restore(view, entry);
    return true;
  }

  goForward(view: EditorView): boolean {
    const entry = this.forward.pop();
    if (!entry) return false;
    this.back.push({
      pos: view.state.selection.main.head,
      scrollTop: view.scrollDOM.scrollTop
    });
    this.restore(view, entry);
    return true;
  }

  private restore(view: EditorView, entry: Jump): void {
    const pos = Math.max(0, Math.min(entry.pos, view.state.doc.length));
    view.dispatch({ selection: EditorSelection.cursor(pos) });
    view.scrollDOM.scrollTop = entry.scrollTop;
    view.focus();
  }

  clear(): void {
    this.back = [];
    this.forward = [];
  }
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

export function jumpBack(view: EditorView): boolean {
  return historyFor(view).goBack(view);
}

export function jumpForward(view: EditorView): boolean {
  return historyFor(view).goForward(view);
}
