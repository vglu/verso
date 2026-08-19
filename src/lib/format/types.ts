/**
 * The formatter contract.
 *
 * A formatter is a pure function from text to text. That is the whole
 * interface, and it is deliberately the whole interface: the built-in
 * formatters below are written against it, and so will the ones that arrive
 * later as plugins, running in a worker with no DOM, no IPC and no network.
 * An extension point is only real once something real is built on it, so
 * these are built on it first.
 *
 * Returning `null` means "nothing to do" — the document is already formatted,
 * or this formatter does not recognise it. That is not an error, and it must
 * not produce an edit: a no-op that rewrites the file would mark it dirty and
 * cost the reader their undo history for nothing.
 */
export interface FormatContext {
  /** The document's file name, for formatters that key off the extension. */
  fileName: string;
  /** Lower-case extension without the dot: `json`, `csv`, `md`. */
  ext: string;
  /** What the reader has selected, if anything — formatters may ignore it. */
  selection: { from: number; to: number } | null;
  /** The reader's indent preference, in spaces. */
  indent: number;
}

export interface FormatResult {
  text: string;
  /** Shown in the status strip when the formatter wants to say something. */
  note?: string;
}

export interface Formatter {
  /** Stable id, used in settings and menus: `json`, `csv-table`. */
  id: string;
  /** Human title, already translated by the caller. */
  titleKey: string;
  /** Extensions this formatter offers itself for, without the dot. */
  extensions: string[];
  /**
   * Format, or decline. Must not throw: a formatter that cannot make sense of
   * its input returns null, and the document is left exactly as it was.
   */
  format(text: string, context: FormatContext): FormatResult | null;
}

/** A formatter that threw is a broken formatter, not a broken document. */
export function runFormatter(
  formatter: Formatter,
  text: string,
  context: FormatContext
): FormatResult | null {
  try {
    const result = formatter.format(text, context);
    if (!result || result.text === text) return null;
    return result;
  } catch (error) {
    console.warn(`formatter ${formatter.id} failed`, error);
    return null;
  }
}
