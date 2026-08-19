import { getSearchQuery } from '@codemirror/search';
import type { Extension } from '@codemirror/state';
import { ViewPlugin, type EditorView, type ViewUpdate } from '@codemirror/view';

/**
 * Where the matches are in the document, drawn down the right-hand edge.
 *
 * The panel says how many; this says where. In a long document that is the
 * difference between knowing a word appears forty times and seeing that all
 * forty are in one section — which is usually the thing the reader was
 * actually trying to find out.
 *
 * The marks sit just inside the scrollbar rather than on it: overlapping the
 * thumb would make both harder to read, and the marks are a hint, not a
 * control — they take no clicks.
 */

/**
 * Enough ticks to show the shape of the matches; past this the rail would be
 * a solid bar and tell the reader nothing. Scanning stops here too, so the
 * cost of a query matching half the document stays bounded.
 */
const MAX_TICKS = 400;

class SearchRail {
  private rail: HTMLElement;

  constructor(private view: EditorView) {
    this.rail = document.createElement('div');
    this.rail.className = 'md-search-rail';
    this.rail.setAttribute('aria-hidden', 'true');
    view.dom.appendChild(this.rail);
    this.draw();
  }

  update(update: ViewUpdate): void {
    const before = getSearchQuery(update.startState);
    const after = getSearchQuery(update.state);
    if (update.docChanged || update.geometryChanged || update.selectionSet || !before.eq(after)) {
      this.draw();
    }
  }

  destroy(): void {
    this.rail.remove();
  }

  private draw(): void {
    const query = getSearchQuery(this.view.state);
    if (!query.search || !query.valid) {
      this.rail.replaceChildren();
      this.rail.style.display = 'none';
      return;
    }

    const height = this.view.contentHeight;
    if (height <= 0) return;

    const selection = this.view.state.selection.main;
    const ticks: HTMLElement[] = [];
    const cursor = query.getCursor(this.view.state);

    for (let n = 0; n < MAX_TICKS; n++) {
      const next = cursor.next();
      if (next.done) break;

      let top: number;
      try {
        top = this.view.lineBlockAt(next.value.from).top;
      } catch {
        continue;
      }

      const tick = document.createElement('div');
      tick.className = 'md-search-tick';
      if (next.value.from === selection.from && next.value.to === selection.to) {
        tick.classList.add('current');
      }
      tick.style.top = `${(top / height) * 100}%`;
      ticks.push(tick);
    }

    // The scroller starts below the search panel, and the rail has to line up
    // with the text rather than with the editor's outer box.
    this.rail.style.top = `${this.view.scrollDOM.offsetTop}px`;
    this.rail.style.display = ticks.length > 0 ? '' : 'none';
    this.rail.replaceChildren(...ticks);
  }
}

export const searchRail: Extension = ViewPlugin.fromClass(SearchRail);
