import { EditorSelection, type ChangeSpec, type EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { blankRowLike } from './tableNav';

/**
 * Editing commands behind the toolbar and its shortcuts.
 *
 * Every one of them is a plain text transformation on the Markdown source,
 * because the source is what the file holds. Nothing here goes through a
 * document model, so nothing can rewrite parts of the file the user did not
 * touch.
 */

/** Lines the selection covers, inclusive. */
function selectedLines(
  state: EditorState
): { number: number; from: number; to: number; text: string }[] {
  const { from, to } = state.selection.main;
  const first = state.doc.lineAt(from).number;
  const last = state.doc.lineAt(to).number;

  const lines = [];
  for (let n = first; n <= last; n++) {
    const line = state.doc.line(n);
    lines.push({ number: n, from: line.from, to: line.to, text: line.text });
  }
  return lines;
}

const HEADING = /^(\s{0,3})(#{1,6})\s+/;
const BULLET = /^(\s*)([-*+])\s+/;
const ORDERED = /^(\s*)(\d+)\.\s+/;
const TASK = /^(\s*)([-*+])\s+\[[ xX]\]\s+/;
const QUOTE = /^(\s*)>\s?/;

/** Strip whatever block prefix a line already carries. */
function stripPrefix(text: string): string {
  return text
    .replace(TASK, '$1')
    .replace(HEADING, '$1')
    .replace(ORDERED, '$1')
    .replace(BULLET, '$1');
}

function applyToLines(
  view: EditorView,
  transform: (text: string) => string,
  userEvent = 'input.format'
): boolean {
  const changes: ChangeSpec[] = [];
  for (const line of selectedLines(view.state)) {
    const next = transform(line.text);
    if (next !== line.text) changes.push({ from: line.from, to: line.to, insert: next });
  }
  if (changes.length === 0) return false;
  view.dispatch({ changes, userEvent });
  return true;
}

/** `#` … `######`, or back to a paragraph when the level already matches. */
export function setHeading(view: EditorView, level: 1 | 2 | 3 | 4 | 5 | 6): boolean {
  const current = HEADING.exec(view.state.doc.lineAt(view.state.selection.main.head).text);
  const alreadyThisLevel = current?.[2]?.length === level;

  return applyToLines(view, (text) => {
    const body = stripPrefix(text).replace(QUOTE, '$1');
    if (alreadyThisLevel) return body;
    return `${'#'.repeat(level)} ${body.trimStart()}`;
  });
}

export type ListKind = 'bullet' | 'ordered' | 'task';

export function toggleList(view: EditorView, kind: ListKind): boolean {
  const lines = selectedLines(view.state);
  const matcher = kind === 'bullet' ? BULLET : kind === 'ordered' ? ORDERED : TASK;
  // Turning a list off only when every line is already that kind keeps a mixed
  // selection moving in one direction instead of flip-flopping line by line.
  const allMatch = lines.every((l) => matcher.test(l.text));

  let counter = 0;
  return applyToLines(view, (text) => {
    if (allMatch) return stripPrefix(text);
    const body = stripPrefix(text).trimStart();
    counter += 1;
    if (kind === 'bullet') return `- ${body}`;
    if (kind === 'ordered') return `${counter}. ${body}`;
    return `- [ ] ${body}`;
  });
}

export function toggleQuote(view: EditorView): boolean {
  const lines = selectedLines(view.state);
  const allQuoted = lines.every((l) => QUOTE.test(l.text));
  return applyToLines(view, (text) => (allQuoted ? text.replace(QUOTE, '$1') : `> ${text}`));
}

/** Insert text, then place the caret where the user has to type next. */
function insertTemplate(
  view: EditorView,
  build: (selected: string) => { text: string; caret: number; length?: number }
): boolean {
  const range = view.state.selection.main;
  const selected = view.state.doc.sliceString(range.from, range.to);
  const { text, caret, length = 0 } = build(selected);

  view.dispatch({
    changes: { from: range.from, to: range.to, insert: text },
    // A template that comes with placeholder text selects it, so the first
    // keystroke replaces the placeholder instead of typing next to it.
    selection:
      length > 0
        ? EditorSelection.range(range.from + caret, range.from + caret + length)
        : EditorSelection.cursor(range.from + caret),
    userEvent: 'input.insert',
    scrollIntoView: true
  });
  view.focus();
  return true;
}

export function insertImage(view: EditorView): boolean {
  return insertTemplate(view, (selected) => {
    const alt = selected || 'alt';
    const text = `![${alt}]()`;
    return { text, caret: text.length - 1 };
  });
}

/** A block needs blank lines around it, or Markdown folds it into a paragraph. */
function blockPadding(state: EditorState, from: number): { before: string; after: string } {
  const line = state.doc.lineAt(from);
  const before = line.from === from && line.text.length === 0 ? '' : '\n';
  const nextLine = line.number < state.doc.lines ? state.doc.line(line.number + 1) : null;
  const after = nextLine && nextLine.text.length === 0 ? '' : '\n';
  return { before, after };
}

/** A fresh table, already aligned, with the first column name selected. */
export function insertTable(view: EditorView, columns = 3, rows = 2): boolean {
  const { before, after } = blockPadding(view.state, view.state.selection.main.from);

  const names = Array.from({ length: columns }, (_, i) => `Column ${i + 1}`);
  const header = `| ${names.join(' | ')} |`;
  // Dashes as wide as the names, and empty rows with the pipes in the same
  // columns: an inserted table should already look like one in the source.
  const divider = `| ${names.map((n) => '-'.repeat(n.length)).join(' | ')} |`;
  const body = Array.from({ length: rows }, () => blankRowLike(header)).join('\n');

  const text = `${before}${header}\n${divider}\n${body}\n${after}`;
  // The first header name is selected: it is the first thing anyone renames,
  // and Tab from there walks the rest of the table the same way.
  return insertTemplate(view, () => ({
    text,
    caret: before.length + 2,
    length: 'Column 1'.length
  }));
}

export function insertCodeBlock(view: EditorView, language = ''): boolean {
  const range = view.state.selection.main;
  const selected = view.state.doc.sliceString(range.from, range.to);
  const { before, after } = blockPadding(view.state, range.from);

  return insertTemplate(view, () => {
    const body = selected || '';
    const text = `${before}\`\`\`${language}\n${body}\n\`\`\`${after}`;
    // Caret on the language slot when empty, otherwise at the start of the code.
    const caret = language ? before.length + 3 + language.length + 1 : before.length + 3;
    return { text, caret };
  });
}

export function insertRule(view: EditorView): boolean {
  const { before, after } = blockPadding(view.state, view.state.selection.main.from);
  const text = `${before}---\n${after}`;
  return insertTemplate(view, () => ({ text, caret: text.length }));
}

export function insertMath(view: EditorView): boolean {
  const { before, after } = blockPadding(view.state, view.state.selection.main.from);
  return insertTemplate(view, (selected) => {
    const text = `${before}$$\n${selected}\n$$${after}`;
    return { text, caret: before.length + 3 + selected.length };
  });
}

export function insertDiagram(view: EditorView): boolean {
  const { before, after } = blockPadding(view.state, view.state.selection.main.from);
  const body = 'graph TD\n  A[Start] --> B[Finish]';
  const text = `${before}\`\`\`mermaid\n${body}\n\`\`\`${after}`;
  return insertTemplate(view, () => ({ text, caret: before.length + 11 }));
}

/** Which formatting the caret currently sits in — drives the toolbar's state. */
export interface FormatState {
  heading: number;
  bullet: boolean;
  ordered: boolean;
  task: boolean;
  quote: boolean;
  bold: boolean;
  italic: boolean;
  code: boolean;
}

export function formatStateAt(state: EditorState): FormatState {
  const line = state.doc.lineAt(state.selection.main.head);
  const heading = HEADING.exec(line.text);
  const around = state.doc.sliceString(
    Math.max(0, state.selection.main.from - 2),
    Math.min(state.doc.length, state.selection.main.to + 2)
  );

  return {
    heading: heading ? (heading[2]?.length ?? 0) : 0,
    bullet: BULLET.test(line.text) && !TASK.test(line.text),
    ordered: ORDERED.test(line.text),
    task: TASK.test(line.text),
    quote: QUOTE.test(line.text),
    bold: around.startsWith('**') && around.endsWith('**'),
    italic: /^\*[^*]/.test(around) && /[^*]\*$/.test(around),
    code: around.startsWith('`') && around.endsWith('`')
  };
}
