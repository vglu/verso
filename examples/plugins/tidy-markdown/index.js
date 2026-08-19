/**
 * Tidy Markdown — a working Verso plugin, and the reference for writing one.
 *
 * The whole contract is the export below: a function that receives the text
 * of a document and returns the text it should become. Return null — or the
 * text unchanged — and nothing happens at all, which is the correct answer
 * far more often than people expect.
 *
 * What this file has access to: its arguments. There is no DOM here, no file
 * system, no network and no way into the application; the plugin runs in a
 * worker for exactly that reason (ADR-004). If you find yourself wanting one
 * of those, the plugin API is not what you want yet — say so in an issue.
 *
 * What it does, in the order that matters:
 *   1. trailing whitespace goes, except the two spaces that mean a line break
 *   2. list markers become one character, consistently
 *   3. ordered lists are renumbered in the order they are actually in
 *   4. three or more blank lines collapse to one
 *   5. the file ends with exactly one newline
 *
 * What it deliberately does not touch: anything inside a fenced code block.
 * Trailing spaces are meaningful in code, and a formatter that "tidies" a
 * shell script inside a fence has broken the document it was asked to help.
 */

/** @typedef {{ fileName: string, ext: string, selection: {from: number, to: number} | null, indent: number }} FormatContext */

const BULLET = '-';

/**
 * @param {string} text  the document, exactly as it is on screen
 * @param {FormatContext} context
 * @returns {{ text: string, note?: string } | string | null}
 */
export function format(text, context) {
  // The manifest already limits this plugin to Markdown, so this is belt and
  // braces — and a demonstration that the context is there when a plugin has
  // to decide something for itself.
  if (!['md', 'markdown', 'mdown', 'mkd'].includes(context.ext)) return null;

  const lines = text.split('\n');
  const out = [];

  let inFence = false;
  let fenceMarker = '';
  let blankRun = 0;
  let touched = 0;

  // Ordered lists are renumbered per indentation level, and the count resets
  // when the list ends — otherwise a second list carries on from the first.
  /** @type {Map<number, number>} */
  const counters = new Map();

  for (const original of lines) {
    let line = original;

    // — fences —
    const fence = line.match(/^\s*(```+|~~~+)/);
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceMarker = fence[1][0];
      } else if (fence[1][0] === fenceMarker) {
        inFence = false;
      }
      out.push(line);
      blankRun = 0;
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }

    // — blank lines —
    if (line.trim() === '') {
      blankRun += 1;
      counters.clear();
      if (blankRun > 1) {
        touched += 1;
        continue;
      }
      out.push('');
      continue;
    }
    blankRun = 0;

    // — trailing whitespace, keeping the hard line break —
    const hardBreak = /\S {2,}$/.test(line);
    const trimmed = hardBreak ? line.replace(/\s+$/, '') + '  ' : line.replace(/\s+$/, '');
    if (trimmed !== line) touched += 1;
    line = trimmed;

    // — list markers —
    const bullet = line.match(/^(\s*)([*+-])(\s+)(.*)$/);
    if (bullet) {
      const [, indent, marker, gap, rest] = bullet;
      if (marker !== BULLET || gap !== ' ') touched += 1;
      out.push(`${indent}${BULLET} ${rest}`);
      counters.delete(indent.length);
      continue;
    }

    const ordered = line.match(/^(\s*)(\d+)([.)])(\s+)(.*)$/);
    if (ordered) {
      const [, indent, , delimiter, gap, rest] = ordered;
      const level = indent.length;
      const n = (counters.get(level) ?? 0) + 1;
      counters.set(level, n);
      const rebuilt = `${indent}${n}${delimiter} ${rest}`;
      if (rebuilt !== line || gap !== ' ') touched += 1;
      out.push(rebuilt);
      continue;
    }

    counters.clear();
    out.push(line);
  }

  // — exactly one newline at the end —
  while (out.length > 0 && out[out.length - 1] === '') out.pop();
  const result = out.join('\n') + '\n';

  if (result === text) return null;
  return { text: result, note: `tidied ${touched} line${touched === 1 ? '' : 's'}` };
}
