/**
 * Where the formulas are.
 *
 * Markdown has no math in its grammar, so `$…$` is found by scanning the text
 * — and a `$` in prose is usually money, not mathematics. The rule is KaTeX's
 * own auto-render heuristic: an opening `$` follows a boundary and is followed
 * by something that is not a space; a closing `$` follows something that is
 * not a space and is not followed by a letter or a digit. Without it, "it
 * costs $5 and $7 today" renders as a formula that swallows the words between
 * the two prices.
 *
 * One implementation, used by the live preview and by the exporter. Two would
 * mean a document could render one way on screen and another in the file it
 * was exported to, which is the sort of difference nobody finds until it
 * matters.
 */

export interface InlineMath {
  /** Offsets within the scanned text, including both `$` delimiters. */
  from: number;
  to: number;
  formula: string;
}

export function isMathOpen(prev: string, next: string): boolean {
  if (next === '' || /\s/.test(next)) return false;
  if (prev === '') return true;
  return /[\s(["'“«[{,;:—–-]/.test(prev);
}

export function isMathClose(prev: string, next: string): boolean {
  if (prev === '' || /\s/.test(prev)) return false;
  return !/[0-9A-Za-zЀ-ӿ]/.test(next);
}

/**
 * Every inline formula in a piece of text, in order.
 *
 * `$$` is skipped: display math is a block, and belongs to whoever handles
 * blocks. A formula never crosses a line break.
 */
export function findInlineMath(text: string): InlineMath[] {
  const found: InlineMath[] = [];
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
      i += 2;
      continue;
    }
    if (!isMathOpen(i === 0 ? '' : (text[i - 1] ?? ''), text[i + 1] ?? '')) {
      i += 1;
      continue;
    }

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

    const formula = text.slice(i + 1, close).trim();
    if (formula) found.push({ from: i, to: close + 1, formula });
    i = close + 1;
  }

  return found;
}

/** `$$ x $$` alone on a line — the one-line form of display math. */
export function displayMathOnLine(line: string): string | null {
  const match = /^\$\$(.+)\$\$$/.exec(line.trim());
  return match ? (match[1] ?? '').trim() : null;
}
