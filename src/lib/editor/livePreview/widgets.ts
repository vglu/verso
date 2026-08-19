import { EditorSelection } from '@codemirror/state';
import { EditorView, WidgetType } from '@codemirror/view';
import { setEditing } from './editing';
import { convertFileSrc } from '@tauri-apps/api/core';
import { renderInline } from './inline';
import { parseTable } from './table';
import { cellsOfRow } from '../tableNav';
import { decodeUrlPath, isRemoteUrl, joinPath, stripUrlSuffix } from '../pathUtil';

/**
 * Widgets are view-only. None of them mutate the document, with one
 * deliberate exception: the task checkbox, where clicking *is* the user
 * editing the text (EDITOR-CORE §6).
 */

/** Bullet glyph replacing `-`/`*`/`+` in unordered lists. */
export class BulletWidget extends WidgetType {
  eq(): boolean {
    return true;
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'md-bullet';
    span.textContent = '•';
    return span;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/** Horizontal rule replacing `---`. */
export class HrWidget extends WidgetType {
  constructor(readonly from = -1) {
    super();
  }

  eq(other: HrWidget): boolean {
    return other.from === this.from;
  }

  toDOM(view: EditorView): HTMLElement {
    const span = document.createElement('span');
    span.className = 'md-hr';

    // A rule fills its line, so a click anywhere on that line lands on the
    // widget. Without a handler there is no way to put the caret on it at
    // all, and no way to delete it with the mouse.
    if (this.from >= 0) {
      span.addEventListener('mousedown', (event) => {
        event.preventDefault();
        view.dispatch({
          selection: EditorSelection.cursor(Math.min(this.from, view.state.doc.length)),
          effects: setEditing.of(true),
          scrollIntoView: false
        });
        view.focus();
      });
    }

    return span;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/** Interactive task checkbox for `- [ ]` / `- [x]`. */
export class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super();
  }

  eq(other: CheckboxWidget): boolean {
    return other.checked === this.checked;
  }

  toDOM(view: EditorView): HTMLElement {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'md-task';
    input.checked = this.checked;
    input.setAttribute('aria-label', this.checked ? 'Task done' : 'Task not done');

    input.addEventListener('mousedown', (event) => {
      event.preventDefault();
      // `readOnly` only stops the editor's own input handling; a widget
      // dispatching a transaction would sail straight past it, and ticking a
      // box in a read-only document writes to the file.
      if (view.state.readOnly) return;

      // Resolve the position at click time: the document may have shifted
      // since this widget was created.
      const pos = view.posAtDOM(input);
      const marker = view.state.doc.sliceString(pos, pos + 3);
      if (!/^\[[ xX]\]$/.test(marker)) return;

      view.dispatch({
        changes: { from: pos, to: pos + 3, insert: this.checked ? '[ ]' : '[x]' },
        userEvent: 'input'
      });
    });

    return input;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/** Rendered image; `baseDir` resolves document-relative sources. */
export class ImageWidget extends WidgetType {
  constructor(
    readonly url: string,
    readonly alt: string,
    readonly baseDir: string,
    readonly from = -1
  ) {
    super();
  }

  eq(other: ImageWidget): boolean {
    return other.url === this.url && other.alt === this.alt && other.baseDir === this.baseDir;
  }

  /**
   * A guess, but a much better one than a line of text.
   *
   * Until a picture loads the editor has no idea how tall it is, and every
   * position below it is computed against that wrong height — which is what
   * makes a document jump about while images arrive.
   */
  get estimatedHeight(): number {
    return 220;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('span');
    wrap.className = 'md-img-wrap';

    // An image on its own line is otherwise a dead end: the only way to reach
    // its source is to click past the picture's right edge.
    if (this.from >= 0) {
      wrap.addEventListener('mousedown', (event) => {
        event.preventDefault();
        const pos = Math.min(this.from, view.state.doc.length);
        view.dispatch({
          selection: EditorSelection.cursor(pos),
          effects: setEditing.of(true),
          scrollIntoView: false
        });
        view.focus();
      });
    }

    const img = document.createElement('img');
    img.className = 'md-img';
    img.alt = this.alt;
    img.loading = 'lazy';
    img.src = resolveImageSrc(this.url, this.baseDir);

    img.addEventListener('error', () => {
      wrap.replaceChildren(brokenImage(this.alt || this.url));
    });

    wrap.appendChild(img);
    return wrap;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

function brokenImage(label: string): HTMLElement {
  const box = document.createElement('span');
  box.className = 'md-img-broken';
  box.textContent = `🖼 ${label}`;
  return box;
}

export function resolveImageSrc(url: string, baseDir: string): string {
  if (isRemoteUrl(url)) return url;
  const clean = decodeUrlPath(stripUrlSuffix(url));
  if (!baseDir) return url;
  try {
    return convertFileSrc(joinPath(baseDir, clean));
  } catch {
    return url;
  }
}

/**
 * Language chip on the opening line of a fenced code block.
 *
 * The chip stands in for the ``` marker and the language name, which means it
 * is also the only way back to them: clicking it puts the caret in the
 * language slot, so the fence reveals itself and the language can be changed.
 * Without that the language is simply uneditable — visible, but out of reach.
 */
export class FenceChipWidget extends WidgetType {
  constructor(
    readonly language: string,
    readonly languageFrom = -1
  ) {
    super();
  }

  eq(other: FenceChipWidget): boolean {
    return other.language === this.language && other.languageFrom === this.languageFrom;
  }

  toDOM(view: EditorView): HTMLElement {
    const chip = document.createElement('span');
    chip.className = 'md-fence-chip';
    chip.textContent = this.language || 'text';
    chip.title = 'Click to change the language';

    if (this.languageFrom >= 0) {
      chip.addEventListener('mousedown', (event) => {
        event.preventDefault();
        const from = Math.min(this.languageFrom, view.state.doc.length);
        const to = Math.min(from + this.language.length, view.state.doc.length);
        // Select the language so typing replaces it outright.
        view.dispatch({
          selection: to > from ? EditorSelection.range(from, to) : EditorSelection.cursor(from),
          effects: setEditing.of(true),
          scrollIntoView: false
        });
        view.focus();
      });
    }

    return chip;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/**
 * Rendered GFM table. Clicking a cell drops the caret into the corresponding
 * source position, which reveals the raw table for editing (EDITOR-CORE §5).
 */
export class TableWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly from: number
  ) {
    super();
  }

  eq(other: TableWidget): boolean {
    return other.source === this.source;
  }

  /** Keeps the scrollbar honest before the widget is measured. */
  get estimatedHeight(): number {
    const lines = this.source.split('\n').length;
    return Math.max(60, lines * 32 + 12);
  }

  toDOM(view: EditorView): HTMLElement {
    const parsed = parseTable(this.source);
    const wrap = document.createElement('div');
    wrap.className = 'md-table-wrap';

    if (!parsed) {
      // Not a shape we can render: show the source rather than nothing.
      const pre = document.createElement('pre');
      pre.className = 'md-table-src';
      pre.textContent = this.source;
      wrap.appendChild(pre);
      return wrap;
    }

    const table = document.createElement('table');
    table.className = 'md-table';

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    parsed.header.forEach((cell, i) => {
      const th = document.createElement('th');
      applyAlign(th, parsed.align[i] ?? null);
      renderInline(th, cell);
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const row of parsed.rows) {
      const tr = document.createElement('tr');
      row.forEach((cell, i) => {
        const td = document.createElement('td');
        applyAlign(td, parsed.align[i] ?? null);
        renderInline(td, cell);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    // One handler for the whole table: put the caret near what was clicked.
    wrap.addEventListener('mousedown', (event) => {
      event.preventDefault();
      const target = event.target as HTMLElement | null;
      const cell = target?.closest('td, th') as HTMLTableCellElement | null;
      view.dispatch({
        selection: { anchor: this.sourcePosForCell(cell) },
        effects: setEditing.of(true),
        scrollIntoView: false
      });
      view.focus();
    });

    wrap.appendChild(table);
    return wrap;
  }

  /**
   * Map a clicked cell back to an offset inside the table source.
   *
   * Both coordinates matter. Landing on the right line but at its start means
   * clicking the third column drops the caret in the first, and the reader has
   * to find their way back to the cell they were already pointing at.
   */
  private sourcePosForCell(cell: HTMLTableCellElement | null): number {
    if (!cell) return this.from;

    const row = cell.parentElement as HTMLTableRowElement | null;
    const isHeader = cell.tagName === 'TH';
    const bodyIndex = row?.parentElement?.tagName === 'TBODY' ? (row?.rowIndex ?? 1) : 0;

    // Source line: header is line 0, the delimiter is line 1, body starts at 2.
    const lineIndex = isHeader ? 0 : bodyIndex + 1;
    const lines = this.source.split('\n');
    let offset = 0;
    for (let i = 0; i < Math.min(lineIndex, lines.length - 1); i++) {
      offset += (lines[i]?.length ?? 0) + 1;
    }

    const text = lines[Math.min(lineIndex, lines.length - 1)] ?? '';
    const cells = cellsOfRow(text, this.from + offset);
    // A short source row is padded out when rendered, so the rendered table
    // can have columns this line does not.
    const target = cells[Math.min(cell.cellIndex, cells.length - 1)];
    return target ? target.from : this.from + offset;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

function applyAlign(cell: HTMLTableCellElement, align: 'left' | 'center' | 'right' | null): void {
  if (align) cell.style.textAlign = align;
}
