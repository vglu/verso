import { csvToMarkdownTable } from './csv';
import { jsonFormatter, jsonMinifier } from './json';
import { runFormatter, type FormatContext, type Formatter } from './types';
import { plugins } from '../plugins/registry.svelte';

export type { FormatContext, FormatResult, Formatter } from './types';
export { runFormatter } from './types';

/**
 * Everything that can format something, in the order it should be offered.
 *
 * The list is the seam plugins will extend: a plugin contributes formatters
 * with the same shape, and nothing else in the application needs to know
 * whether a formatter was built in or loaded from disk.
 */
const BUILT_IN: Formatter[] = [jsonFormatter, jsonMinifier, csvToMarkdownTable];

export function allFormatters(): Formatter[] {
  return [...BUILT_IN];
}

/** The formatters that offer themselves for this file, best first. */
export function formattersFor(ext: string): Formatter[] {
  const lower = ext.toLowerCase().replace(/^\./, '');
  return allFormatters().filter((f) => f.extensions.includes(lower));
}

export function contextFor(
  fileName: string,
  selection: { from: number; to: number } | null
): FormatContext {
  const ext = (fileName.split('.').pop() ?? '').toLowerCase();
  return { fileName, ext, selection, indent: 2 };
}

/**
 * Format with the first formatter that has something to say.
 *
 * Built-ins are asked first and answer instantly; plugins follow, and they
 * answer from a worker, which is why this is asynchronous even when nothing
 * asynchronous happens.
 *
 * Returns null when nothing applies — no formatter for this file type, or the
 * document is already as they would leave it. The caller must then do nothing
 * at all: an edit that changes no text still costs a place in the undo
 * history and marks a clean file dirty.
 */
export async function formatDocument(
  text: string,
  fileName: string,
  selection: { from: number; to: number } | null = null
): Promise<{ text: string; note?: string; by: string } | null> {
  const context = contextFor(fileName, selection);

  for (const formatter of formattersFor(context.ext)) {
    const result = runFormatter(formatter, text, context);
    if (result) return { ...result, by: formatter.id };
  }

  for (const plugin of plugins.formattersFor(context.ext)) {
    const result = await plugins.format(plugin, text, context);
    if (result) return { ...result, by: plugin.manifest.name };
  }

  return null;
}
