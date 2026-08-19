import type { Formatter } from './types';

/**
 * JSON, laid out.
 *
 * `JSON.parse` then `JSON.stringify` is the whole algorithm, and that is the
 * point: the result is exactly what every other tool considers correct, and
 * there is no hand-written printer to disagree with the specification.
 *
 * What it will not do is guess. A file that does not parse is left alone —
 * a formatter that "fixes" broken JSON by dropping the part it could not
 * understand would be a data-loss bug wearing a helpful hat.
 */
export const jsonFormatter: Formatter = {
  id: 'json',
  titleKey: 'format.json',
  extensions: ['json'],

  format(text, context) {
    const trimmed = text.trim();
    if (!trimmed) return null;

    let value: unknown;
    try {
      value = JSON.parse(trimmed);
    } catch {
      return null;
    }

    const indent = Math.min(8, Math.max(0, context.indent));
    const formatted = JSON.stringify(value, null, indent);
    if (typeof formatted !== 'string') return null;

    // The trailing newline is kept if the file had one: whether a file ends
    // with a newline is the file's business, not the formatter's.
    const endsWithNewline = /\n$/.test(text);
    return { text: endsWithNewline ? `${formatted}\n` : formatted };
  }
};

/** The same document with every space the layout does not need removed. */
export const jsonMinifier: Formatter = {
  id: 'json-minify',
  titleKey: 'format.jsonMinify',
  extensions: ['json'],

  format(text) {
    const trimmed = text.trim();
    if (!trimmed) return null;
    try {
      const formatted = JSON.stringify(JSON.parse(trimmed));
      if (typeof formatted !== 'string') return null;
      return { text: /\n$/.test(text) ? `${formatted}\n` : formatted };
    } catch {
      return null;
    }
  }
};
