import type { EditorState } from '@codemirror/state';

/**
 * YAML front matter — the `---` fenced block that opens a file in Obsidian,
 * Jekyll, Hugo and most static site generators.
 *
 * Markdown has no such thing, so the parser does not either: it reads the
 * opening `---` as a horizontal rule, and the closing one as the underline of
 * a setext heading. That is not a cosmetic problem. `title: Something` above a
 * `---` becomes a level-2 heading, so the outline of every note with front
 * matter opened with a line of metadata pretending to be a section.
 *
 * Recognised only at the very start of the document, which is the only place
 * it is front matter rather than a rule followed by text.
 */

/** How far to look for the closing delimiter before giving up. */
const MAX_LINES = 400;

export interface FrontmatterRange {
  from: number;
  to: number;
  /** Line numbers of the opening and closing delimiters. */
  firstLine: number;
  lastLine: number;
}

export function frontmatterRange(state: EditorState): FrontmatterRange | null {
  const first = state.doc.line(1);
  if (!/^---\s*$/.test(first.text)) return null;

  const limit = Math.min(state.doc.lines, MAX_LINES);
  for (let n = 2; n <= limit; n++) {
    const line = state.doc.line(n);
    // `...` closes a YAML document too, and both spellings appear in the wild.
    if (/^(---|\.\.\.)\s*$/.test(line.text)) {
      return { from: first.from, to: line.to, firstLine: 1, lastLine: n };
    }
  }

  // An opening delimiter with no closing one is a horizontal rule, not front
  // matter — treating it as metadata would grey out the whole document.
  return null;
}

/**
 * Whether a syntax node lies inside the front matter.
 *
 * Containment, not a position test: the document node itself starts at zero,
 * and asking only about its start says the whole file is metadata.
 */
export function isInFrontmatter(range: FrontmatterRange | null, from: number, to: number): boolean {
  return range !== null && from >= range.from && to <= range.to;
}
